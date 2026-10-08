// Every money transition and its audit record commit in one D1 batch.
// Historical pending rows without a reservation are deliberately excluded.
async function ensureWalletReservations(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS wallet_reservations (
      request_id TEXT PRIMARY KEY,
      player_id TEXT NOT NULL,
      reserved_microusd INTEGER NOT NULL CHECK(reserved_microusd >= 0),
      charged_microusd INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL,
      operation_id TEXT,
      balance_before_microusd INTEGER,
      balance_after_microusd INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS wallet_reservations_player_state
      ON wallet_reservations(player_id, state, created_at)`),
  ]);
}

async function reserveWallet(db, requestId, playerId, amount) {
  const operationId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`INSERT INTO wallet_reservations
      (request_id, player_id, reserved_microusd, state, operation_id)
      SELECT ?, player_id, ?, 'reserving', ? FROM wallets
      WHERE player_id = ? AND enabled = 1 AND balance_microusd >= ?
        AND EXISTS (SELECT 1 FROM api_usage WHERE request_id = ? AND status = 'pending')
      ON CONFLICT(request_id) DO NOTHING`)
      .bind(requestId, amount, operationId, playerId, amount, requestId),
    db.prepare(`UPDATE wallets SET balance_microusd = balance_microusd - ?,
      updated_at = CURRENT_TIMESTAMP WHERE player_id = ?
      AND EXISTS (SELECT 1 FROM wallet_reservations WHERE request_id = ?
        AND state = 'reserving' AND operation_id = ?) AND ? > 0`)
      .bind(amount, playerId, requestId, operationId, amount),
    db.prepare(`UPDATE wallet_reservations SET state = 'held', operation_id = NULL
      WHERE request_id = ? AND state = 'reserving' AND operation_id = ?`)
      .bind(requestId, operationId),
  ]);
  return results[0].meta.changes > 0;
}

async function settleWallet(db, {
  requestId, playerId, actualCost, stored = {}, status = 'ok',
  billingMode, pricingVersion, provider, model, refund = false,
}) {
  const operationId = crypto.randomUUID();
  const charge = refund ? 0 : actualCost;
  const active = `request_id = ? AND state = 'settling' AND operation_id = ?`;
  await db.batch([
    db.prepare(`UPDATE wallet_reservations SET state = 'settling', operation_id = ?,
      charged_microusd = MIN(?, reserved_microusd +
        COALESCE((SELECT CASE WHEN enabled = 1 THEN MAX(balance_microusd, 0)
          ELSE 0 END FROM wallets WHERE player_id = ?), 0)),
      balance_before_microusd = (SELECT balance_microusd FROM wallets WHERE player_id = ?)
        + reserved_microusd,
      updated_at = CURRENT_TIMESTAMP
      WHERE request_id = ? AND player_id = ? AND state = 'held'
        AND EXISTS (SELECT 1 FROM api_usage WHERE request_id = ? AND status = 'pending')`)
      .bind(operationId, charge, playerId, playerId, requestId, playerId, requestId),
    db.prepare(`UPDATE wallet_reservations
      SET balance_after_microusd = balance_before_microusd - charged_microusd
      WHERE ${active}`).bind(requestId, operationId),
    db.prepare(`UPDATE wallets SET balance_microusd = balance_microusd +
      (SELECT reserved_microusd - charged_microusd FROM wallet_reservations WHERE ${active}),
      updated_at = CURRENT_TIMESTAMP WHERE player_id = ?
      AND EXISTS (SELECT 1 FROM wallet_reservations WHERE ${active})`)
      .bind(requestId, operationId, playerId, requestId, operationId),
    db.prepare(`UPDATE api_usage SET input_tokens = ?, fresh_input_tokens = ?,
      cached_tokens = ?, cache_write_tokens = ?, output_tokens = ?, reasoning_tokens = ?,
      provider_cost_microusd = ?, cost_microusd = ?,
      settled_cost_microusd = (SELECT charged_microusd FROM wallet_reservations WHERE ${active}),
      balance_before_microusd = (SELECT balance_before_microusd FROM wallet_reservations WHERE ${active}),
      balance_after_microusd = (SELECT balance_after_microusd FROM wallet_reservations WHERE ${active}),
      billing_mode = ?, pricing_version = ?,
      status = CASE WHEN ? = 0 AND
        (SELECT charged_microusd FROM wallet_reservations WHERE ${active}) < ?
        THEN 'over_budget' ELSE ? END
      WHERE request_id = ? AND status = 'pending'
        AND EXISTS (SELECT 1 FROM wallet_reservations WHERE ${active})`)
      .bind(stored.input ?? 0, stored.freshInput ?? 0, stored.cached ?? 0,
        stored.cacheWrite ?? 0, stored.output ?? 0, stored.reasoning ?? 0,
        stored.providerCostMicrousd ?? null, actualCost,
        requestId, operationId, requestId, operationId, requestId, operationId,
        billingMode, pricingVersion, refund ? 1 : 0,
        requestId, operationId, actualCost, status, requestId, requestId, operationId),
    db.prepare(`INSERT INTO wallet_ledger (ledger_id, player_id, entry_type, amount_microusd,
      balance_before_microusd, balance_after_microusd, request_id, reference_id, note)
      SELECT ?, r.player_id, 'usage', -r.charged_microusd,
        r.balance_before_microusd, r.balance_after_microusd, r.request_id, ?, u.status
      FROM wallet_reservations r JOIN api_usage u ON u.request_id = r.request_id
      WHERE r.request_id = ? AND r.state = 'settling' AND r.operation_id = ? AND ? = 0`)
      .bind(crypto.randomUUID(), `${provider}:${model}`, requestId, operationId, refund ? 1 : 0),
    db.prepare(`UPDATE wallet_reservations SET state = ?, operation_id = NULL,
      updated_at = CURRENT_TIMESTAMP WHERE ${active}`)
      .bind(refund ? 'refunded' : 'settled', requestId, operationId),
  ]);
  return db.prepare(`SELECT r.*, u.status AS settlement_status
    FROM wallet_reservations r JOIN api_usage u ON u.request_id = r.request_id
    WHERE r.request_id = ? AND r.player_id = ?`).bind(requestId, playerId).first();
}

async function recoverExpiredWalletReservations(db, playerId) {
  // Provider transport is bounded well below thirty minutes. A late response
  // cannot charge a reservation once recovery has claimed/refunded it.
  const stale = await db.prepare(`SELECT r.request_id, u.billing_mode, u.pricing_version,
      u.provider, u.model FROM wallet_reservations r
    JOIN api_usage u ON u.request_id = r.request_id
    WHERE r.player_id = ? AND r.state = 'held' AND u.status = 'pending'
      AND r.created_at < datetime('now', '-30 minutes') LIMIT 20`)
    .bind(playerId).all();
  for (const row of stale.results) {
    await settleWallet(db, {
      requestId: row.request_id, playerId, actualCost: 0,
      status: 'unverified_refunded', billingMode: row.billing_mode,
      pricingVersion: row.pricing_version, provider: row.provider, model: row.model,
      refund: true,
    });
  }
}

export { ensureWalletReservations, reserveWallet, settleWallet, recoverExpiredWalletReservations };
