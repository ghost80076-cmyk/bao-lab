import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function fakeDb() {
  const players = [];
  const usage = [];
  function execute(sql, params, kind) {
    if (sql.startsWith('SELECT id FROM players LIMIT 1')) return null;
    if (sql.startsWith('SELECT id, balance_microusd, daily_chat_limit, enabled FROM players WHERE token_hash'))
      return players.find(p => p.token_hash === params[0]) ?? null;
    if (sql.startsWith('INSERT INTO players')) {
      players.push({ id: params[0], token_hash: params[1], balance_microusd: params[2], daily_chat_limit: params[3], enabled: 1 });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('SELECT COUNT(*) AS n'))
      return { n: usage.filter(u => u.player_id === params[0] && u.request_kind === 'chat' && ['pending','ok','unverified'].includes(u.status)).length };
    if (sql.startsWith('INSERT INTO api_usage')) {
      const [request_id, provider, model, request_kind, player_id, reserve] = params;
      const p = players.find(x => x.id === player_id);
      const count = usage.filter(u => u.player_id === player_id && u.request_kind === request_kind && ['pending','ok','unverified'].includes(u.status)).length;
      const allowed = p && p.enabled && p.balance_microusd >= reserve && count < (request_kind === 'chat' ? p.daily_chat_limit : 50);
      if (allowed) usage.push({ request_id, player_id, provider, model, request_kind, status: 'pending' });
      return { meta: { changes: allowed ? 1 : 0 } };
    }
    if (sql.includes('SET balance_microusd = balance_microusd -')) {
      const [amount, id, min, requestId] = params;
      const p = players.find(x => x.id === id);
      const allowed = p && p.balance_microusd >= min && usage.some(u => u.request_id === requestId && u.status === 'pending');
      if (allowed) p.balance_microusd -= amount;
      return { meta: { changes: allowed ? 1 : 0 } };
    }
    if (sql.includes('SET balance_microusd = balance_microusd +') && sql.includes('AND balance_microusd <=')) {
      const [amount, id] = params;
      const p = players.find(x => x.id === id);
      if (p) p.balance_microusd += amount;
      return { meta: { changes: p ? 1 : 0 } };
    }
    if (sql.includes('SET balance_microusd = balance_microusd +')) {
      const [amount, id] = params;
      const p = players.find(x => x.id === id);
      if (p) p.balance_microusd += amount;
      return { meta: { changes: p ? 1 : 0 } };
    }
    if (sql.startsWith('UPDATE api_usage SET input_tokens')) {
      const [input_tokens, output_tokens, cost_microusd, status, id] = params;
      const row = usage.find(u => u.request_id === id);
      Object.assign(row, { input_tokens, output_tokens, cost_microusd, status });
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("UPDATE api_usage SET status")) {
      const row = usage.find(u => u.request_id === params[0]);
      if (row) row.status = sql.includes('denied') ? 'denied' : 'failed';
      return { meta: { changes: row ? 1 : 0 } };
    }
    if (sql.startsWith('UPDATE players SET enabled')) {
      const p = players.find(x => x.id === params[0]);
      if (p) p.enabled = 0;
      return { meta: { changes: p ? 1 : 0 } };
    }
    if (sql.startsWith('SELECT id, balance_microusd, daily_chat_limit, enabled, created_at FROM players'))
      return { results: players.map(({ token_hash, ...p }) => p) };
    if (sql.startsWith('SELECT request_id, provider, model, request_kind, input_tokens'))
      return { results: usage.filter(u => u.player_id === params[0]) };
    throw new Error(`Unexpected mock SQL: ${sql}`);
  }
  const db = {
    prepare(sql) {
      return { bind(...params) { return { run: async () => execute(sql, params, 'run'), first: async () => execute(sql, params, 'first'), all: async () => execute(sql, params, 'all'), _call: () => execute(sql, params, 'run') }; },
        first: async () => execute(sql, [], 'first') };
    },
    async batch(statements) { return statements.map(s => s._call()); }
  };
  return { db, players, usage };
}
const base = 'https://bao-lab-credits-api.example.test';
const request = (path, method = 'GET', body, token, origin) => new Request(base + path, {
  method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}),
    ...(origin ? { origin } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {})
});
const envFor = db => ({ '資料庫': db, ADMIN_TOKEN: 'admin-secret', ALLOWED_ORIGIN: 'https://bao.example',
  MODELS_JSON: JSON.stringify([{ provider: 'openrouter', model: 'example/test', input_microusd_per_million: 1000000, output_microusd_per_million: 1000000 }]),
  OPENROUTER_API_KEY: 'test-key' });

 test('fail closed when D1 is missing', async () => {
  const r = await worker.fetch(request('/health'), {});
  assert.equal(r.status, 503);
});
 test('health checks the players table', async () => {
  const { db } = fakeDb();
  const r = await worker.fetch(request('/health'), envFor(db));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});
 test('reject cross-origin browsers and unauthenticated admin calls', async () => {
  const { db } = fakeDb(); const env = envFor(db);
  assert.equal((await worker.fetch(request('/health', 'GET', null, null, 'https://evil.test'), env)).status, 403);
  assert.equal((await worker.fetch(request('/admin/players'), env)).status, 401);
});
 test('provision player, bill one request, enforce quota, and disable player', async () => {
  const { db, players, usage } = fakeDb(); const env = envFor(db);
  const created = await worker.fetch(request('/admin/players', 'POST', { balance_microusd: 1000000, daily_chat_limit: 1 }, 'admin-secret'), env);
  assert.equal(created.status, 201);
  const { player_id, player_token } = await created.json();
  assert.ok(player_token.startsWith('bao_'));
  assert.ok(!JSON.stringify(players).includes(player_token));
  const body = { provider: 'openrouter', model: 'example/test', request_kind: 'chat', messages: [{ role: 'user', content: 'Hi' }] };
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    upstreamCalls++;
    assert.equal(init.headers.authorization, 'Bearer test-key');
    return Response.json({ choices: [{ message: { content: 'Hello' } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.000015 } });
  };
  try {
    assert.equal((await worker.fetch(request('/chat', 'POST', { ...body, model: 'not-approved' }, player_token), env)).status, 400);
    const r = await worker.fetch(request('/chat', 'POST', body, player_token), env);
    assert.equal(r.status, 200);
    const reply = await r.json();
    assert.equal(reply.content, 'Hello');
    assert.equal(reply.usage.charged_microusd, 15);
    assert.equal(players[0].balance_microusd, 999985);
    assert.equal(usage[0].status, 'ok');
    assert.equal(upstreamCalls, 1);
    const me = await (await worker.fetch(request('/me', 'GET', null, player_token), env)).json();
    assert.equal(me.chat_used_today_utc, 1);
    assert.equal((await worker.fetch(request('/chat', 'POST', body, player_token), env)).status, 429);
    assert.equal(upstreamCalls, 1);
    assert.equal((await worker.fetch(request(`/admin/players/${player_id}/disable`, 'POST', {}, 'admin-secret'), env)).status, 200);
    assert.equal((await worker.fetch(request('/me', 'GET', null, player_token), env)).status, 401);
  } finally { globalThis.fetch = originalFetch; }
});
