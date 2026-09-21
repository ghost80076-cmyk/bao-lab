import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

function fixture(tokenHash) {
  const player = { id: '22222222-2222-4222-8222-222222222222', token_hash: tokenHash,
    balance_microusd: 10000, daily_chat_limit: 1, enabled: 1 };
  const usage = [];
  function execute(sql, params) {
    if (sql.startsWith('SELECT id, balance_microusd, daily_chat_limit, enabled FROM players')) return params[0] === player.token_hash ? player : null;
    if (sql.startsWith('INSERT INTO api_usage')) {
      usage.push({ id: params[0], status: 'pending' });
      return { meta: { changes: 1 } };
    }
    if (sql.includes('SET balance_microusd = balance_microusd -')) {
      player.balance_microusd -= params[0];
      return { meta: { changes: 1 } };
    }
    if (sql.includes('SET balance_microusd = balance_microusd +')) {
      player.balance_microusd += params[0];
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith('UPDATE api_usage SET status')) {
      usage.find(row => row.id === params[0]).status = 'failed';
      return { meta: { changes: 1 } };
    }
    throw new Error(`Unexpected fake SQL: ${sql}`);
  }
  const db = {
    prepare(sql) { return { bind(...params) { return { first: async () => execute(sql, params),
      run: async () => execute(sql, params), _call: () => execute(sql, params) }; } }; },
    async batch(queries) { return queries.map(query => query._call()); }
  };
  return { db, player, usage };
}

test('Google 400 surfaces only allowlisted hint, not private error content; reservation refunded', async () => {
  const token = 'bao_' + 'A'.repeat(43);
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
  const { db, player, usage } = fixture(hash);
  const env = { DB: db, GEMINI_API_KEY: 'fake-provider-key',
    MODELS_JSON: JSON.stringify([{ provider: 'gemini', model: 'gemini-3-flash-preview' }]) };
  const req = () => new Request('https://pilot.invalid/chat', { method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ provider: 'gemini', model: 'gemini-3-flash-preview',
      messages: [{ role: 'user', content: 'hello' }], max_output_tokens: 1024 }) });
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: { status: 'INVALID_ARGUMENT',
      message: 'GenerateContentRequest.contents[1].role invalid. PRIVATE_STORY_AND_SECRET' } }, { status: 400 });
  };
  try {
    const response = await worker.fetch(req(), env);
    assert.equal(response.status, 502);
    const data = await response.json();
    assert.equal(data.error, 'google_bad_request_message_format');
    assert.equal(data.upstream_http_status, 400);
    assert.ok(!JSON.stringify(data).includes('PRIVATE_STORY_AND_SECRET'));
    assert.equal(player.balance_microusd, 10000);
    assert.equal(usage[0].status, 'failed');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = originalFetch; }
});