import {
  fail,
  json,
} from "./http.js";

import {
  safeInt,
  safeMoneyInt,
} from "./number-utils.js";

import {
  billingModeForPlayer,
} from "./runtime-config.js";

import {
  playerFor,
  tokenFrom,
  withSessionCookie,
} from "./session-auth.js";

// Authenticated self-service route boundary. It owns the `/me` account summary
// response while credential resolution remains in WorkerSessionAuth.
const WorkerAccountSelfRoute = (() => {
async function meRoute(
  request,
  env,
  db
) {
  const player =
    await playerFor(
      request,
      db
    );

  if (
    !player ||
    !player.enabled
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const used =
    await db
      .prepare(
        `
        SELECT
          COUNT(*) AS n

        FROM api_usage

        WHERE
          player_id = ?

          AND
          request_kind =
            'chat'

          AND
          status IN (
            'pending',
            'ok',
            'unverified',
            'over_budget'
          )

          AND
          date(created_at) =
            date('now')
        `
      )
      .bind(
        player.id
      )
      .first();

  const walletBalance =
    player
      .wallet_balance_microusd ==
    null
      ? 0
      : safeMoneyInt(
          player
            .wallet_balance_microusd
        );

  const response =
    json({
      public_id:
        player.public_id,

    username:
      player.username ||
      null,

    display_name:
      player
        .display_name ||
      null,

    auth_type:
      player.auth_type,

    billing_mode:
      billingModeForPlayer(
        env,
        player
      ),

    legacy_balance_credits:
      player
        .balance_microusd,

    legacy_credit_unit:
      "100_tokens",

    wallet_balance_microusd:
      walletBalance,

    wallet_balance_usd:
      walletBalance /
      1_000_000,

    wallet_currency:
      player
        .wallet_currency ||
      "USD",

    daily_chat_limit:
      null,

      chat_used_today_utc:
        safeInt(
          used?.n
        ),
    });

  const bearer =
    tokenFrom(
      request
    );

  if (
    player.auth_type ===
      "session" &&
    /^yb_s_[A-Za-z0-9_-]{30,}$/.test(
      bearer
    )
  ) {
    return withSessionCookie(
      response,
      bearer,
      player.expires_at
    );
  }

  return response;
}

  return Object.freeze({
    meRoute,
  });
})();

const {
  meRoute,
} = WorkerAccountSelfRoute;

export {
  WorkerAccountSelfRoute,
  meRoute,
};
