import {
  authRateLimitConfigured,
} from "./account-rate-limit.js";

import {
  COST_BILLING_MODE,
  LEGACY_BILLING_MODE,
} from "./billing-constants.js";

import {
  json,
} from "./http.js";

import {
  DEFAULT_PRICING_VERSION,
} from "./model-pricing.js";

import {
  awsOpenRouterPlayers,
  billingV2TestPlayers,
  globalBillingMode,
  registrationMode,
  sessionTtlDays,
} from "./runtime-config.js";

const SECURITY_CONTRACT_VERSION = "2026-10-04-1";

// Read-only production diagnostics boundary. It verifies D1 reachability and
// reports runtime configuration without taking ownership of request routing.
const WorkerHealthRoute = (() => {
  async function healthRoute(
    env,
    db
  ) {
    await db
      .prepare(
        `
        SELECT
          id

        FROM players

        LIMIT 1
        `
      )
      .first();

    return json({
      ok:
        true,

      service:
        "yorubay-credits-pilot",

      providers: [
        "gemini",
        "openrouter",
        "anthropic",
      ],

      gemini_route:
        "aws_sydney_relay",

      aws_relay_configured:
        Boolean(
          env.AWS_RELAY_URL &&
          env.BAO_INTERNAL_TOKEN
        ),

      aws_openrouter_players_configured:
        awsOpenRouterPlayers(
          env
        ).size,

      anthropic_configured:
        Boolean(
          env.ANTHROPIC_API_KEY
        ),

      default_billing_mode:
        globalBillingMode(
          env
        ),

      billing_v2_test_players_configured:
        billingV2TestPlayers(
          env
        ).size >
        0,

      billing_modes_available: [
        LEGACY_BILLING_MODE,
        COST_BILLING_MODE,
      ],

      pricing_version:
        String(
          env.PRICING_VERSION ||
          DEFAULT_PRICING_VERSION
        ),

      registration_mode:
        registrationMode(
          env
        ),

      auth_rate_limit_configured:
        authRateLimitConfigured(
          env
        ),

      public_registration_protected:
        registrationMode(
          env
        ) !==
          "open" ||
        authRateLimitConfigured(
          env
        ),

      security_contract_version:
        SECURITY_CONTRACT_VERSION,

      session_ttl_days:
        sessionTtlDays(
          env
        ),

      usage_storage:
        "cache_usage_v2",

      daily_chat_limit_enabled:
        false,

      diagnostic_version:
        "2026-09-29-7.1",
    });
  }

  return Object.freeze({
    healthRoute,
  });
})();

const {
  healthRoute,
} = WorkerHealthRoute;

export {
  WorkerHealthRoute,
  healthRoute,
};
