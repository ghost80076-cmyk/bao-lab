import {
  WorkerChatInput,
} from "./modules/chat-input.js";

import {
  WorkerHttp,
  cors,
  fail,
  trustedCookieMutation,
  validOrigin,
  withSecurityHeaders,
} from "./modules/http.js";

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
  getDb,
} from "./modules/runtime-config.js";

import {
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
} from "./modules/legacy-chat-settlement.js";

import {
  WorkerCostChatSettlement,
} from "./modules/cost-chat-settlement.js";

import {
  WorkerChatDispatch,
  chatRoute,
} from "./modules/chat-dispatch.js";

import {
  WorkerAdminAuth,
  adminAuthorized,
} from "./modules/admin-auth.js";

import {
  WorkerHealthRoute,
  healthRoute,
} from "./modules/health-route.js";

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
        response =
          await healthRoute(
            env,
            db
          );
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
