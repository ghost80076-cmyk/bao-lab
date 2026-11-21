const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const fs = require('node:fs');
const sqlite = new DatabaseSync(':memory:');
let failLedger = false;
const db = {
  prepare(sql) {
    let args = [];
    const q = {
      bind(...values) { args = values; return q; },
      async first() { return sqlite.prepare(sql).get(...args) ?? null; },
      async run() {
        if (failLedger && sql.includes('INSERT INTO wallet_ledger')) throw new Error('injected ledger failure');
        return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } };
      },
    };
    return q;
  },
  async batch(queries) {
    sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const q of queries) results.push(await q.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
  },
};
const playerId = '11111111-1111-4111-8111-111111111111';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
sqlite.exec(`CREATE TABLE wallets (player_id TEXT PRIMARY KEY, balance_microusd INTEGER NOT NULL,
  enabled INTEGER NOT NULL, updated_at TEXT);
  CREATE TABLE wallet_topups (topup_id TEXT PRIMARY KEY, player_id TEXT,
  payment_amount_microusd INTEGER, credit_added_microusd INTEGER,
  payment_method TEXT, payment_reference TEXT, note TEXT,
  payment_amount_minor INTEGER, payment_currency TEXT, processor_fee_minor INTEGER, net_received_minor INTEGER);
  CREATE TABLE wallet_ledger (ledger_id TEXT PRIMARY KEY, player_id TEXT, entry_type TEXT,
  amount_microusd INTEGER, balance_before_microusd INTEGER, balance_after_microusd INTEGER,
  reference_id TEXT UNIQUE, note TEXT);`);
sqlite.prepare('INSERT INTO wallets VALUES (?, 1000, 1, NULL)').run(playerId);
const balance = () => sqlite.prepare('SELECT balance_microusd b FROM wallets').get().b;
const count = table => sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;

(async () => {
  const { LIGHTS_PACKAGES, initializePaymentOrders, createPaymentOrder, fulfillConfirmedPayment } =
    await import(pathToFileURL(path.join(__dirname, '../workers/bao-lab-credits-api/modules/payment-orders.js')).href);
  await initializePaymentOrders(db);
  await initializePaymentOrders(db);
  for (const pack of Object.values(LIGHTS_PACKAGES)) {
    const html = fs.readFileSync(path.join(__dirname, '../lights.html'), 'utf8');
    assert.ok(html.includes(`${pack.points.toLocaleString('en-US')} 燈火`));
    assert.ok(html.includes(`NT$${(pack.amount_minor / 100).toLocaleString('en-US')}`));
    assert.equal(pack.credit_microusd, pack.points * 1000);
    assert.ok(Object.isFrozen(pack));
  }
  const create = (key, extra = {}) => createPaymentOrder(db, {
    playerId, requestKey: id(key), packageId: '5000', provider: 'example', environment: 'live', ...extra,
  });
  const confirm = (order, extra = {}) => fulfillConfirmedPayment(db, {
    orderId: order.order_id, provider: 'example', environment: 'live', transactionId: `txn-${order.order_id}`,
    currency: 'TWD', amountMinor: 25000, status: 'succeeded', ...extra,
  });
  await assert.rejects(create(1, { packageId: '__proto__' }), /invalid_package/);
  const a = await create(1);
  assert.equal((await create(1)).order_id, a.order_id);
  await assert.rejects(create(1, { packageId: '10000' }), /idempotency_key_conflict/);
  assert.equal(balance(), 1000);
  for (const extra of [{ amountMinor: 1 }, { currency: 'USD' }, { status: 'pending' },
    { provider: 'other' }, { transactionId: '' }, { amountMinor: 25000.5 }]) {
    await assert.rejects(confirm(a, extra));
    assert.equal(balance(), 1000);
    assert.equal(count('wallet_ledger'), 0);
  }
  const testOrder = await create(2, { environment: 'test' });
  await assert.rejects(confirm(testOrder, { environment: 'test' }), /test_payment_cannot_credit_wallet/);
  await assert.rejects(confirm(testOrder), /payment_order_mismatch/);
  sqlite.exec('UPDATE wallets SET balance_microusd = balance_microusd - 100');
  assert.equal((await confirm(a)).replayed, false);
  assert.equal(balance(), 5000900);
  const ledger = sqlite.prepare('SELECT * FROM wallet_ledger').get();
  assert.equal(ledger.balance_before_microusd, 900);
  assert.equal(ledger.balance_after_microusd, 5000900);
  const topup = sqlite.prepare('SELECT * FROM wallet_topups').get();
  assert.equal(topup.processor_fee_minor, null); // Unknown fees are not reported as zero.
  assert.equal(topup.net_received_minor, null);
  sqlite.exec('UPDATE wallets SET balance_microusd = balance_microusd - 100');
  assert.equal((await confirm(a)).replayed, true);
  assert.equal(balance(), 5000800);
  await assert.rejects(confirm(a, { transactionId: 'different-txn' }), /payment_not_credited/);
  const b = await create(3);
  await assert.rejects(confirm(b, { transactionId: `txn-${a.order_id}` }));
  assert.equal(count('wallet_topups'), 1);
  failLedger = true;
  await assert.rejects(confirm(b), /injected ledger failure/);
  failLedger = false;
  assert.equal(balance(), 5000800);
  assert.equal(sqlite.prepare('SELECT status FROM payment_orders WHERE order_id = ?').get(b.order_id).status, 'pending');
  assert.equal(count('wallet_topups'), 1);
  assert.equal((await confirm(b)).replayed, false);
  assert.equal(balance(), 10000800);
  const c = await create(4);
  sqlite.exec('UPDATE wallets SET enabled = 0');
  await assert.rejects(create(5), /player_wallet_unavailable/);
  await assert.rejects(confirm(c), /payment_not_credited/);
  sqlite.exec('UPDATE wallets SET enabled = 1, balance_microusd = 9000000000000');
  await assert.rejects(confirm(c), /payment_not_credited/);
  assert.equal(balance(), 9000000000000);
  assert.equal(count('wallet_topups'), 2);
  assert.equal(count('wallet_ledger'), 2);
  console.log('payment orders: catalog, scope, tampering, idempotency, rollback and wallet limits passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
