import {
  COST_BILLING_MODE,
  LEGACY_BILLING_MODE,
} from "./modules/billing-constants.js";

import {
  WorkerChatInput,
} from "./modules/chat-input.js";

import {
  WorkerHttp,
  cors,
  fail,
  json,
  readJson,
  trustedCookieMutation,
  validOrigin,
  withSecurityHeaders,
} from "./modules/http.js";

import {
  playerFor,
} from "./modules/session-auth.js";

import {
  WorkerAccountAuth,
  authLogin,
  authLogout,
  authRecover,
  authRegister,
} from "./modules/account-auth.js";

import {
  WorkerAccountSelfRoute,
  meRoute,
} from "./modules/account-self-route.js";

import {
  WorkerAccountAuthorRoutes,
  accountAuthorRoute,
} from "./modules/account-author-routes.js";

import {
  authRateLimitConfigured,
} from "./modules/account-rate-limit.js";

import {
  WorkerPublicationFormat,
  base64ToUtf8,
  characterBucket,
  cleanStringList,
  mergeAuthorProfile,
  mergePublishedCatalogEntry,
  plainObject,
  prepareCharacterPublication,
  publishError,
  redactPublishSecrets,
  utf8ToBase64,
} from "./modules/publication-format.js";

import {
  WorkerGithubPublicationTransport,
  createCharacterPublicationPr,
  githubApi,
  githubSettings,
} from "./modules/github-publication-transport.js";

import {
  WorkerAdminPublicationRoutes,
  adminPublicationRoute,
} from "./modules/admin-publication-routes.js";

import {
  WorkerAdminProviderControlRoutes,
  adminProviderControlRoute,
} from "./modules/admin-provider-control-routes.js";

import {
  WorkerAdminUsageRoutes,
  adminUsageRoute,
} from "./modules/admin-usage-routes.js";

import {
  WorkerAdminPlayerDirectoryRoutes,
  adminPlayerDirectoryRoute,
} from "./modules/admin-player-directory-routes.js";

import {
  WorkerAdminPlayerMutationRoutes,
  adminPlayerMutationRoute,
} from "./modules/admin-player-mutation-routes.js";

import {
  WorkerAdminRoutes,
  adminRoute,
  ensureAdminPlayerEvents,
} from "./modules/admin-routes.js";

import {
  WorkerRuntimeConfig,
  awsOpenRouterPlayers,
  billingModeForPlayer,
  billingV2TestPlayers,
  getDb,
  globalBillingMode,
  registrationMode,
  sessionTtlDays,
} from "./modules/runtime-config.js";

import {
  DEFAULT_PRICING_VERSION,
  WorkerModelPricing,
} from "./modules/model-pricing.js";

import {
  WorkerProviderRouting,
} from "./modules/provider-routing.js";

import {
  PROVIDER_CONTROL,
  WorkerProviderControl,
  ensureProviderControlTables,
  providerCumulativeSpendMicrousd,
  providerControlSnapshot,
} from "./modules/provider-control.js";

import {
  WorkerProviderTransport,
} from "./modules/provider-transport.js";

import {
  WorkerLegacyChatSettlement,
  legacyChatRoute,
} from "./modules/legacy-chat-settlement.js";

import {
  WorkerCostChatSettlement,
  costUsdChatRoute,
} from "./modules/cost-chat-settlement.js";

import {
  WorkerAdminAuth,
  adminAuthorized,
} from "./modules/admin-auth.js";

const SECURITY_CONTRACT_VERSION = "2026-10-04-1";

// Internal HTTP/transport boundary. Keep this module-shaped block self-contained so
// it can later move to a Cloudflare Worker module without changing route callers.


// Internal crypto/security boundary. Algorithms and parameters are frozen during
// structural refactors; callers keep the existing helper names below.


// Runtime configuration boundary. Keep environment aliases, rollout allowlists
// and account-mode decisions together so routes do not parse bindings directly.


// Internal model registry / pricing boundary. Keep all pricing, model allowlist
// and reservation math behavior stable while separating it from routes and providers.


// Optional Cloudflare Rate Limiting binding boundary for account credentials.
// Keys are hashed before leaving this module; missing bindings preserve the
// current deployment behavior until the production Worker is configured.


// Internal Hosted provider-routing boundary. It owns logical-model route selection
// and persisted route overrides, but not provider spend controls or network transport.



// Internal publication formatting boundary. This block owns validation,
// sanitization and catalog/profile shaping only; ownership and GitHub transport stay outside.
// Author-profile publication boundary. It owns the profile-specific GitHub PR
// transaction while shared API transport is provided below.


// Internal author-ownership boundary. Public author identity claims are kept
// separate from account/session routes and from public author-profile formatting.


// Shared GitHub publication transport and character-publication transaction.
// Keep repository settings, HTTP policy, and character PR writes off route code.




// Admin publication HTTP subroutes. Formatting and GitHub transport stay in
// their dedicated publication boundaries; this block owns endpoint orchestration.



// Read-only admin usage history and presentation.



// Admin player directory list/create endpoints. Existing-player mutations
// and wallet top-ups remain outside this boundary.



// Existing-player status, legacy credit and USD wallet mutation endpoints.










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

export default {
  async fetch(
    request,
    env
  ) {
    const origin =
      validOrigin(
        request,
        env
      );

    if (
      !origin.allowed
    ) {
      return fail(
        "origin_not_allowed",
        403
      );
    }

    if (
      !trustedCookieMutation(
        request,
        origin
      )
    ) {
      return fail(
        "origin_required",
        403
      );
    }

    if (
      request.method ===
      "OPTIONS"
    ) {
      return cors(
        new Response(
          null,
          {
            status:
              204,
          }
        ),
        origin.origin
      );
    }

    const db =
      getDb(
        env
      );

    if (!db) {
      return cors(
        fail(
          "database_binding_missing",
          503
        ),
        origin.origin
      );
    }

    const url =
      new URL(
        request.url
      );

    try {
      let response;

      if (
        url.pathname ===
          "/health" &&
        request.method ===
          "GET"
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

        response =
          json({
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

      else if (
        url.pathname ===
          "/auth/register" &&
        request.method ===
          "POST"
      ) {
        response =
          await authRegister(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/auth/login" &&
        request.method ===
          "POST"
      ) {
        response =
          await authLogin(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/auth/logout" &&
        request.method ===
          "POST"
      ) {
        response =
          await authLogout(
            request,
            db
          );
      }

      else if (
        url.pathname ===
          "/auth/recover" &&
        request.method ===
          "POST"
      ) {
        response =
          await authRecover(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname.startsWith(
          "/me/authors"
        )
      ) {
        response =
          await accountAuthorRoute(
            request,
            url,
            env,
            db
          );
      }

      else if (
        (
          url.pathname ===
            "/me" ||
          url.pathname ===
            "/auth/me"
        ) &&
        request.method ===
          "GET"
      ) {
        response =
          await meRoute(
            request,
            env,
            db
          );
      }

      else if (
        url.pathname.startsWith(
          "/admin/"
        )
      ) {
        response =
          await adminRoute(
            request,
            url,
            env,
            db
          );
      }

      else if (
        url.pathname ===
          "/chat" &&
        request.method ===
          "POST"
      ) {
        response =
          await chatRoute(
            request,
            env,
            db
          );
      }

      else {
        response =
          fail(
            "not_found",
            404
          );
      }

      return cors(
        response,
        origin.origin
      );
    }

    catch (error) {
      if (
        [
          "empty_body",
          "invalid_json",
          "request_too_large",
        ].includes(
          error?.message
        )
      ) {
        return cors(
          fail(
            error.message,

            error.message ===
              "request_too_large"
              ? 413
              : 400
          ),
          origin.origin
        );
      }

      console.error(
        "yorubay_worker_internal_error",

        String(
          error?.stack ||
          error?.message ||
          error
        ).slice(
          0,
          4000
        )
      );

      return cors(
        fail(
          "internal_error",
          500
        ),
        origin.origin
      );
    }
  },
};
