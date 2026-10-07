import {
  COST_BILLING_MODE,
  LEGACY_BILLING_MODE,
} from "./modules/billing-constants.js";

import {
  WorkerChatInput,
  normalizeHostedSessionId,
  normalizeMessages,
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
  integer,
  safeMoneyInt,
} from "./modules/number-utils.js";

import {
  WorkerModelPricing,
  actualUsageCostMicrousd,
  ceilDivBigInt,
  computedUsageCostMicrousd,
  costBucketsMicrousd,
  estimatedPromptTokens,
  longContextActive,
  modelAllowed,
  modelConfig,
  modelConfigs,
  pricingRate,
  providerCostMicrousd,
  reservePlan,
  resolvedPricingRates,
  usageForStorage,
} from "./modules/model-pricing.js";

import {
  HOSTED_ROUTE_CONTROL,
  WorkerProviderRouting,
  hostedLogicalModel,
  readHostedRouteOverride,
  resolveHostedRoute,
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
  anthropicPayload,
  geminiErrorHint,
  providerCall,
  providerFailureResponse,
  recoverOpenRouterUsage,
} from "./modules/provider-transport.js";

import {
  WorkerAdminAuth,
  adminAuthorized,
} from "./modules/admin-auth.js";

// Hosted prompt limits are transport / abuse guards, not model context-window limits.
// The browser aims substantially below these values and compacts smart-memory stories
// before reaching the hard ceiling.
const MAX_OUTPUT = 8192;

const LEGACY_CREDIT_TOKEN_UNIT = 100;
const DEFAULT_PRICING_VERSION = "2026-09-25-v1";
const SECURITY_CONTRACT_VERSION = "2026-10-04-1";
const MIN_AFFORDABLE_OUTPUT_TOKENS = 64;

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






// Legacy credit reservation and settlement remain behavior-compatible, but
// now live behind a named boundary instead of sharing the Worker route scope.
// Provider routing/transport and model pricing stay outside this block.
const WorkerLegacyChatSettlement = (() => {
async function legacyChatRoute(
  request,
  env,
  db,
  player,
  body
) {
  const kind =
    body?.request_kind ||
    "chat";

  const requestedProvider =
    body?.provider;

  const requestedModel =
    body?.model;

  const resolvedRoute =
    await resolveHostedRoute(
      db,
      env,
      requestedProvider,
      requestedModel
    );

  const provider =
    resolvedRoute.provider;

  const model =
    resolvedRoute.model;

  const messages =
    normalizeMessages(
      body?.messages
    );

  const sessionId =
    normalizeHostedSessionId(
      body?.session_id
    );

  if (
    sessionId ===
      null
  ) {
    return fail(
      "invalid_session_id"
    );
  }

  if (
    ![
      "chat",
      "status",
      "summary",
    ].includes(
      kind
    ) ||
    !messages ||
    !modelAllowed(
      env,
      provider,
      model
    )
  ) {
    return fail(
      "invalid_request_or_model_not_allowed"
    );
  }

  const maxOutput =
    body
      ?.max_output_tokens ??
    2048;

  if (
    !integer(
      maxOutput,
      1,
      MAX_OUTPUT
    )
  ) {
    return fail(
      "invalid_max_output_tokens"
    );
  }

  // Legacy 模式也不再直接拿 UTF-8 bytes 當 token。
  const reserve =
    Math.max(
      1,

      Math.ceil(
        (
          estimatedPromptTokens(
            messages
          ) +
          maxOutput +
          256
        ) /
        LEGACY_CREDIT_TOKEN_UNIT
      )
    );

  if (
    !integer(
      reserve,
      1,
      100_000_000
    )
  ) {
    return fail(
      "request_budget_too_large"
    );
  }

  const requestId =
    crypto.randomUUID();

  const [
    insertResult,
    debitResult,
  ] =
    await db.batch(
      [
        db
          .prepare(
            `
            INSERT INTO api_usage (
              request_id,
              player_id,
              provider,
              model,
              request_kind,
              status,
              billing_mode
            )

            SELECT
              ?,
              id,
              ?,
              ?,
              ?,
              'pending',
              ?

            FROM players

            WHERE
              id = ?

              AND
              enabled = 1

              AND
              balance_microusd >= ?
            `
          )
          .bind(
            requestId,
            provider,
            model,
            kind,
            LEGACY_BILLING_MODE,
            player.id,
            reserve
          ),

        db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd -
                ?

            WHERE
              id = ?

              AND
              balance_microusd >= ?

              AND EXISTS (
                SELECT 1

                FROM api_usage

                WHERE
                  request_id = ?

                  AND
                  status =
                    'pending'
              )
            `
          )
          .bind(
            reserve,
            player.id,
            reserve,
            requestId
          ),
      ]
    );

  if (
    !insertResult
      .meta
      .changes
  ) {
    return fail(
      "insufficient_credits",
      402
    );
  }

  if (
    !debitResult
      .meta
      .changes
  ) {
    await db
      .prepare(
        `
        UPDATE api_usage

        SET
          status =
            'denied'

        WHERE
          request_id = ?
        `
      )
      .bind(
        requestId
      )
      .run();

    return fail(
      "insufficient_credits",
      402
    );
  }

  const result =
    await providerCall(
      env,
      provider,
      model,
      messages,
      maxOutput,
      player,
      sessionId
    );

  if (
    !result.ok
  ) {
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd +
                ?

            WHERE
              id = ?
            `
          )
          .bind(
            reserve,
            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              status =
                'failed'

            WHERE
              request_id = ?
            `
          )
          .bind(
            requestId
          ),
      ]
    );

    return providerFailureResponse(
      result,
      requestId
    );
  }

  const verified =
    integer(
      result.input,
      0,
      1e9
    ) &&
    integer(
      result.output,
      0,
      1e9
    );

  const stored =
    usageForStorage(
      result
    );

  const actual =
    verified
      ? Math.max(
          1,

          Math.ceil(
            (
              result.input +
              result.output
            ) /
            LEGACY_CREDIT_TOKEN_UNIT
          )
        )
      : reserve;

  let charged =
    reserve;

  let status =
    verified
      ? "ok"
      : "unverified";

  if (
    verified &&
    actual <=
      reserve
  ) {
    charged =
      actual;

    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd +
                ?

            WHERE
              id = ?
            `
          )
          .bind(
            reserve -
            charged,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              input_tokens = ?,
              fresh_input_tokens = ?,
              cached_tokens = ?,
              cache_write_tokens = ?,
              output_tokens = ?,
              reasoning_tokens = ?,

              provider_cost_microusd = ?,

              cost_microusd = ?,
              billing_mode = ?,

              status =
                'ok'

            WHERE
              request_id = ?
            `
          )
          .bind(
            stored.input,
            stored.freshInput,
            stored.cached,
            stored.cacheWrite,
            stored.output,
            stored.reasoning,

            stored
              .providerCostMicrousd,

            charged,
            LEGACY_BILLING_MODE,
            requestId
          ),
      ]
    );
  }

  else if (
    verified
  ) {
    const extra =
      actual -
      reserve;

    const extraDebit =
      await db
        .prepare(
          `
          UPDATE players

          SET
            balance_microusd =
              balance_microusd -
              ?

          WHERE
            id = ?

            AND
            enabled = 1

            AND
            balance_microusd >= ?
          `
        )
        .bind(
          extra,
          player.id,
          extra
        )
        .run();

    if (
      extraDebit
        .meta
        .changes
    ) {
      charged =
        actual;

      await db
        .prepare(
          `
          UPDATE api_usage

          SET
            input_tokens = ?,
            fresh_input_tokens = ?,
            cached_tokens = ?,
            cache_write_tokens = ?,
            output_tokens = ?,
            reasoning_tokens = ?,

            provider_cost_microusd = ?,

            cost_microusd = ?,
            billing_mode = ?,

            status =
              'ok'

          WHERE
            request_id = ?
          `
        )
        .bind(
          stored.input,
          stored.freshInput,
          stored.cached,
          stored.cacheWrite,
          stored.output,
          stored.reasoning,

          stored
            .providerCostMicrousd,

          charged,
          LEGACY_BILLING_MODE,
          requestId
        )
        .run();
    }

    else {
      status =
        "over_budget";

      await db.batch(
        [
          db
            .prepare(
              `
              UPDATE players

              SET
                balance_microusd =
                  0

              WHERE
                id = ?
              `
            )
            .bind(
              player.id
            ),

          db
            .prepare(
              `
              UPDATE api_usage

              SET
                input_tokens = ?,
                fresh_input_tokens = ?,
                cached_tokens = ?,
                cache_write_tokens = ?,
                output_tokens = ?,
                reasoning_tokens = ?,

                provider_cost_microusd = ?,

                cost_microusd = ?,
                billing_mode = ?,

                status =
                  'over_budget'

              WHERE
                request_id = ?
              `
            )
            .bind(
              stored.input,
              stored.freshInput,
              stored.cached,
              stored.cacheWrite,
              stored.output,
              stored.reasoning,

              stored
                .providerCostMicrousd,

              reserve,
              LEGACY_BILLING_MODE,
              requestId
            ),
        ]
      );

      return fail(
        "settlement_balance_exhausted",
        402,
        {
          request_id:
            requestId,
        }
      );
    }
  }

  else {
    await db
      .prepare(
        `
        UPDATE api_usage

        SET
          input_tokens = ?,
          fresh_input_tokens = ?,
          cached_tokens = ?,
          cache_write_tokens = ?,
          output_tokens = ?,
          reasoning_tokens = ?,

          provider_cost_microusd = ?,

          cost_microusd = ?,
          billing_mode = ?,

          status =
            'unverified'

        WHERE
          request_id = ?
        `
      )
      .bind(
        stored.input,
        stored.freshInput,        stored.cached,
        stored.cacheWrite,
        stored.output,
        stored.reasoning,

        stored
          .providerCostMicrousd,

        reserve,
        LEGACY_BILLING_MODE,
        requestId
      )
      .run();
  }

  return json({
    request_id:
      requestId,

    provider,
    model,

    hosted_route: {
      logical_model_id:
        resolvedRoute
          .logical_model_id,

      route_id:
        resolvedRoute
          .route_id,

      overridden:
        resolvedRoute
          .overridden,

      fallback:
        resolvedRoute
          .fallback,
    },

    content:
      result.text,

    usage: {
      input_tokens:
        verified
          ? stored.input
          : null,

      fresh_input_tokens:
        verified
          ? stored.freshInput
          : null,

      cached_tokens:
        verified
          ? stored.cached
          : null,

      cache_write_tokens:
        verified
          ? stored.cacheWrite
          : null,

      output_tokens:
        verified
          ? stored.output
          : null,

      reasoning_tokens:
        verified
          ? stored.reasoning
          : null,

      provider_cost_usd:
        stored
          .providerCostMicrousd ==
        null
          ? null
          : stored
              .providerCostMicrousd /
            1_000_000,

      charged_credits:
        charged,

      credit_unit:
        "100_tokens",

      estimated_or_unverified:
        status !==
        "ok",

      billing_mode:
        LEGACY_BILLING_MODE,
    },
  });
}

  return Object.freeze({
    legacyChatRoute,
  });
})();

const {
  legacyChatRoute,
} = WorkerLegacyChatSettlement;

// USD wallet reservation and settlement are kept separate from legacy credits,
// provider transport and the outer chat dispatcher so money state has one owner.
const WorkerCostChatSettlement = (() => {
async function costUsdChatRoute(
  request,
  env,
  db,
  player,
  body
) {
  if (
    !player
      .wallet_enabled
  ) {
    return fail(
      "wallet_disabled",
      403
    );
  }

  const kind =
    body
      ?.request_kind ||
    "chat";

  const requestedProvider =
    body?.provider;

  const requestedModel =
    body?.model;

  const resolvedRoute =
    await resolveHostedRoute(
      db,
      env,
      requestedProvider,
      requestedModel
    );

  const provider =
    resolvedRoute.provider;

  const model =
    resolvedRoute.model;

  const messages =
    normalizeMessages(
      body?.messages
    );

  const sessionId =
    normalizeHostedSessionId(
      body?.session_id
    );

  if (
    sessionId ===
      null
  ) {
    return fail(
      "invalid_session_id"
    );
  }

  const config =
    modelConfig(
      env,
      provider,
      model
    );

  if (
    ![
      "chat",
      "status",
      "summary",
    ].includes(
      kind
    ) ||
    !messages ||
    !config
  ) {
    return fail(
      "invalid_request_or_model_not_allowed"
    );
  }

  const requestedMaxOutput =
    body
      ?.max_output_tokens ??
    2048;

  if (
    !integer(
      requestedMaxOutput,
      1,
      MAX_OUTPUT
    )
  ) {
    return fail(
      "invalid_max_output_tokens"
    );
  }

  const walletBalance =
    safeMoneyInt(
      player
        .wallet_balance_microusd
    );

  const plan =
    reservePlan(
      config,
      messages,
      requestedMaxOutput,
      walletBalance
    );

  if (!plan) {
    return fail(
      "pricing_not_configured",
      503
    );
  }

  if (!plan.ok) {
    return fail(
      "insufficient_wallet_balance",
      402,
      {
        wallet_balance_microusd:
          walletBalance,

        wallet_balance_usd:
          walletBalance /
          1_000_000,

        estimated_input_tokens:
          plan
            .estimatedInputTokens,

        affordable_output_tokens:
          plan
            .affordableOutputTokens ??
          0,
      }
    );
  }

  const requestId =
    crypto.randomUUID();

  const pricingVersion =
    String(
      env.PRICING_VERSION ||
      DEFAULT_PRICING_VERSION
    ).slice(
      0,
      80
    );

  const inserted =
    await db
      .prepare(
        `
        INSERT INTO api_usage (
          request_id,
          player_id,
          provider,
          model,
          request_kind,
          status,
          billing_mode,
          pricing_version
        )

        VALUES (
          ?,
          ?,
          ?,
          ?,
          ?,
          'pending',
          ?,
          ?
        )
        `
      )
      .bind(
        requestId,
        player.id,
        provider,
        model,
        kind,
        COST_BILLING_MODE,
        pricingVersion
      )
      .run();

  if (
    !inserted
      .meta
      .changes
  ) {
    return fail(
      "usage_reservation_failed",
      500
    );
  }

  let reserveDebit = {
    meta: {
      changes:
        1,
    },
  };

  // A fully free model has nothing to reserve. Avoid relying on a
  // database no-op UPDATE being reported as a changed row.
  if (
    plan
      .reserveMicrousd >
    0
  ) {
    reserveDebit =
      await db
        .prepare(
          `
          UPDATE wallets

          SET
            balance_microusd =
              balance_microusd -
              ?,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            player_id = ?

            AND
            enabled = 1

            AND
            balance_microusd >= ?
          `
        )
        .bind(
          plan
            .reserveMicrousd,

          player.id,

          plan
            .reserveMicrousd
        )
        .run();
  }

  if (
    !reserveDebit
      .meta
      .changes
  ) {
    await db
      .prepare(
        `
        UPDATE api_usage

        SET
          status =
            'denied'

        WHERE
          request_id = ?
        `
      )
      .bind(
        requestId
      )
      .run();

    return fail(
      "insufficient_wallet_balance",
      402
    );
  }

  const result =
    await providerCall(
      env,
      provider,
      model,
      messages,
      plan
        .effectiveMaxOutput,
      player,
      sessionId
    );

  if (
    !result.ok
  ) {
    const ambiguousTransportFailure =
      result.category ===
        "relay_network_error" ||
      result.category ===
        "provider_network_error";

    if (
      ambiguousTransportFailure
    ) {
      await db.batch(
        [
          db
            .prepare(
              `
              UPDATE wallets

              SET
                balance_microusd =
                  balance_microusd +
                  ?,

                updated_at =
                  CURRENT_TIMESTAMP

              WHERE
                player_id = ?
              `
            )
            .bind(
              plan
                .reserveMicrousd,

              player.id
            ),

          db
            .prepare(
              `
              UPDATE api_usage

              SET
                cost_microusd = 0,
                settled_cost_microusd = 0,

                balance_before_microusd = ?,
                balance_after_microusd = ?,

                billing_mode = ?,
                pricing_version = ?,

                status =
                  'unverified_refunded'

              WHERE
                request_id = ?
              `
            )
            .bind(
              walletBalance,
              walletBalance,

              COST_BILLING_MODE,
              pricingVersion,

              requestId
            ),
        ]
      );

      return fail(
        "provider_usage_unverified",
        502,
        {
          request_id:
            requestId,

          billing_refunded:
            true,

          route:
            [
              "aws_relay",
              "direct_openrouter",
              "direct_anthropic",
              "provider_direct",
            ].includes(
              result.route
            )
              ? result.route
              : undefined,

          request_bytes:
            integer(
              result.requestBytes,
              1,
              10_000_000
            )
              ? result.requestBytes
              : undefined,

          elapsed_ms:
            integer(
              result.elapsedMs,
              0,
              600_000
            )
              ? result.elapsedMs
              : undefined,

          timeout_ms:
            integer(
              result.transportTimeoutMs,
              1,
              600_000
            )
              ? result.transportTimeoutMs
              : undefined,

          transport_failure:
            [
              "timeout",
              "network",
            ].includes(
              result.transportFailure
            )
              ? result.transportFailure
              : undefined,
        }
      );
    }

    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                balance_microusd +
                ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            plan
              .reserveMicrousd,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              cost_microusd =
                0,

              settled_cost_microusd =
                0,

              balance_before_microusd =
                ?,

              balance_after_microusd =
                ?,

              status =
                'failed'

            WHERE
              request_id = ?
            `
          )
          .bind(
            walletBalance,
            walletBalance,
            requestId
          ),
      ]
    );

    return providerFailureResponse(
      result,
      requestId
    );
  }

  const verified =
    integer(
      result.input,
      0,
      1e9
    ) &&
    integer(
      result.output,
      0,
      1e9
    );

  const stored =
    usageForStorage(
      result
    );

  if (!verified) {
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                balance_microusd +
                ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            plan
              .reserveMicrousd,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              input_tokens = ?,
              fresh_input_tokens = ?,
              cached_tokens = ?,
              cache_write_tokens = ?,
              output_tokens = ?,
              reasoning_tokens = ?,

              provider_cost_microusd = ?,

              cost_microusd = 0,
              settled_cost_microusd = 0,

              balance_before_microusd = ?,
              balance_after_microusd = ?,

              billing_mode = ?,
              pricing_version = ?,

              status =
                'unverified_refunded'

            WHERE
              request_id = ?
            `
          )
          .bind(
            stored.input,
            stored.freshInput,
            stored.cached,
            stored.cacheWrite,
            stored.output,
            stored.reasoning,

            stored
              .providerCostMicrousd,

            walletBalance,
            walletBalance,

            COST_BILLING_MODE,
            pricingVersion,

            requestId
          ),
      ]
    );

    return json({
      request_id:
        requestId,

      provider,
      model,

      hosted_route: {
        logical_model_id:
          resolvedRoute
            .logical_model_id,

        route_id:
          resolvedRoute
            .route_id,

        overridden:
          resolvedRoute
            .overridden,

        fallback:
          resolvedRoute
            .fallback,
      },

      content:
        result.text,

      usage: {
        input_tokens:
          null,

        fresh_input_tokens:
          null,

        cached_tokens:
          null,

        cache_write_tokens:
          null,

        output_tokens:
          null,

        reasoning_tokens:
          null,

        provider_cost_microusd:
          stored
            .providerCostMicrousd,

        provider_cost_usd:
          stored
            .providerCostMicrousd ==
          null
            ? null
            : stored
                .providerCostMicrousd /
              1_000_000,

        actual_cost_microusd:
          0,

        actual_cost_usd:
          0,

        charged_microusd:
          0,

        charged_usd:
          0,

        wallet_balance_microusd:
          walletBalance,

        wallet_balance_usd:
          walletBalance /
          1_000_000,

        billing_mode:
          COST_BILLING_MODE,

        pricing_version:
          pricingVersion,

        settlement_status:
          "unverified_refunded",

        estimated_or_unverified:
          true,
      },
    });
  }

  const actualCost =
    actualUsageCostMicrousd(
      config,
      stored
    );

  if (
    actualCost === null ||
    !integer(
      actualCost,
      0,
      1_000_000_000_000
    )
  ) {
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                balance_microusd +
                ?,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            plan
              .reserveMicrousd,

            player.id
          ),

        db
          .prepare(
            `
            UPDATE api_usage

            SET
              status =
                'pricing_error'

            WHERE
              request_id = ?
            `
          )
          .bind(
            requestId
          ),
      ]
    );

    return fail(
      "pricing_calculation_failed",
      503,
      {
        request_id:
          requestId,
      }
    );
  }

  let charged =
    actualCost;

  let settlementStatus =
    "ok";

  if (
    actualCost <=
    plan
      .reserveMicrousd
  ) {
    const refund =
      plan
        .reserveMicrousd -
      actualCost;

    if (
      refund > 0
    ) {
      await db
        .prepare(
          `
          UPDATE wallets

          SET
            balance_microusd =
              balance_microusd +
              ?,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            player_id = ?
          `
        )
        .bind(
          refund,
          player.id
        )
        .run();
    }
  }

  else {
    const extra =
      actualCost -
      plan
        .reserveMicrousd;

    const extraDebit =
      await db
        .prepare(
          `
          UPDATE wallets

          SET
            balance_microusd =
              balance_microusd -
              ?,

            updated_at =
              CURRENT_TIMESTAMP

          WHERE
            player_id = ?

            AND
            enabled = 1

            AND
            balance_microusd >= ?
          `
        )
        .bind(
          extra,
          player.id,
          extra
        )
        .run();

    if (
      !extraDebit
        .meta
        .changes
    ) {
      const remaining =
        await db
          .prepare(
            `
            SELECT
              balance_microusd

            FROM wallets

            WHERE
              player_id = ?
            `
          )
          .bind(
            player.id
          )
          .first();

      const collectable =
        safeMoneyInt(
          remaining
            ?.balance_microusd
        );

      if (
        collectable > 0
      ) {
        await db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd =
                0,

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            player.id
          )
          .run();
      }

      charged =
        plan
          .reserveMicrousd +
        collectable;

      settlementStatus =
        "over_budget";
    }
  }

  const finalWallet =
    await db
      .prepare(
        `
        SELECT
          balance_microusd

        FROM wallets

        WHERE
          player_id = ?
        `
      )
      .bind(
        player.id
      )
      .first();

  const balanceAfter =
    safeMoneyInt(
      finalWallet
        ?.balance_microusd
    );

  const balanceBefore =
    balanceAfter +
    charged;

  const ledgerId =
    crypto.randomUUID();

  await db.batch(
    [
      db
        .prepare(
          `
          UPDATE api_usage

          SET
            input_tokens = ?,
            fresh_input_tokens = ?,
            cached_tokens = ?,
            cache_write_tokens = ?,
            output_tokens = ?,
            reasoning_tokens = ?,

            provider_cost_microusd = ?,

            cost_microusd = ?,
            settled_cost_microusd = ?,

            balance_before_microusd = ?,
            balance_after_microusd = ?,

            billing_mode = ?,
            pricing_version = ?,
            status = ?

          WHERE
            request_id = ?
          `
        )
        .bind(
          stored.input,
          stored.freshInput,
          stored.cached,
          stored.cacheWrite,
          stored.output,
          stored.reasoning,

          stored
            .providerCostMicrousd,

          actualCost,
          charged,

          balanceBefore,
          balanceAfter,

          COST_BILLING_MODE,
          pricingVersion,
          settlementStatus,

          requestId
        ),

      db
        .prepare(
          `
          INSERT INTO wallet_ledger (
            ledger_id,
            player_id,
            entry_type,
            amount_microusd,

            balance_before_microusd,
            balance_after_microusd,

            request_id,
            reference_id,
            note
          )

          VALUES (
            ?,
            ?,
            'usage',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
          )
          `
        )
        .bind(
          ledgerId,
          player.id,

          -charged,

          balanceBefore,
          balanceAfter,

          requestId,

          `${provider}:${model}`,

          settlementStatus
        ),
    ]
  );

  return json({
    request_id:
      requestId,

    provider,
    model,

    hosted_route: {
      logical_model_id:
        resolvedRoute
          .logical_model_id,

      route_id:
        resolvedRoute
          .route_id,

      overridden:
        resolvedRoute
          .overridden,

      fallback:
        resolvedRoute
          .fallback,
    },

    content:
      result.text,

    usage: {
      input_tokens:
        stored.input,

      fresh_input_tokens:
        stored.freshInput,

      cached_tokens:
        stored.cached,

      cache_write_tokens:
        stored.cacheWrite,

      output_tokens:
        stored.output,

      reasoning_tokens:
        stored.reasoning,

      provider_cost_microusd:
        stored
          .providerCostMicrousd,

      provider_cost_usd:
        stored
          .providerCostMicrousd ==
        null
          ? null
          : stored
              .providerCostMicrousd /
            1_000_000,

      actual_cost_microusd:
        actualCost,

      actual_cost_usd:
        actualCost /
        1_000_000,

      charged_microusd:
        charged,

      charged_usd:
        charged /
        1_000_000,

      wallet_balance_microusd:
        balanceAfter,

      wallet_balance_usd:
        balanceAfter /
        1_000_000,

      requested_max_output_tokens:
        requestedMaxOutput,

      effective_max_output_tokens:
        plan
          .effectiveMaxOutput,

      estimated_input_tokens_for_reserve:
        plan
          .estimatedInputTokens,

      reserve_microusd:
        plan
          .reserveMicrousd,

      pricing_tier:
        plan
          .pricingTier ||
        "standard",

      openrouter_max_prompt_usd_per_million:
        plan
          .openRouterMaxPromptMicrousdPerMillion ==
        null
          ? null
          : plan
              .openRouterMaxPromptMicrousdPerMillion /
            1_000_000,

      openrouter_max_completion_usd_per_million:
        plan
          .openRouterMaxCompletionMicrousdPerMillion ==
        null
          ? null
          : plan
              .openRouterMaxCompletionMicrousdPerMillion /
            1_000_000,

      billing_mode:
        COST_BILLING_MODE,

      pricing_version:
        pricingVersion,

      settlement_status:
        settlementStatus,

      estimated_or_unverified:
        settlementStatus !==
        "ok",
    },
  });
}

  return Object.freeze({
    costUsdChatRoute,
  });
})();

const {
  costUsdChatRoute,
} = WorkerCostChatSettlement;

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
