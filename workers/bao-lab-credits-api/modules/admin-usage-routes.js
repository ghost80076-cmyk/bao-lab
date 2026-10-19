import { ensureRequestTraces, reconciliation } from "./request-trace.js";

import {
  fail,
  json,
} from "./http.js";

import {
  ensureUsageDiagnostics,
} from "./usage-diagnostics.js";

// Read-only admin usage history.
const ADMIN_USAGE_LEGACY_BILLING_MODE = "raw_tokens_v1";
const ADMIN_USAGE_COST_BILLING_MODE = "cost_usd_v2";

const WorkerAdminUsageRoutes = (() => {
async function adminUsageRoute(
  request,
  path,
  url,
  db
) {
  if (
    path ===
      "/admin/usage" &&
    request.method ===
      "GET"
  ) {
    const id =
      url.searchParams.get(
        "player_id"
      );

    if (
      !id ||
      !/^[0-9a-f-]{36}$/.test(
        id
      )
    ) {
      return fail(
        "player_id_required"
      );
    }

    // Admin-only pagination; never return all usage rows in a single response.
    const rawPage = url.searchParams.get("page") || "0";
    if (!/^(0|[1-9][0-9]{0,3})$/.test(rawPage)) {
      return fail("invalid_usage_page");
    }
    const page = Number(rawPage);
    const pageSize = 100;

    await ensureUsageDiagnostics(
      db
    );

    await ensureRequestTraces(db);

    const rows =
      await db
        .prepare(
          `
          SELECT
            u.request_id,
            u.provider,
            u.model,
            u.request_kind,

            u.input_tokens,
            u.fresh_input_tokens,
            u.cached_tokens,
            u.cache_write_tokens,

            u.output_tokens,
            u.reasoning_tokens,

            u.provider_cost_microusd,
            u.cost_microusd,
            u.settled_cost_microusd,

            u.balance_before_microusd,
            u.balance_after_microusd,

            u.billing_mode,
            u.pricing_version,
            u.status,
            u.created_at,

            t.generation_id,
            t.attempt_count,
            t.elapsed_ms AS transport_elapsed_ms,
            t.route AS transport_route,
            (SELECT COUNT(*) FROM wallet_ledger l WHERE l.request_id = u.request_id
              AND l.player_id = u.player_id AND l.entry_type = 'usage') AS ledger_entries,
            (SELECT SUM(l.amount_microusd) FROM wallet_ledger l WHERE l.request_id = u.request_id
              AND l.player_id = u.player_id AND l.entry_type = 'usage') AS ledger_amount_microusd,
            d.failure_code,
            d.upstream_http_status,
            d.provider_status,
            d.route,
            d.transport_failure,
            d.rate_limit_scope,
            d.retry_after_seconds,
            d.request_bytes,
            d.elapsed_ms,
            d.timeout_ms

          FROM api_usage AS u

          LEFT JOIN api_usage_diagnostics AS d
            ON d.request_id = u.request_id

          LEFT JOIN api_request_traces AS t ON t.request_id = u.request_id

          WHERE
            u.player_id = ?

          ORDER BY
            u.created_at DESC,
            u.request_id DESC

          LIMIT 101 OFFSET ?
          `
        )
        .bind(
          id,
          page * pageSize
        )
        .all();

    const pageRows = (rows.results || []).slice(0, pageSize);
    const hasMore = (rows.results || []).length > pageSize;
    return json({
      page,
      has_more: hasMore,
      next_page: hasMore ? page + 1 : null,
      usage:
        pageRows.map(
          (row) => ({
            ...row,
            ...reconciliation(row),

            provider_cost_usd:
              row
                .provider_cost_microusd ==
              null
                ? null
                : row
                    .provider_cost_microusd /
                  1_000_000,

            actual_cost_usd:
              row.billing_mode ===
                ADMIN_USAGE_COST_BILLING_MODE &&
              row
                .cost_microusd !=
                null
                ? row
                    .cost_microusd /
                  1_000_000
                : null,

            settled_cost_usd:
              row
                .settled_cost_microusd ==
              null
                ? null
                : row
                    .settled_cost_microusd /
                  1_000_000,

            balance_before_usd:
              row
                .balance_before_microusd ==
              null
                ? null
                : row
                    .balance_before_microusd /
                  1_000_000,

            balance_after_usd:
              row
                .balance_after_microusd ==
              null
                ? null
                : row
                    .balance_after_microusd /
                  1_000_000,

            charged_legacy_credits:
              row.billing_mode ===
                ADMIN_USAGE_LEGACY_BILLING_MODE
                ? row
                    .cost_microusd
                : null,
          })
        ),
    });
  }

  return null;
}

  return Object.freeze({
    adminUsageRoute,
  });
})();

const {
  adminUsageRoute,
} = WorkerAdminUsageRoutes;

export {
  WorkerAdminUsageRoutes,
  adminUsageRoute,
};
