import {
  COST_BILLING_MODE,
} from "./billing-constants.js";

import {
  costUsdChatRoute,
} from "./cost-chat-settlement.js";

import {
  fail,
  readJson,
} from "./http.js";

import {
  legacyChatRoute,
} from "./legacy-chat-settlement.js";

import {
  billingModeForPlayer,
} from "./runtime-config.js";

import {
  playerFor,
} from "./session-auth.js";

// The outer chat route owns only authentication, body parsing and billing-mode
// dispatch. Reservation and settlement remain in their dedicated boundaries.
const WorkerChatDispatch = (() => {
async function chatRoute(
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

  const body =
    await readJson(
      request
    );

  return (
    billingModeForPlayer(
      env,
      player
    ) ===
    COST_BILLING_MODE
  )
    ? costUsdChatRoute(
        request,
        env,
        db,
        player,
        body
      )
    : legacyChatRoute(
        request,
        env,        db,
        player,
        body
      );
}

  return Object.freeze({
    chatRoute,
  });
})();

const {
  chatRoute,
} = WorkerChatDispatch;

export {
  WorkerChatDispatch,
  chatRoute,
};
