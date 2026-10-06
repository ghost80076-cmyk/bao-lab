import {
  modelConfig,
} from "./model-pricing.js";

import {
  safeMoneyInt,
} from "./number-utils.js";

import {
  HOSTED_ROUTE_CONTROL,
} from "./provider-routing.js";

// Internal provider-admin control boundary. It owns provider control tables,
// tracked spend snapshots and low-balance status, not request routing or transport.
const WorkerProviderControl = (() => {
  const PROVIDER_CONTROL = Object.freeze({
    gemini: {
      label: "Google Gemini",
      official_balance_currency: "TWD",
      balance_mode: "native_snapshot",
    },
    openrouter: {
      label: "OpenRouter",
      official_balance_currency: "USD",
      balance_mode: "usd_estimate",
      default_threshold_microusd: 2_000_000,
    },
  });
  
  async function ensureProviderControlTables(
    db
  ) {
    await db.batch(
      [
        db.prepare(
          `
          CREATE TABLE IF NOT EXISTS hosted_route_overrides (
            model_id TEXT PRIMARY KEY,
            route_id TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
          `
        ),
  
        db.prepare(
          `
          CREATE TABLE IF NOT EXISTS provider_balance_anchors (
            provider TEXT PRIMARY KEY,
            anchor_balance_microusd INTEGER NOT NULL,
            anchor_spent_microusd INTEGER NOT NULL,
            low_balance_threshold_microusd INTEGER NOT NULL DEFAULT 2000000,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
          `
        ),

        db.prepare(
          `
          CREATE TABLE IF NOT EXISTS provider_native_balance_snapshots (
            provider TEXT PRIMARY KEY,
            currency TEXT NOT NULL,
            balance_minor INTEGER NOT NULL,
            anchor_spent_microusd INTEGER NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
          )
          `
        ),
      ]
    );
  }
  
  async function providerCumulativeSpendMicrousd(
    db,
    provider
  ) {
    const row =
      await db
        .prepare(
          `
          SELECT
            COALESCE(
              SUM(
                CASE
                  -- Provider balance tracking follows upstream spend, not
                  -- whether YoruBay charged or refunded the player. A provider
                  -- can still bill a successful response whose token usage is
                  -- incomplete, so any known upstream cost must be counted.
                  WHEN provider_cost_microusd IS NOT NULL
                    THEN provider_cost_microusd

                  WHEN status IN (
                    'ok',
                    'over_budget'
                  )
                    AND settled_cost_microusd IS NOT NULL
                    THEN settled_cost_microusd

                  WHEN status IN (
                    'ok',
                    'over_budget'
                  )
                    THEN cost_microusd

                  ELSE 0
                END
              ),
              0
            ) AS spent_microusd
  
          FROM api_usage
  
          WHERE
            provider = ?
  
            AND billing_mode = ?
          `
        )
        .bind(
          provider,
          COST_BILLING_MODE
        )
        .first();
  
    return safeMoneyInt(
      Number(
        row?.spent_microusd ||
        0
      )
    );
  }
  
  async function providerControlSnapshot(
    env,
    db
  ) {
    await ensureProviderControlTables(
      db
    );
  
    const [
      routeRows,
      balanceRows,
      nativeBalanceRows,
    ] =
      await Promise.all(
        [
          db
            .prepare(
              `
              SELECT
                model_id,
                route_id,
                updated_at
  
              FROM hosted_route_overrides
              `
            )
            .all(),
  
          db
            .prepare(
              `
              SELECT
                provider,
                anchor_balance_microusd,
                anchor_spent_microusd,
                low_balance_threshold_microusd,
                updated_at
  
              FROM provider_balance_anchors
              `
            )
            .all(),

          db
            .prepare(
              `
              SELECT
                provider,
                currency,
                balance_minor,
                anchor_spent_microusd,
                updated_at

              FROM provider_native_balance_snapshots
              `
            )
            .all(),
        ]
      );
  
    const overrides =
      new Map(
        (
          routeRows.results ||
          []
        ).map(
          (row) => [
            row.model_id,
            row,
          ]
        )
      );
  
    const anchors =
      new Map(
        (
          balanceRows.results ||
          []
        ).map(
          (row) => [
            row.provider,
            row,
          ]
        )
      );

    const nativeBalances =
      new Map(
        (
          nativeBalanceRows.results ||
          []
        ).map(
          (row) => [
            row.provider,
            row,
          ]
        )
      );
  
    const routes = [];
  
    for (
      const [
        modelId,
        config,
      ]
      of Object.entries(
        HOSTED_ROUTE_CONTROL
      )
    ) {
      const saved =
        overrides.get(
          modelId
        );
  
      const savedRouteId =
        config.routes[
          saved?.route_id
        ]
          ? saved.route_id
          : null;
  
      const desiredRouteId =
        savedRouteId ||
        config.default_route;
  
      const desiredRoute =
        config.routes[
          desiredRouteId
        ];
  
      const desiredAvailable =
        Boolean(
          modelConfig(
            env,
            desiredRoute.provider,
            desiredRoute.model
          )
        );
  
      const defaultRoute =
        config.routes[
          config.default_route
        ];
  
      const effectiveRouteId =
        desiredAvailable
          ? desiredRouteId
          : (
              modelConfig(
                env,
                defaultRoute.provider,
                defaultRoute.model
              )
                ? config
                    .default_route
                : desiredRouteId
            );
  
      routes.push({
        model_id:
          modelId,
  
        label:
          config.label,
  
        default_route_id:
          config.default_route,
  
        saved_route_id:
          savedRouteId,
  
        effective_route_id:
          effectiveRouteId,
  
        fallback:
          effectiveRouteId !==
          desiredRouteId,
  
        updated_at:
          saved?.updated_at ||
          null,
  
        routes:
          Object.entries(
            config.routes
          ).map(
            ([
              routeId,
              route,
            ]) => ({
              route_id:
                routeId,
  
              label:
                route.label,
  
              provider:
                route.provider,
  
              model:
                route.model,
  
              available:
                Boolean(
                  modelConfig(
                    env,
                    route.provider,
                    route.model
                  )
                ),
            })
          ),
      });
    }
  
    const providers = [];
  
    for (
      const [
        provider,
        info,
      ]
      of Object.entries(
        PROVIDER_CONTROL
      )
    ) {
      const cumulative =
        await providerCumulativeSpendMicrousd(
          db,
          provider
        );

      if (
        info.balance_mode ===
          "native_snapshot"
      ) {
        const nativeBalance =
          nativeBalances.get(
            provider
          );

        const anchored =
          Boolean(
            nativeBalance &&
            nativeBalance.currency ===
              info.official_balance_currency
          );

        const anchorSpent =
          anchored
            ? safeMoneyInt(
                Number(
                  nativeBalance
                    .anchor_spent_microusd
                )
              )
            : cumulative;

        providers.push({
          provider,

          label:
            info.label,

          balance_mode:
            info.balance_mode,

          official_balance_currency:
            info.official_balance_currency,

          anchored,

          reported_balance_minor:
            anchored
              ? safeMoneyInt(
                  Number(
                    nativeBalance
                      .balance_minor
                  )
                )
              : null,

          tracked_spent_microusd:
            anchored
              ? Math.max(
                  0,
                  cumulative -
                    anchorSpent
                )
              : 0,

          // Intentionally unavailable: Google reports this account balance in
          // TWD while YoruBay's provider-cost ledger is USD. We do not apply
          // an implicit FX rate and pretend the mixed-currency subtraction is
          // an exact remaining balance.
          estimated_remaining_microusd:
            null,

          low_balance_threshold_microusd:
            null,

          status:
            anchored
              ? "reported"
              : "untracked",

          updated_at:
            nativeBalance
              ?.updated_at ||
            null,
        });

        continue;
      }
  
      const anchor =
        anchors.get(
          provider
        );
  
      const anchored =
        Boolean(
          anchor
        );
  
      const anchorBalance =
        anchored
          ? safeMoneyInt(
              Number(
                anchor
                  .anchor_balance_microusd
              )
            )
          : null;
  
      const anchorSpent =
        anchored
          ? safeMoneyInt(
              Number(
                anchor
                  .anchor_spent_microusd
              )
            )
          : cumulative;
  
      const trackedSpend =
        anchored
          ? Math.max(
              0,
              cumulative -
                anchorSpent
            )
          : 0;
  
      const remaining =
        anchored
          ? anchorBalance -
            trackedSpend
          : null;
  
      const threshold =
        anchored
          ? safeMoneyInt(
              Number(
                anchor
                  .low_balance_threshold_microusd
              )
            )
          : info
              .default_threshold_microusd;
  
      let status =
        "untracked";
  
      if (anchored) {
        status =
          remaining <= 0
            ? "empty"
            : (
                remaining <=
                  threshold
                  ? "low"
                  : "ok"
              );
      }
  
      providers.push({
        provider,

        label:
          info.label,

        balance_mode:
          info.balance_mode,

        official_balance_currency:
          info.official_balance_currency,
  
        anchored,
  
        anchor_balance_microusd:
          anchorBalance,
  
        tracked_spent_microusd:
          trackedSpend,
  
        estimated_remaining_microusd:
          remaining,
  
        low_balance_threshold_microusd:
          threshold,
  
        status,
  
        updated_at:
          anchor?.updated_at ||
          null,
      });
    }
  
    return {
      routes,
      providers,
    };
  }

  return Object.freeze({
    PROVIDER_CONTROL,
    ensureProviderControlTables,
    providerCumulativeSpendMicrousd,
    providerControlSnapshot,
  });
})();

const {
  PROVIDER_CONTROL,
  ensureProviderControlTables,
  providerCumulativeSpendMicrousd,
  providerControlSnapshot,
} = WorkerProviderControl;

export {
  PROVIDER_CONTROL,
  WorkerProviderControl,
  ensureProviderControlTables,
  providerCumulativeSpendMicrousd,
  providerControlSnapshot,
};

