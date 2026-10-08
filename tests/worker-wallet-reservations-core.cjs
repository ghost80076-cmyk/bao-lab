const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

// Execute the production SQL against SQLite, including transaction rollback.
const sqlite = new DatabaseSync(':memory:');
let failLedger = false;
const db = {
  prepare(sql) {
    let values = [];
    const query = {
      bind(...args) { values = args; return query; },
      async first() { return sqlite.prepare(sql).get(...values) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...values) }; },
      async run() {
        if (failLedger && sql.includes('INSERT INTO wallet_ledger')) {
          throw new Error('injected ledger failure');
        }
        const result = sqlite.prepare(sql).run(...values);
        return { meta: { changes: Number(result.changes) } };
      },
    };
    return query;
  },
  async batch(queries) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const query of queries) results.push(await query.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
  },
};
sqlite.exec(`
  CREATE TABLE wallets(player_id TEXT PRIMARY KEY, balance_microusd INTEGER,
    enabled INTEGER, updated_at TEXT);
  CREATE TABLE api_usage(request_id TEXT PRIMARY KEY, player_id TEXT, status TEXT,
    billing_mode TEXT, pricing_version TEXT, provider TEXT, model TEXT,
    input_tokens INTEGER, fresh_input_tokens INTEGER, cached_tokens INTEGER,
    cache_write_tokens INTEGER, output_tokens INTEGER, reasoning_tokens INTEGER,
    provider_cost_microusd INTEGER, cost_microusd INTEGER, settled_cost_microusd INTEGER,
    balance_before_microusd INTEGER, balance_after_microusd INTEGER);
  CREATE TABLE wallet_ledger(ledger_id TEXT PRIMARY KEY, player_id TEXT, entry_type TEXT,
    amount_microusd INTEGER, balance_before_microusd INTEGER, balance_after_microusd INTEGER,
    request_id TEXT UNIQUE, reference_id TEXT, note TEXT);
  INSERT INTO wallets VALUES ('p', 1000, 1, NULL);
`);
const balance = () => sqlite.prepare('SELECT balance_microusd AS b FROM wallets').get().b;
function pending(id) {
  sqlite.prepare(`INSERT INTO api_usage(request_id, player_id, status, billing_mode,
    pricing_version, provider, model) VALUES (?, 'p', 'pending', 'cost_usd_v2', 'v1', 'g', 'm')`).run(id);
}

(async () => {
  const { ensureWalletReservations, reserveWallet, settleWallet, recoverExpiredWalletReservations } =
    await import(pathToFileURL(path.join(__dirname,
      '../workers/bao-lab-credits-api/modules/wallet-reservations.js')).href);
  await ensureWalletReservations(db);
  await ensureWalletReservations(db);
  const settle = (requestId, actualCost, extra = {}) => settleWallet(db, {
    requestId, playerId: 'p', actualCost, billingMode: 'cost_usd_v2',
    pricingVersion: 'v1', provider: 'g', model: 'm', ...extra,
  });
  pending('a'); pending('b');
  assert.equal(await reserveWallet(db, 'a', 'p', 200), true);
  assert.equal(await reserveWallet(db, 'a', 'p', 200), false);
  assert.equal(await reserveWallet(db, 'b', 'p', 300), true);
  assert.equal(balance(), 500);
  let result = await settle('a', 150);
  assert.equal(result.charged_microusd, 150);
  assert.equal(balance(), 550);
  await settle('a', 150); // Retried settlement cannot debit or add a ledger twice.
  assert.equal(balance(), 550);
  result = await settle('b', 350);
  assert.equal(balance(), 500);
  assert.equal(result.balance_before_microusd - result.balance_after_microusd, 350);
  assert.equal(sqlite.prepare('SELECT SUM(amount_microusd) AS n FROM wallet_ledger').get().n, -500);

  pending('denied');
  assert.equal(await reserveWallet(db, 'denied', 'p', 501), false);
  assert.equal(balance(), 500);
  pending('free');
  assert.equal(await reserveWallet(db, 'free', 'p', 0), true);
  await settle('free', 0);
  assert.equal(balance(), 500);

  pending('rollback');
  await reserveWallet(db, 'rollback', 'p', 100);
  failLedger = true;
  await assert.rejects(settle('rollback', 50), /injected ledger failure/);
  assert.equal(balance(), 400);
  assert.equal(sqlite.prepare("SELECT state FROM wallet_reservations WHERE request_id='rollback'").get().state, 'held');
  assert.equal(sqlite.prepare("SELECT status FROM api_usage WHERE request_id='rollback'").get().status, 'pending');
  failLedger = false;
  await settle('rollback', 0, { refund: true, status: 'failed' });
  await settle('rollback', 0, { refund: true, status: 'failed' });
  assert.equal(balance(), 500);

  pending('expired'); pending('active'); pending('historical');
  await reserveWallet(db, 'expired', 'p', 80);
  await reserveWallet(db, 'active', 'p', 20);
  sqlite.exec("UPDATE wallet_reservations SET created_at=datetime('now','-31 minutes') WHERE request_id='expired'");
  await recoverExpiredWalletReservations(db, 'p');
  await recoverExpiredWalletReservations(db, 'p');
  assert.equal(balance(), 480);
  assert.equal(sqlite.prepare("SELECT status FROM api_usage WHERE request_id='historical'").get().status, 'pending');
  assert.equal(sqlite.prepare("SELECT state FROM wallet_reservations WHERE request_id='active'").get().state, 'held');
  result = await settle('expired', 60); // A late provider response cannot charge after recovery.
  assert.equal(result.state, 'refunded');
  assert.equal(balance(), 480);
  await settle('active', 0, { refund: true, status: 'unverified_refunded' });
  pending('over');
  await reserveWallet(db, 'over', 'p', 100);
  result = await settle('over', 900);
  assert.equal(result.charged_microusd, 500);
  assert.equal(result.settlement_status, 'over_budget');
  assert.equal(balance(), 0);
  assert.equal(sqlite.prepare('SELECT SUM(amount_microusd) AS n FROM wallet_ledger').get().n, -1000);

  // Exercise the real route and Gemini relay parser, without external calls.
  sqlite.exec(`ALTER TABLE api_usage ADD COLUMN request_kind TEXT;
    UPDATE wallets SET balance_microusd = 1000`);
  const { costUsdChatRoute } = await import(pathToFileURL(path.join(__dirname,
    '../workers/bao-lab-credits-api/modules/cost-chat-settlement.js')).href);
  const env = {
    AWS_RELAY_URL: 'https://relay.test', BAO_INTERNAL_TOKEN: 'test-only',
    MODELS_JSON: JSON.stringify([{ provider: 'gemini', model: 'test-model',
      input_microusd_per_million: 1000000, output_microusd_per_million: 2000000 }]),
  };
  const player = { id: 'p', wallet_enabled: 1, wallet_balance_microusd: 1000 };
  const body = { provider: 'gemini', model: 'test-model', max_output_tokens: 100,
    messages: [{ role: 'user', content: 'hello' }] };
  const call = async () => {
    const response = await costUsdChatRoute(new Request('https://worker.test/v1/chat'), env, db, player, body);
    return { status: response.status, body: await response.json() };
  };
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => Response.json({
      candidates: [{ content: { parts: [{ text: 'OK' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10, totalTokenCount: 20 },
    });
    let response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.body.usage.charged_microusd, 30);
    assert.equal(response.body.usage.wallet_balance_microusd, 970);
    assert.equal(balance(), 970);
    global.fetch = async () => Response.json({
      candidates: [{ content: { parts: [{ text: 'OK' }] } }],
    });
    response = await call();
    assert.equal(response.status, 200);
    assert.equal(response.body.usage.settlement_status, 'unverified_refunded');
    assert.equal(balance(), 970);
    assert.equal(response.body.usage.wallet_balance_microusd, 970);
    global.fetch = async () => { throw new Error('network interruption'); };
    response = await call();
    assert.equal(response.status, 502);
    assert.equal(response.body.billing_refunded, true);
    assert.equal(balance(), 970);
    delete env.BAO_INTERNAL_TOKEN;
    response = await call();
    assert.equal(response.status, 502);
    assert.equal(balance(), 970);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM wallet_reservations WHERE state='held'").get().n, 0);
  } finally { global.fetch = originalFetch; }
  console.log('wallet reservation SQL transaction tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
