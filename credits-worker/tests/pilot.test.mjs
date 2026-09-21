import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function fakeDb() {
  const players = [], usage = [];
  function execute(sql, params) {
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
      const allowed = p && p.enabled && p.balance_microusd >= reserve;
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
    if (sql.startsWith('UPDATE api_usage SET status')) {
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
      return { bind(...params) { return { run: async () => execute(sql, params), first: async () => execute(sql, params), all: async () => execute(sql, params), _call: () => execute(sql, params) }; },
        first: async () => execute(sql, []) };
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
  MODELS_JSON: JSON.stringify([{ provider: 'gemini', model: 'gemini-test', input_microusd_per_million: 0, output_microusd_per_million: 0 }]),
  GEMINI_API_KEY: 'test-key' });
const body = { provider: 'gemini', model: 'gemini-test', request_kind: 'chat',
  messages: [{ role: 'user', content: 'Hi' }], max_output_tokens: 1024 };
async function makePlayer(env, balance_credits = 10000) {
  const response = await worker.fetch(request('/admin/players', 'POST', { balance_credits, daily_chat_limit: 1 }, 'admin-secret'), env);
  assert.equal(response.status, 201);
  return response.json();
}
test('D1 binding and origin/auth checks still fail closed', async () => {
  assert.equal((await worker.fetch(request('/health'), {})).status, 503);
  const { db } = fakeDb(), env = envFor(db);
  const health = await (await worker.fetch(request('/health'), env)).json();
  assert.equal(health.daily_chat_limit_enabled, false);
  assert.equal((await worker.fetch(request('/health', 'GET', null, null, 'https://evil.test'), env)).status, 403);
  assert.equal((await worker.fetch(request('/admin/players'), env)).status, 401);
});
test('one virtual credit per 100 tokens, old one-chat limit ignored, top up and disable', async () => {
  const { db, players, usage } = fakeDb(), env = envFor(db);
  const { player_id, player_token } = await makePlayer(env);
  assert.ok(player_token.startsWith('bao_'));
  assert.ok(!JSON.stringify(players).includes(player_token));
  let upstreamCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    upstreamCalls++;
    assert.equal(init.headers['x-goog-api-key'], 'test-key');
    return Response.json({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }],
      usageMetadata: { promptTokenCount: 250, totalTokenCount: 610, thoughtsTokenCount: 200 } });
  };
  try {
    assert.equal((await worker.fetch(request('/chat', 'POST', { ...body, model: 'not-approved' }, player_token), env)).status, 400);
    for (let i = 0; i < 3; i++) {
      const r = await worker.fetch(request('/chat', 'POST', body, player_token), env);
      assert.equal(r.status, 200);
      const reply = await r.json();
      assert.equal(reply.content, 'Hello');
      assert.equal(reply.usage.charged_credits, 7);
      assert.equal(reply.usage.credit_unit, '100_tokens');
    }
    assert.equal(players[0].balance_microusd, 9979);
    assert.equal(usage.length, 3);
    assert.equal(upstreamCalls, 3);
    const me = await (await worker.fetch(request('/me', 'GET', null, player_token), env)).json();
    assert.equal(me.daily_chat_limit, null);
    assert.equal(me.chat_used_today_utc, 3);
    assert.equal(me.balance_credits, 9979);
    const credit = await worker.fetch(request(`/admin/players/${player_id}/credit`, 'POST', { amount_credits: 21 }, 'admin-secret'), env);
    assert.equal(credit.status, 200);
    assert.equal(players[0].balance_microusd, 10000);
    assert.equal((await worker.fetch(request(`/admin/players/${player_id}/disable`, 'POST', {}, 'admin-secret'), env)).status, 200);
    assert.equal((await worker.fetch(request('/me', 'GET', null, player_token), env)).status, 401);
  } finally { globalThis.fetch = originalFetch; }
});
test('credit shortage is distinct from provider 429 and failed provider call refunds reserve', async () => {
  const { db, players, usage } = fakeDb(), env = envFor(db);
  const { player_token } = await makePlayer(env, 100);
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => { upstreamCalls++; return new Response('{}', { status: 429 }); };
  try {
    const first = await worker.fetch(request('/chat', 'POST', body, player_token), env);
    assert.equal(first.status, 502);
    const error = await first.json();
    assert.equal(error.error, 'provider_rate_limited');
    assert.equal(error.upstream_http_status, 429);
    assert.equal(players[0].balance_microusd, 100);
    assert.equal(usage[0].status, 'failed');
    assert.equal(upstreamCalls, 1);
    const huge = await worker.fetch(request('/chat', 'POST', {
      ...body, messages: [{ role: 'user', content: '長篇'.repeat(15000) }], max_output_tokens: 8192
    }, player_token), env);
    assert.equal(huge.status, 402);
    assert.equal((await huge.json()).error, 'insufficient_credits');
    assert.equal(upstreamCalls, 1);
  } finally { globalThis.fetch = originalFetch; }
});
test('larger world prompt is accepted and empty model output reports finish reason without leaking prompts', async () => {
  const { db, players } = fakeDb(), env = envFor(db);
  const { player_token } = await makePlayer(env);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }],
    usageMetadata: { promptTokenCount: 100, totalTokenCount: 1024, thoughtsTokenCount: 924 } });
  try {
    const prompt = '背景'.repeat(14500);
    const response = await worker.fetch(request('/chat', 'POST', { ...body,
      messages: [{ role: 'user', content: prompt }], max_output_tokens: 2048 }, player_token), env);
    assert.equal(response.status, 502);
    const diagnostic = await response.json();
    assert.equal(diagnostic.error, 'provider_empty_text');
    assert.equal(diagnostic.finish_reason, 'MAX_TOKENS');
    assert.ok(!JSON.stringify(diagnostic).includes(prompt.slice(0, 50)));
    assert.equal(players[0].balance_microusd, 10000);
  } finally { globalThis.fetch = originalFetch; }
});
