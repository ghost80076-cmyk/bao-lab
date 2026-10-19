// Supplemental metadata only. No prompt, credential, response text or raw error.
async function ensureRequestTraces(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS api_request_traces (
    request_id TEXT PRIMARY KEY,
    generation_id TEXT,
    route TEXT,
    elapsed_ms INTEGER,
    attempt_count INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function recordRequestTrace(db, requestId, result = {}) {
  try {
    await ensureRequestTraces(db);
    const id = String(result.generationId || '');
    const route = ['aws_relay', 'direct_openrouter', 'direct_anthropic', 'provider_direct'].includes(result.route)
      ? result.route : null;
    const bounded = (value, max) => Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
    await db.prepare(`INSERT INTO api_request_traces
      (request_id, generation_id, route, elapsed_ms, attempt_count)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(request_id) DO NOTHING`)
      .bind(requestId, /^[A-Za-z0-9_-]{1,200}$/.test(id) ? id : null,
        route, bounded(result.elapsedMs, 3_600_000), bounded(result.attemptCount, 10)).run();
    return true;
  } catch {
    // Observability must not prevent settlement/refunds after a paid generation.
    console.error('request_trace_write_failed');
    return false;
  }
}

function reconciliation(row) {
  if (row.billing_mode !== 'cost_usd_v2') return { wallet_check: 'legacy', reported_margin_microusd: null };
  const known = value => value !== null && value !== undefined && Number.isSafeInteger(value);
  const charged = row.settled_cost_microusd;
  const count = row.ledger_entries;
  let check = ['pending', 'denied'].includes(row.status) ? 'unsettled' : 'unavailable';
  if (known(charged) && known(count)) {
    // Refunds intentionally have no usage ledger entry. Pending/denied are not settlements.
    if (['pending', 'denied'].includes(row.status)) check = 'unsettled';
    else if (charged === 0 && count === 0 && ['failed', 'unverified_refunded', 'pricing_error', 'refunded'].includes(row.status)) check = 'refunded';
    else check = count === 1 && row.ledger_amount_microusd === -charged ? 'matched' : 'mismatch';
  }
  return {
    wallet_check: check,
    reported_margin_microusd: known(charged) && known(row.provider_cost_microusd)
      ? charged - row.provider_cost_microusd : null,
    provider_cost_source: known(row.provider_cost_microusd) ? 'provider_reported' : 'unavailable',
    invoice_check: 'not_reconciled',
  };
}

export { ensureRequestTraces, recordRequestTrace, reconciliation };
