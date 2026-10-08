import {
  fail,
  json,
} from "./http.js";

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
    const rows =
      await db
        .prepare(
          `
          SELECT
            request_id,
            provider,
            model,
            request_kind,

            input_tokens,
            fresh_input_tokens,
            cached_tokens,
            cache_write_tokens,

            output_tokens,
            reasoning_tokens,

            provider_cost_microusd,
            cost_microusd,
            settled_cost_microusd,

            balance_before_microusd,
            balance_after_microusd,

            billing_mode,
            pricing_version,
            status,
            created_at

          FROM api_usage

          WHERE
            player_id = ?

          ORDER BY
            created_at DESC,
            request_id DESC

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
