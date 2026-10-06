import {
  fail,
  json,
  readJson,
} from "./http.js";

import {
  modelAllowed,
} from "./model-pricing.js";

import {
  integer,
} from "./number-utils.js";

import {
  PROVIDER_CONTROL,
  ensureProviderControlTables,
  providerControlSnapshot,
  providerCumulativeSpendMicrousd,
} from "./provider-control.js";

import {
  HOSTED_ROUTE_CONTROL,
} from "./provider-routing.js";

// Admin provider-control HTTP subroutes. Provider accounting and snapshots stay
// in WorkerProviderControl; this boundary owns only request validation/persistence.
const WorkerAdminProviderControlRoutes = (() => {
async function adminProviderControlRoute(
  request,
  path,
  env,
  db
) {
  if (
    path ===
      "/admin/provider-control" &&
    request.method ===
      "GET"
  ) {
    return json(
      await providerControlSnapshot(
        env,
        db
      )
    );
  }

  if (
    path ===
      "/admin/provider-control/route" &&
    request.method ===
      "POST"
  ) {
    await ensureProviderControlTables(
      db
    );

    const body =
      await readJson(
        request
      );

    const modelId =
      String(
        body?.model_id ||
        ""
      ).trim();

    const routeId =
      String(
        body?.route_id ||
        ""
      ).trim();

    const config =
      HOSTED_ROUTE_CONTROL[
        modelId
      ];

    const route =
      config?.routes?.[
        routeId
      ];

    if (
      !config ||
      !route
    ) {
      return fail(
        "invalid_hosted_route"
      );
    }

    if (
      !modelAllowed(
        env,
        route.provider,
        route.model
      )
    ) {
      return fail(
        "hosted_route_not_configured",
        409,
        {
          model_id:
            modelId,

          route_id:
            routeId,

          provider:
            route.provider,

          model:
            route.model,
        }
      );
    }

    await db
      .prepare(
        `
        INSERT INTO hosted_route_overrides (
          model_id,
          route_id,
          updated_at
        )

        VALUES (
          ?,
          ?,
          CURRENT_TIMESTAMP
        )

        ON CONFLICT(model_id)
        DO UPDATE SET
          route_id =
            excluded.route_id,

          updated_at =
            CURRENT_TIMESTAMP
        `
      )
      .bind(
        modelId,
        routeId
      )
      .run();

    return json(
      await providerControlSnapshot(
        env,
        db
      )
    );
  }

  if (
    path ===
      "/admin/provider-control/balance" &&
    request.method ===
      "POST"
  ) {
    await ensureProviderControlTables(
      db
    );

    const body =
      await readJson(
        request
      );

    const provider =
      String(
        body?.provider ||
        ""
      )
        .trim()
        .toLowerCase();

    const info =
      PROVIDER_CONTROL[
        provider
      ];

    if (!info) {
      return fail(
        "invalid_provider_balance"
      );
    }

    const currentSpend =
      await providerCumulativeSpendMicrousd(
        db,
        provider
      );

    if (
      info.balance_mode ===
        "native_snapshot"
    ) {
      const currency =
        String(
          body?.currency ||
          ""
        )
          .trim()
          .toUpperCase();

      const balanceMinor =
        Number(
          body
            ?.balance_minor
        );

      if (
        currency !==
          info.official_balance_currency ||
        !integer(
          balanceMinor,
          0,
          9_000_000_000_000
        )
      ) {
        return fail(
          "invalid_provider_balance"
        );
      }

      await db
        .prepare(
          `
          INSERT INTO provider_native_balance_snapshots (
            provider,
            currency,
            balance_minor,
            anchor_spent_microusd,
            updated_at
          )

          VALUES (
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )

          ON CONFLICT(provider)
          DO UPDATE SET
            currency =
              excluded.currency,

            balance_minor =
              excluded.balance_minor,

            anchor_spent_microusd =
              excluded.anchor_spent_microusd,

            updated_at =
              CURRENT_TIMESTAMP
          `
        )
        .bind(
          provider,
          currency,
          balanceMinor,
          currentSpend
        )
        .run();

      return json(
        await providerControlSnapshot(
          env,
          db
        )
      );
    }

    const balance =
      Number(
        body
          ?.balance_microusd
      );

    const defaultThreshold =
      info
        .default_threshold_microusd;

    const threshold =
      Number(
        body
          ?.low_balance_threshold_microusd ??
        defaultThreshold
      );

    if (
      !integer(
        balance,
        0,
        9_000_000_000_000
      ) ||
      !integer(
        threshold,
        0,
        9_000_000_000_000
      )
    ) {
      return fail(
        "invalid_provider_balance"
      );
    }

    await db
      .prepare(
        `
        INSERT INTO provider_balance_anchors (
          provider,
          anchor_balance_microusd,
          anchor_spent_microusd,
          low_balance_threshold_microusd,
          updated_at
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP
        )

        ON CONFLICT(provider)
        DO UPDATE SET
          anchor_balance_microusd =
            excluded.anchor_balance_microusd,

          anchor_spent_microusd =
            excluded.anchor_spent_microusd,

          low_balance_threshold_microusd =
            excluded.low_balance_threshold_microusd,

          updated_at =
            CURRENT_TIMESTAMP
        `
      )
      .bind(
        provider,
        balance,
        currentSpend,
        threshold
      )
      .run();

    return json(
      await providerControlSnapshot(
        env,
        db
      )
    );
  }

  return null;
}

  return Object.freeze({
    adminProviderControlRoute,
  });
})();

const {
  adminProviderControlRoute,
} = WorkerAdminProviderControlRoutes;

export {
  WorkerAdminProviderControlRoutes,
  adminProviderControlRoute,
};

