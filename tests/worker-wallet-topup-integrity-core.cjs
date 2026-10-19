const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const sqlite = new DatabaseSync(':memory:');
let failLedger = false;
const db = {
  prepare(sql) {
    let args = [];
    const query = {
      bind(...values) { args = values; return query; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async all() { return { results: sqlite.prepare(sql).all(...args) }; },
      async run() {
        if (failLedger && sql.includes('INSERT INTO wallet_ledger')) {
          throw new Error('injected ledger failure');
        }
        const result = sqlite.prepare(sql).run(...args);
        return { meta: { changes: Number(result.changes) } };
      },
    };
    return query;
  },
  async batch(queries) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const query of queries) results.push(await query.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  },
};
const playerId = '11111111-1111-4111-8111-111111111111';
sqlite.exec(`CREATE TABLE wallets (
  player_id TEXT PRIMARY KEY, balance_microusd INTEGER NOT NULL,
  enabled INTEGER NOT NULL, updated_at TEXT
);
CREATE TABLE wallet_topups (
  topup_id TEXT PRIMARY KEY, player_id TEXT,
  payment_amount_microusd INTEGER, credit_added_microusd INTEGER,
  payment_method TEXT, payment_reference TEXT, note TEXT,
  payment_amount_minor INTEGER, payment_currency TEXT,
  processor_fee_minor INTEGER, net_received_minor INTEGER
);
CREATE TABLE wallet_ledger (
  ledger_id TEXT PRIMARY KEY, player_id TEXT, entry_type TEXT,
  amount_microusd INTEGER, balance_before_microusd INTEGER,
  balance_after_microusd INTEGER, reference_id TEXT UNIQUE, note TEXT
);
INSERT INTO wallets VALUES ('\${playerId}', 1000, 1, NULL);`.replace('\${playerId}', playerId));
const rows = table => sqlite.prepare(`SELECT COUNT(*) n FROM \${table}`).get().n;
const balance = () => sqlite.prepare('SELECT balance_microusd b FROM wallets').get().b;
const id = n => `00000000-0000-4000-8000-\${String(n).padStart(12, '0')}`;
const creditRequest = (requestKey, overrides = {}) => ({
  idempotency_key: requestKey, credit_added_microusd: 500,
  payment_currency: 'TWD', payment_amount_minor: 25000,
  processor_fee_minor: 0, net_received_minor: 25000,
  payment_method: 'manual-bank', payment_reference: 'bank-txn-1',
  note: 'manual topup', ...overrides,
});
(async () => {
  const { adminPlayerMutationRoute } = await import(pathToFileURL(path.join(
    __dirname, '../workers/bao-lab-credits-api/modules/admin-player-mutation-routes.js'
  )).href);
  const route = `/admin/players/\${playerId}/wallet-credit`;
  const post = async body => {
    const res = await adminPlayerMutationRoute(new Request('https://test.local' + route, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }), route, db);
    return { status: res.status, json: await res.json() };
  };

  for (const bad of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER]) {
    const r = await post(creditRequest(id(1), { credit_added_microusd: bad }));
    assert.equal(r.status, 400);
  }
  assert.equal((await post(creditRequest('bad-key'))).status, 400);
  assert.equal(rows('wallet_topups'), 0);
  assert.equal(balance(), 1000);

  // Pretend a chat charge committed between the old read and the admin write.
  // Atomic SQL must add to 900 rather than overwrite it with a stale 1500.
  sqlite.exec('UPDATE wallets SET balance_microusd = balance_microusd - 100');
  let r = await post(creditRequest(id(1)));
  assert.equal(r.status, 200);
  assert.equal(r.json.replayed, false);
  assert.equal(balance(), 1400);
  assert.equal(sqlite.prepare('SELECT balance_before_microusd b FROM wallet_ledger').get().b, 900);
  assert.equal(sqlite.prepare('SELECT balance_after_microusd b FROM wallet_ledger').get().b, 1400);
  const topupId = r.json.topup_id;

  // A retry after a later debit must neither credit again nor return stale balance.
  sqlite.exec('UPDATE wallets SET balance_microusd = balance_microusd - 100');
  r = await post(creditRequest(id(1)));
  assert.equal(r.status, 200);
  assert.equal(r.json.replayed, true);
  assert.equal(r.json.topup_id, topupId);
  assert.equal(r.json.wallet_balance_microusd, 1300);
  assert.equal(rows('wallet_topups'), 1);
  assert.equal(rows('wallet_ledger'), 1);
  assert.equal(balance(), 1300);
  assert.equal((await post(creditRequest(id(1), { credit_added_microusd: 400 }))).status, 409);
  assert.equal((await post(creditRequest(id(2)))).json.error, 'duplicate_payment_reference');
  assert.equal(balance(), 1300);

  // The same numeric amount is allowed as a separate, *identified* payment.
  r = await post(creditRequest(id(3), { payment_reference: 'bank-txn-2' }));
  assert.equal(r.status, 200);
  assert.equal(balance(), 1800);
  assert.equal(rows('wallet_topups'), 2);
  assert.equal(rows('wallet_ledger'), 2);

  failLedger = true;
  await assert.rejects(post(creditRequest(id(4), { payment_reference: 'bank-txn-3' })),
    /injected ledger failure/);
  failLedger = false;
  assert.equal(balance(), 1800);
  assert.equal(rows('wallet_topups'), 2);
  assert.equal(rows('wallet_topup_requests'), 2);
  r = await post(creditRequest(id(4), { payment_reference: 'bank-txn-3' }));
  assert.equal(r.status, 200);
  assert.equal(balance(), 2300);

  // Disabled wallets and insufficient headroom must fail closed.
  sqlite.exec('UPDATE wallets SET enabled = 0');
  assert.equal((await post(creditRequest(id(5), { payment_reference: '' }))).status, 409);
  sqlite.exec('UPDATE wallets SET enabled = 1, balance_microusd = 9000000000000');
  assert.equal((await post(creditRequest(id(6), { payment_reference: '' }))).status, 409);
  assert.equal(balance(), 9000000000000);
  console.log('wallet top-up atomicity and idempotency tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
