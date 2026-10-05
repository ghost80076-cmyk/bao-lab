import {
  fail,
  json,
  readJson,
} from "./http.js";

import {
  newOpaqueToken,
  publicPlayerId,
  sha256Hex,
} from "./crypto.js";

import {
  globalBillingMode,
} from "./runtime-config.js";

// Admin player list/create subroutes. This module is only reached after admin auth.
const ADMIN_PLAYER_DIRECTORY_COST_BILLING_MODE = "cost_usd_v2";

const adminPlayerDirectoryInteger = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const WorkerAdminPlayerDirectoryRoutes = (() => {
async function adminPlayerDirectoryRoute(
  request,
  path,
  env,
  db
) {
  if (
    path ===
      "/admin/players" &&
    request.method ===
      "GET"
  ) {
    const rows =
      await db
        .prepare(
          `
          SELECT
            p.id,
            p.public_id,
            p.balance_microusd,
            p.daily_chat_limit,
            p.enabled,
            p.created_at,

            w.balance_microusd
              AS wallet_balance_microusd,

            w.currency
              AS wallet_currency,

            w.enabled
              AS wallet_enabled,

            a.username,
            a.display_name,
            a.enabled
              AS account_enabled,

            (
              SELECT e.action
              FROM admin_player_events e
              WHERE e.player_id = p.id
              ORDER BY e.created_at DESC, e.event_id DESC
              LIMIT 1
            ) AS last_admin_action,

            (
              SELECT e.reason
              FROM admin_player_events e
              WHERE e.player_id = p.id
              ORDER BY e.created_at DESC, e.event_id DESC
              LIMIT 1
            ) AS last_admin_reason,

            (
              SELECT e.created_at
              FROM admin_player_events e
              WHERE e.player_id = p.id
              ORDER BY e.created_at DESC, e.event_id DESC
              LIMIT 1
            ) AS last_admin_action_at

          FROM players p

          LEFT JOIN wallets w
            ON w.player_id =
              p.id

          LEFT JOIN accounts a
            ON a.player_id =
              p.id

          ORDER BY
            p.created_at DESC

          LIMIT 200
          `
        )
        .all();

    return json({
      default_billing_mode:
        globalBillingMode(
          env
        ),

      players:
        rows.results.map(
          (p) => ({
            ...p,

            legacy_balance_credits:
              p.balance_microusd,

            wallet_balance_usd:
              p
                .wallet_balance_microusd ==
              null
                ? null
                : p
                    .wallet_balance_microusd /
                  1_000_000,
          })
        ),
    });
  }

  if (
    path ===
      "/admin/players" &&
    request.method ===
      "POST"
  ) {
    const body =
      await readJson(
        request
      );

    const legacyCredit =
      body
        ?.balance_credits ??
      body
        ?.balance_microusd ??
      0;

    const walletCredit =
      body
        ?.wallet_balance_microusd ??
      0;

    const daily =
      body
        ?.daily_chat_limit ??
      200;

    if (
      !adminPlayerDirectoryInteger(
        legacyCredit,
        0,
        100_000_000
      ) ||
      !adminPlayerDirectoryInteger(
        walletCredit,
        0,
        1_000_000_000_000
      ) ||
      !adminPlayerDirectoryInteger(
        daily,
        1,
        500
      )
    ) {
      return fail(
        "invalid_player_settings"
      );
    }

    const id =
      crypto.randomUUID();

    const token =
      newOpaqueToken(
        "bao_",
        32
      );

    const publicId =
      publicPlayerId();

    await db.batch(
      [
        db
          .prepare(
            `
            INSERT INTO players (
              id,
              public_id,
              token_hash,
              balance_microusd,
              daily_chat_limit
            )

            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?
            )
            `
          )
          .bind(
            id,
            publicId,
            await sha256Hex(
              token
            ),
            legacyCredit,
            daily
          ),

        db
          .prepare(
            `
            INSERT INTO wallets (
              player_id,
              balance_microusd,
              currency,
              billing_mode,
              enabled
            )

            VALUES (
              ?,
              ?,
              'USD',
              ?,
              1
            )
            `
          )
          .bind(
            id,
            walletCredit,
            ADMIN_PLAYER_DIRECTORY_COST_BILLING_MODE
          ),
      ]
    );

    return json(
      {
        player_id:
          id,

        public_id:
          publicId,

        player_token:
          token,

        legacy_balance_credits:
          legacyCredit,

        wallet_balance_microusd:
          walletCredit,

        wallet_balance_usd:
          walletCredit /
          1_000_000,
      },
      201
    );
  }

  return null;
}

  return Object.freeze({
    adminPlayerDirectoryRoute,
  });
})();

const {
  adminPlayerDirectoryRoute,
} = WorkerAdminPlayerDirectoryRoutes;

export {
  WorkerAdminPlayerDirectoryRoutes,
  adminPlayerDirectoryRoute,
};
