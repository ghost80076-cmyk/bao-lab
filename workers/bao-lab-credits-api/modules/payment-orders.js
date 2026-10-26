// Internal foundation only. No HTTP route imports this module yet.
// A provider adapter MUST verify signatures and query the provider's transaction
// API before calling fulfillConfirmedPayment. Never pass a raw webhook body here.
export const LIGHTS_PACKAGES = Object.freeze(Object.fromEntries(
  [[5000, 250], [10000, 500], [20000, 1000], [50000, 2500]].map(([points, twd]) =>
    [String(points), Object.freeze({ points, currency: 'TWD', amount_minor: twd * 100,
      credit_microusd: points * 1000 })])
));

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function requireValue(ok, code) { if (!ok) throw new Error(code); }
function validateScope(provider, environment) {
  requireValue(typeof provider === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(provider), 'invalid_provider');
  requireValue(['test', 'live'].includes(environment), 'invalid_payment_environment');
}

export async function initializePaymentOrders(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS payment_orders (
    order_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    request_key TEXT NOT NULL,
    package_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    environment TEXT NOT NULL CHECK (environment IN ('test', 'live')),
    currency TEXT NOT NULL CHECK (currency = 'TWD'),
    amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
    credit_microusd INTEGER NOT NULL CHECK (credit_microusd > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'credited')),
    transaction_id TEXT,
    settlement_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    credited_at TEXT,
    UNIQUE (player_id, request_key),
    UNIQUE (provider, environment, transaction_id)
  )`).run();
}

// playerId must come from an authenticated session, never the checkout body.
// provider/environment must come from trusted server configuration.
export async function createPaymentOrder(db, { playerId, requestKey, packageId, provider, environment }) {
  requireValue(typeof playerId === 'string' && uuid.test(playerId), 'invalid_player_id');
  requireValue(typeof requestKey === 'string' && uuid.test(requestKey), 'invalid_idempotency_key');
  validateScope(provider, environment);
  requireValue(typeof packageId === 'string' && Object.hasOwn(LIGHTS_PACKAGES, packageId), 'invalid_package');
  const pack = LIGHTS_PACKAGES[packageId];
  await db.prepare(`INSERT INTO payment_orders
    (order_id, player_id, request_key, package_id, provider, environment, currency, amount_minor, credit_microusd)
    SELECT ?, player_id, ?, ?, ?, ?, ?, ?, ? FROM wallets
    WHERE player_id = ? AND enabled = 1
    ON CONFLICT(player_id, request_key) DO NOTHING`)
    .bind(crypto.randomUUID(), requestKey, packageId, provider, environment,
      pack.currency, pack.amount_minor, pack.credit_microusd, playerId).run();
  const order = await db.prepare(`SELECT * FROM payment_orders WHERE player_id = ? AND request_key = ?`)
    .bind(playerId, requestKey).first();
  requireValue(order, 'player_wallet_unavailable');
  requireValue(order.package_id === packageId && order.provider === provider && order.environment === environment,
    'idempotency_key_conflict');
  return order;
}

// The confirmed transaction is normalized by the future, provider-specific adapter.
// Amounts use ISO minor units internally (NT$250 = 25000), regardless of the
// provider's wire format. Test transactions NEVER change the production wallet.
export async function fulfillConfirmedPayment(db, payment) {
  const { orderId, provider, environment, transactionId, currency, amountMinor, status } = payment;
  validateScope(provider, environment);
  requireValue(environment === 'live', 'test_payment_cannot_credit_wallet');
  requireValue(typeof orderId === 'string' && uuid.test(orderId), 'invalid_order_id');
  requireValue(typeof transactionId === 'string' && transactionId.trim() === transactionId &&
    transactionId.length > 0 && transactionId.length <= 200, 'invalid_transaction_id');
  requireValue(status === 'succeeded', 'payment_not_confirmed');
  requireValue(currency === 'TWD' && Number.isSafeInteger(amountMinor) && amountMinor > 0, 'invalid_payment_amount');
  const method = `payment:${provider}:${environment}`;
  const settlementId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`UPDATE payment_orders SET status = 'credited', transaction_id = ?,
        settlement_id = ?, credited_at = CURRENT_TIMESTAMP
      WHERE order_id = ? AND provider = ? AND environment = ? AND currency = ?
        AND amount_minor = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM wallets w WHERE w.player_id = payment_orders.player_id
          AND w.enabled = 1 AND w.balance_microusd BETWEEN 0 AND 9000000000000 - payment_orders.credit_microusd)
        AND NOT EXISTS (SELECT 1 FROM wallet_topups WHERE payment_method = ? AND payment_reference = ?)`)
      .bind(transactionId, settlementId, orderId, provider, environment, currency, amountMinor, method, transactionId),
    db.prepare(`UPDATE wallets SET balance_microusd = balance_microusd +
        (SELECT credit_microusd FROM payment_orders WHERE settlement_id = ?), updated_at = CURRENT_TIMESTAMP
      WHERE player_id = (SELECT player_id FROM payment_orders WHERE settlement_id = ?)`)
      .bind(settlementId, settlementId),
    db.prepare(`INSERT INTO wallet_topups (topup_id, player_id, payment_amount_microusd,
        credit_added_microusd, payment_method, payment_reference, note,
        payment_amount_minor, payment_currency, processor_fee_minor, net_received_minor)
      SELECT order_id, player_id, 0, credit_microusd, ?, transaction_id, 'Online payment',
        amount_minor, currency, NULL, NULL FROM payment_orders WHERE settlement_id = ?`)
      .bind(method, settlementId),
    db.prepare(`INSERT INTO wallet_ledger (ledger_id, player_id, entry_type, amount_microusd,
        balance_before_microusd, balance_after_microusd, reference_id, note)
      SELECT ?, o.player_id, 'topup', o.credit_microusd,
        w.balance_microusd - o.credit_microusd, w.balance_microusd, o.order_id, 'Online payment'
      FROM payment_orders o JOIN wallets w ON w.player_id = o.player_id WHERE o.settlement_id = ?`)
      .bind(crypto.randomUUID(), settlementId),
  ]);
  const order = await db.prepare(`SELECT * FROM payment_orders WHERE order_id = ?`).bind(orderId).first();
  requireValue(order && order.provider === provider && order.environment === environment &&
    order.currency === currency && order.amount_minor === amountMinor, 'payment_order_mismatch');
  requireValue(order.status === 'credited' && order.transaction_id === transactionId, 'payment_not_credited');
  return { order_id: order.order_id, replayed: results[0].meta.changes === 0 };
}
