import {
  WorkerAccountValidation,
  validDisplayName,
  validPassword,
  validUsername,
} from "./modules/account-validation.js";

import {
  WorkerChatInput,
  normalizeHostedSessionId,
  normalizeMessages,
} from "./modules/chat-input.js";

import {
  WorkerCrypto,
  b64UrlToBytes,
  bytesToB64Url,
  constantTimeStringEqual,
  derivePasswordHash,
  newOpaqueToken,
  newRecoveryCode,
  normalizeRecoveryCode,
  passwordMatches,
  passwordRecord,
  publicPlayerId,
  randomBytes,
  sha256Hex,
} from "./modules/crypto.js";

import {
  WorkerHttp,
  SESSION_COOKIE_NAME,
  cors,
  fail,
  json,
  readJson,
  readJsonWithLimit,
  trustedCookieMutation,
  validOrigin,
  withSecurityHeaders,
} from "./modules/http.js";

import {
  WorkerAccountRateLimit,
  accountAuthAllowed,
  authNetworkIdentity,
  authRateLimitConfigured,
  authRateLimitKey,
  authRateLimited,
} from "./modules/account-rate-limit.js";

import {
  WorkerPublicationFormat,
  base64ToUtf8,
  characterBucket,
  cleanStringList,
  mergeAuthorProfile,
  mergePublishedCatalogEntry,
  plainObject,
  prepareAuthorProfileUpdate,
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
  WorkerAuthorProfilePublication,
  createAuthorProfilePr,
} from "./modules/author-profile-publication.js";

import {
  WorkerAuthorOwnership,
  claimAuthorIdentity,
  ensureAuthorOwnerships,
  ownedAuthorIdentities,
  prepareAuthorIdentityClaim,
  publicAuthorIdExists,
} from "./modules/author-ownership.js";

import {
  WorkerAdminPublicationRoutes,
  adminPublicationRoute,
} from "./modules/admin-publication-routes.js";

import {
  WorkerAdminUsageRoutes,
  adminUsageRoute,
} from "./modules/admin-usage-routes.js";

import {
  WorkerAdminPlayerDirectoryRoutes,
  adminPlayerDirectoryRoute,
} from "./modules/admin-player-directory-routes.js";

import {
  WorkerRuntimeConfig,
  awsOpenRouterPlayers,
  billingModeForPlayer,
  billingV2TestPlayers,
  getDb,
  globalBillingMode,
  playerUsesAwsOpenRouter,
  registrationMode,
  sessionTtlDays,
} from "./modules/runtime-config.js";

import {
  WorkerAdminAuth,
  adminAuthorized,
} from "./modules/admin-auth.js";

// Hosted prompt limits are transport / abuse guards, not model context-window limits.
// The browser aims substantially below these values and compacts smart-memory stories
// before reaching the hard ceiling.
const MAX_ADMIN_PUBLISH_BODY_BYTES = 2_500_000;
const MAX_OUTPUT = 8192;

const LEGACY_CREDIT_TOKEN_UNIT = 100;
const LEGACY_BILLING_MODE = "raw_tokens_v1";
const COST_BILLING_MODE = "cost_usd_v2";
const DEFAULT_PRICING_VERSION = "2026-09-25-v1";
const DEFAULT_SESSION_TTL_DAYS = 30;
const SECURITY_CONTRACT_VERSION = "2026-10-04-1";
const MIN_AFFORDABLE_OUTPUT_TOKENS = 64;

const enc = new TextEncoder();

const integer = (n, min, max) =>
  Number.isSafeInteger(n) &&
  n >= min &&
  n <= max;

const safeInt = (n) =>
  integer(n, 0, 1_000_000_000)
    ? n
    : 0;

const usageInt = (n) =>
  integer(n, 0, 1_000_000_000)
    ? n
    : null;

const safeMoneyInt = (n) =>
  integer(n, 0, 9_000_000_000_000)
    ? n
    : 0;

// Internal HTTP/transport boundary. Keep this module-shaped block self-contained so
// it can later move to a Cloudflare Worker module without changing route callers.


// Internal crypto/security boundary. Algorithms and parameters are frozen during
// structural refactors; callers keep the existing helper names below.


// Internal session/authentication boundary. It owns credential extraction,
// session-cookie handling, authenticated player lookup and session creation.
// Registration/login/recovery route policy stays outside this block.
const WorkerSessionAuth = (() => {
  function tokenFrom(
    request
  ) {
    const header =
      request.headers.get(
        "authorization"
      ) || "";
  
    return header.startsWith(
      "Bearer "
    )
      ? header.slice(7)
      : "";
  }
  
  function cookieFrom(
    request,
    name
  ) {
    const raw =
      request.headers.get(
        "cookie"
      ) || "";
  
    for (
      const part of
        raw.split(";")
    ) {
      const item =
        part.trim();
  
      const prefix =
        `${name}=`;
  
      if (
        item.startsWith(
          prefix
        )
      ) {
        try {
          return decodeURIComponent(
            item.slice(
              prefix.length
            )
          );
        } catch (_) {
          return "";
        }
      }
    }
  
    return "";
  }
  
  function sessionTokenFrom(
    request
  ) {
    return (
      tokenFrom(
        request
      ) ||
      cookieFrom(
        request,
        SESSION_COOKIE_NAME
      )
    );
  }
  
  function responseWithCookie(
    response,
    cookie
  ) {
    const headers =
      new Headers(
        response.headers
      );
  
    headers.append(
      "set-cookie",
      cookie
    );
  
    return new Response(
      response.body,
      {
        status:
          response.status,
  
        headers,
      }
    );
  }
  
  function withSessionCookie(
    response,
    token,
    expiresAt
  ) {
    const expires =
      new Date(
        expiresAt
      );
  
    const maxAge =
      Number.isFinite(
        expires.getTime()
      )
        ? Math.max(
            0,
            Math.floor(
              (
                expires.getTime() -
                Date.now()
              ) /
                1000
            )
          )
        : DEFAULT_SESSION_TTL_DAYS *
          86400;
  
    return responseWithCookie(
      response,
      `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
    );
  }
  
  function clearSessionCookie(
    response
  ) {
    return responseWithCookie(
      response,
      `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
    );
  }

  async function playerFor(
    request,
    db
  ) {
    const token =
      sessionTokenFrom(
        request
      );
  
    if (
      !token ||
      token.length >
        512
    ) {
      return null;
    }
  
    const tokenHash =
      await sha256Hex(
        token
      );
  
    const sessionPlayer =
      await db
        .prepare(
          `
          SELECT
            p.id,
            p.public_id,
            p.balance_microusd,
            p.daily_chat_limit,
            p.enabled,
  
            w.balance_microusd
              AS wallet_balance_microusd,
  
            w.currency
              AS wallet_currency,
  
            w.billing_mode
              AS wallet_billing_mode,
  
            w.enabled
              AS wallet_enabled,
  
            a.username,
            a.display_name,
  
            s.session_id,
            s.expires_at
  
          FROM auth_sessions s
  
          JOIN players p
            ON p.id =
              s.player_id
  
          LEFT JOIN wallets w
            ON w.player_id =
              p.id
  
          LEFT JOIN accounts a
            ON a.player_id =
              p.id
  
          WHERE
            s.token_hash = ?
  
            AND
            s.revoked_at
              IS NULL
  
            AND
            datetime(
              s.expires_at
            ) >
            datetime('now')
  
          LIMIT 1
          `
        )
        .bind(
          tokenHash
        )
        .first();
  
    if (
      sessionPlayer
    ) {
      return {
        ...sessionPlayer,
  
        auth_type:
          "session",
      };
    }
  
    const legacyPlayer =
      await db
        .prepare(
          `
          SELECT
            p.id,
            p.public_id,
            p.balance_microusd,
            p.daily_chat_limit,
            p.enabled,
  
            w.balance_microusd
              AS wallet_balance_microusd,
  
            w.currency
              AS wallet_currency,
  
            w.billing_mode
              AS wallet_billing_mode,
  
            w.enabled
              AS wallet_enabled,
  
            a.username,
            a.display_name
  
          FROM players p
  
          LEFT JOIN wallets w
            ON w.player_id =
              p.id
  
          LEFT JOIN accounts a
            ON a.player_id =
              p.id
  
          WHERE
            p.token_hash = ?
  
          LIMIT 1
          `
        )
        .bind(
          tokenHash
        )
        .first();
  
    return legacyPlayer
      ? {
          ...legacyPlayer,
  
          auth_type:
            "legacy",
        }
      : null;
  }
  
  async function createSession(
    db,
    playerId,
    env
  ) {
    const sessionToken =
      newOpaqueToken(
        "yb_s_",
        32
      );
  
    const sessionId =
      crypto.randomUUID();
  
    const expires =
      new Date(
        Date.now() +
        sessionTtlDays(
          env
        ) *
        86400_000
      ).toISOString();
  
    await db
      .prepare(
        `
        INSERT INTO auth_sessions (
          session_id,
          player_id,
          token_hash,
          expires_at,
          created_at,
          last_seen_at
        )
  
        VALUES (
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        `
      )
      .bind(
        sessionId,
        playerId,
        await sha256Hex(
          sessionToken
        ),
        expires
      )
      .run();
  
    return {
      sessionToken,
      sessionId,
  
      expiresAt:
        expires,
    };
  }

  return Object.freeze({
    tokenFrom,
    cookieFrom,
    sessionTokenFrom,
    responseWithCookie,
    withSessionCookie,
    clearSessionCookie,
    playerFor,
    createSession,
  });
})();

const {
  tokenFrom,
  cookieFrom,
  sessionTokenFrom,
  responseWithCookie,
  withSessionCookie,
  clearSessionCookie,
  playerFor,
  createSession,
} = WorkerSessionAuth;

// Runtime configuration boundary. Keep environment aliases, rollout allowlists
// and account-mode decisions together so routes do not parse bindings directly.


// Internal model registry / pricing boundary. Keep all pricing, model allowlist
// and reservation math behavior stable while separating it from routes and providers.
const WorkerModelPricing = (() => {
  function modelConfigs(
    env
  ) {
    const configs =
      [];
  
    for (
      const raw
      of [
        env.MODELS_JSON,
        env.MODELS_JSON_EXTRA,
      ]
    ) {
      if (!raw) {
        continue;
      }
  
      try {
        const parsed =
          JSON.parse(
            raw
          );
  
        if (
          Array.isArray(
            parsed
          )
        ) {
          configs.push(
            ...parsed
          );
        }
      }
  
      catch {
        // Ignore one malformed shard instead of discarding the other
        // valid allowlist shard.
      }
    }
  
    return configs;
  }
  
  function modelConfig(
    env,
    provider,
    model
  ) {
    return (
      modelConfigs(
        env
      ).find(
        (m) =>
          m?.provider ===
            provider &&
          m?.model ===
            model
      ) ||
      null
    );
  }
  
  function modelAllowed(
    env,
    provider,
    model
  ) {
    return Boolean(
      modelConfig(
        env,
        provider,
        model
      )
    );
  }
  
  function pricingRate(
    config,
    key
  ) {
    const value =
      Number(
        config?.[key]
      );
  
    return (
      Number.isSafeInteger(
        value
      ) &&
      value >= 0
    )
      ? value
      : null;
  }
  
  function longContextActive(
    config,
    inputTokens
  ) {
    const threshold =
      pricingRate(
        config,
        "long_context_threshold_tokens"
      );
  
    return (
      threshold !== null &&
      threshold > 0 &&
      Number.isSafeInteger(
        inputTokens
      ) &&
      inputTokens >
        threshold
    );
  }
  
  function resolvedPricingRates(
    config,
    inputTokens
  ) {
    const longContext =
      longContextActive(
        config,
        inputTokens
      );
  
    const rate = (
      key
    ) => {
      if (longContext) {
        const tiered =
          pricingRate(
            config,
            `long_context_${key}`
          );
  
        if (
          tiered !== null
        ) {
          return tiered;
        }
      }
  
      return pricingRate(
        config,
        key
      );
    };
  
    const inputRate =
      rate(
        "input_microusd_per_million"
      );
  
    const outputRate =
      rate(
        "output_microusd_per_million"
      );
  
    return {
      longContext,
      inputRate,
      outputRate,
  
      cacheReadRate:
        rate(
          "cache_read_microusd_per_million"
        ) ??
        inputRate,
  
      cacheWriteRate:
        rate(
          "cache_write_microusd_per_million"
        ) ??
        inputRate,
    };
  }
  
  function openRouterPriceGuard(
    config,
    inputTokens
  ) {
    if (
      config?.provider !==
        "openrouter"
    ) {
      return null;
    }
  
    const rates =
      resolvedPricingRates(
        config,
        inputTokens
      );
  
    if (
      rates.inputRate ===
        null ||
      rates.outputRate ===
        null
    ) {
      return null;
    }
  
    const longPrefix =
      rates.longContext
        ? "long_context_"
        : "";
  
    const promptRate =
      pricingRate(
        config,
        `${longPrefix}openrouter_max_prompt_microusd_per_million`
      ) ??
      pricingRate(
        config,
        "openrouter_max_prompt_microusd_per_million"
      ) ??
      rates.inputRate;
  
    const completionRate =
      pricingRate(
        config,
        `${longPrefix}openrouter_max_completion_microusd_per_million`
      ) ??
      pricingRate(
        config,
        "openrouter_max_completion_microusd_per_million"
      ) ??
      rates.outputRate;
  
    return {
      promptRate,
      completionRate,
  
      longContext:
        rates.longContext,
  
      provider: {
        max_price: {
          prompt:
            promptRate /
            1_000_000,
  
          completion:
            completionRate /
            1_000_000,
        },
      },
    };
  }
  
  function ceilDivBigInt(
    n,
    d
  ) {
    return (
      (
        n +
        d -
        1n
      ) /
      d
    );
  }
  
  function costBucketsMicrousd(
    buckets
  ) {
    let numerator =
      0n;
  
    for (
      const [
        tokens,
        rate,
      ]
      of buckets
    ) {
      if (
        !Number.isSafeInteger(
          tokens
        ) ||
        tokens < 0 ||
        !Number.isSafeInteger(
          rate
        ) ||
        rate < 0
      ) {
        return null;
      }
  
      numerator +=
        BigInt(
          tokens
        ) *
        BigInt(
          rate
        );
    }
  
    const value =
      ceilDivBigInt(
        numerator,
        1_000_000n
      );
  
    if (
      value >
      BigInt(
        Number.MAX_SAFE_INTEGER
      )
    ) {
      return null;
    }
  
    return Number(
      value
    );
  }
  
  function providerCostMicrousd(
    value
  ) {
    if (
      value === null ||
      value === undefined ||
      value === ""
    ) {
      return null;
    }
  
    const cost =
      Number(
        value
      );
  
    if (
      !Number.isFinite(
        cost
      ) ||
      cost < 0
    ) {
      return null;
    }
  
    const microusd =
      Math.round(
        cost *
        1_000_000
      );
  
    return Number.isSafeInteger(
      microusd
    )
      ? microusd
      : null;
  }
  
  function usageForStorage(
    result
  ) {
    const input =
      safeInt(
        result?.input
      );
  
    const cached =
      safeInt(
        result?.cached
      );
  
    const cacheWrite =
      safeInt(
        result
          ?.cacheWrite
      );
  
    const reasoning =
      safeInt(
        result
          ?.reasoning
      );
  
    const output =
      safeInt(
        result?.output
      );
  
    const freshInput =
      safeInt(
        result?.freshInput ??
        Math.max(
          0,
          input -
          cached -
          cacheWrite
        )
      );
  
    return {
      input,
      freshInput,
      cached,
      cacheWrite,
      reasoning,
      output,
  
      providerCostMicrousd:
        providerCostMicrousd(
          result
            ?.providerCost
        ),
    };
  }
  
  function computedUsageCostMicrousd(
    config,
    stored
  ) {
    const rates =
      resolvedPricingRates(
        config,
        stored.input
      );
  
    if (
      rates.inputRate ===
        null ||
      rates.outputRate ===
        null
    ) {
      return null;
    }
  
    return costBucketsMicrousd(
      [
        [
          stored.freshInput,
          rates.inputRate,
        ],
  
        [
          stored.cached,
          rates.cacheReadRate,
        ],
  
        [
          stored.cacheWrite,
          rates.cacheWriteRate,
        ],
  
        [
          stored.output,
          rates.outputRate,
        ],
      ]
    );
  }
  
  function actualUsageCostMicrousd(
    config,
    stored
  ) {
    return (
      stored
        .providerCostMicrousd !==
          null &&
      stored
        .providerCostMicrousd !==
          undefined
    )
      ? stored
          .providerCostMicrousd
      : computedUsageCostMicrousd(
          config,
          stored
        );
  }
  
  function estimatedPromptTokens(
    messages
  ) {
    let ascii =
      0;
  
    let nonAscii =
      0;
  
    for (
      const message
      of messages
    ) {    for (
        const ch
        of message.content
      ) {
        if (
          ch.codePointAt(0) <=
          0x7f
        ) {
          ascii += 1;
        }
  
        else {
          nonAscii += 1;
        }
      }
    }
  
    const estimate =
      ascii / 4 +
      nonAscii *
        1.15 +
      messages.length *
        10 +
      96;
  
    return Math.max(
      1,
      Math.ceil(
        estimate *
        1.20
      )
    );
  }
  
  function reservePlan(
    config,
    messages,
    requestedMaxOutput,
    walletBalance
  ) {
    const estimatedInputTokens =
      estimatedPromptTokens(
        messages
      );
  
    const rates =
      resolvedPricingRates(
        config,
        estimatedInputTokens
      );
  
    if (
      rates.inputRate ===
        null ||
      rates.outputRate ===
        null
    ) {
      return null;
    }
  
    const guard =
      openRouterPriceGuard(
        config,
        estimatedInputTokens
      );
  
    const reserveInputRate =
      Math.max(
        rates.inputRate,
        rates.cacheWriteRate ?? 0,
        guard?.promptRate ?? 0
      );
  
    const reserveOutputRate =
      Math.max(
        rates.outputRate,
        guard?.completionRate ?? 0
      );
  
    const inputReserveMicrousd =
      costBucketsMicrousd(
        [
          [
            estimatedInputTokens,
            reserveInputRate,
          ],
        ]
      );
  
    if (
      inputReserveMicrousd ===
      null
    ) {
      return null;
    }
  
    if (
      walletBalance <
      inputReserveMicrousd
    ) {
      return {
        ok:
          false,
  
        estimatedInputTokens,
        inputReserveMicrousd,
  
        affordableOutputTokens:
          0,
  
        pricingTier:
          rates.longContext
            ? "long_context"
            : "standard",
      };
    }
  
    if (
      reserveOutputRate ===
        0
    ) {
      return {
        ok:
          true,
  
        estimatedInputTokens,
        inputReserveMicrousd,
  
        outputReserveMicrousd:
          0,
  
        reserveMicrousd:
          inputReserveMicrousd,
  
        effectiveMaxOutput:
          requestedMaxOutput,
  
        pricingTier:
          rates.longContext
            ? "long_context"
            : "standard",
  
        openRouterMaxPromptMicrousdPerMillion:
          guard?.promptRate ??
          null,
  
        openRouterMaxCompletionMicrousdPerMillion:
          guard?.completionRate ??
          null,
      };
    }
  
    const outputBudget =
      walletBalance -
      inputReserveMicrousd;
  
    const affordableBig =
      (
        BigInt(
          outputBudget
        ) *
        1_000_000n
      ) /
      BigInt(
        reserveOutputRate
      );
  
    const affordableOutputTokens =
      affordableBig >
        BigInt(
          MAX_OUTPUT
        )
        ? MAX_OUTPUT
        : Number(
            affordableBig
          );
  
    const effectiveMaxOutput =
      Math.min(
        requestedMaxOutput,
        Math.max(
          0,
          affordableOutputTokens
        )
      );
  
    const minimumNeeded =
      Math.min(
        requestedMaxOutput,
        MIN_AFFORDABLE_OUTPUT_TOKENS
      );
  
    if (
      effectiveMaxOutput <
      minimumNeeded
    ) {
      return {
        ok:
          false,
  
        estimatedInputTokens,
        inputReserveMicrousd,
        affordableOutputTokens:
          effectiveMaxOutput,
  
        pricingTier:
          rates.longContext
            ? "long_context"
            : "standard",
      };
    }
  
    const outputReserveMicrousd =
      costBucketsMicrousd(
        [
          [
            effectiveMaxOutput,
            reserveOutputRate,
          ],
        ]
      );
  
    if (
      outputReserveMicrousd ===
      null
    ) {
      return null;
    }
  
    const reserveMicrousd =
      inputReserveMicrousd +
      outputReserveMicrousd;
  
    if (
      !Number.isSafeInteger(
        reserveMicrousd
      )
    ) {
      return null;
    }
  
    return {
      ok:
        true,
  
      estimatedInputTokens,
      inputReserveMicrousd,
      outputReserveMicrousd,
      reserveMicrousd,
      effectiveMaxOutput,
  
      pricingTier:
        rates.longContext
          ? "long_context"
          : "standard",
  
      openRouterMaxPromptMicrousdPerMillion:
        guard?.promptRate ??
        null,
  
      openRouterMaxCompletionMicrousdPerMillion:
        guard?.completionRate ??
        null,
    };
  }

  return Object.freeze({
    modelConfigs,
    modelConfig,
    modelAllowed,
    pricingRate,
    longContextActive,
    resolvedPricingRates,
    openRouterPriceGuard,
    ceilDivBigInt,
    costBucketsMicrousd,
    providerCostMicrousd,
    usageForStorage,
    computedUsageCostMicrousd,
    actualUsageCostMicrousd,
    estimatedPromptTokens,
    reservePlan,
  });
})();

const {
  modelConfigs,
  modelConfig,
  modelAllowed,
  pricingRate,
  longContextActive,
  resolvedPricingRates,
  openRouterPriceGuard,
  ceilDivBigInt,
  costBucketsMicrousd,
  providerCostMicrousd,
  usageForStorage,
  computedUsageCostMicrousd,
  actualUsageCostMicrousd,
  estimatedPromptTokens,
  reservePlan,
} = WorkerModelPricing;

// Optional Cloudflare Rate Limiting binding boundary for account credentials.
// Keys are hashed before leaving this module; missing bindings preserve the
// current deployment behavior until the production Worker is configured.


// Internal account-auth route boundary. It owns registration/login/logout/recovery
// request policy while session primitives remain in WorkerSessionAuth.
const WorkerAccountAuth = (() => {
  async function authRegister(
    request,
    env,
    db
  ) {
    if (
      registrationMode(
        env
      ) ===
      "closed"
    ) {
      return fail(
        "registration_closed",
        403
      );
    }
  
    const body =
      await readJson(
        request
      );
  
    const username =
      validUsername(
        body?.username
      );
  
    const displayName =
      validDisplayName(
        body
          ?.display_name ||
        body?.username
      );
  
    const password =
      body?.password;
  
    if (
      !username ||
      !displayName ||
      !validPassword(
        password
      )
    ) {
      return fail(
        "invalid_registration",
        400,
        {
          username_rule:
            "3-32 letters/numbers/._-",
  
          password_rule:
            "10-128 characters",
        }
      );
    }

    if (
      !(
        await accountAuthAllowed(
          env,
          "register",
          [
            "username:" +
              username,
            authNetworkIdentity(
              request
            ),
          ]
        )
      )
    ) {
      return authRateLimited();
    }
  
    const existing =
      await db
        .prepare(
          `
          SELECT
            account_id
  
          FROM accounts
  
          WHERE
            username = ?
  
          LIMIT 1
          `
        )
        .bind(
          username
        )
        .first();
  
    if (
      existing
    ) {
      return fail(
        "username_taken",
        409
      );
    }
  
    const playerId =
      crypto.randomUUID();
  
    const accountId =
      crypto.randomUUID();
  
    const publicId =
      publicPlayerId();
  
    const deadLegacyToken =
      newOpaqueToken(
        "bao_",
        32
      );
  
    const recoveryCode =
      newRecoveryCode();
  
    const recoveryHash =
      await sha256Hex(
        normalizeRecoveryCode(
          recoveryCode
        )
      );
  
    const pw =
      await passwordRecord(
        password
      );
  
    await db.batch(
      [
        db
          .prepare(
            `
            INSERT INTO players (
              id,
              public_id,
              recovery_hash,
              token_hash,
              balance_microusd,
              daily_chat_limit,
              enabled
            )
  
            VALUES (
              ?,
              ?,
              ?,
              ?,
              0,
              200,
              1
            )
            `
          )
          .bind(
            playerId,
            publicId,
            recoveryHash,
            await sha256Hex(
              deadLegacyToken
            )
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
              0,
              'USD',
              ?,
              1
            )
            `
          )
          .bind(
            playerId,
            COST_BILLING_MODE
          ),
  
        db
          .prepare(
            `
            INSERT INTO accounts (
              account_id,
              player_id,
              username,
              display_name,
              password_hash,
              password_salt,
              password_iterations,
              enabled,
              created_at,
              updated_at
            )
  
            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              ?,
              1,
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP
            )
            `
          )
          .bind(
            accountId,
            playerId,
            username,
            displayName,
            pw.password_hash,
            pw.password_salt,
            pw
              .password_iterations
          ),
      ]
    );
  
    const session =
      await createSession(
        db,
        playerId,
        env
      );
  
    return withSessionCookie(
      json(
        {
          created:
            true,
  
          public_id:
            publicId,
  
          username,
  
          display_name:
            displayName,
  
          // Kept during the compatibility window for older cached clients.
          // Current clients authenticate through the HttpOnly cookie.
          session_token:
            session
              .sessionToken,
  
          session_expires_at:
            session
              .expiresAt,
  
          recovery_code:
            recoveryCode,
  
          wallet_balance_microusd:
            0,
  
          wallet_balance_usd:
            0,
        },
        201
      ),
      session.sessionToken,
      session.expiresAt
    );
  }
  
  async function authLogin(
    request,
    env,
    db
  ) {
    const body =
      await readJson(
        request
      );
  
    const username =
      validUsername(
        body?.username
      );
  
    const password =
      body?.password;
  
    if (
      !username ||
      !validPassword(
        password
      )
    ) {
      return fail(
        "invalid_credentials",
        401
      );
    }

    if (
      !(
        await accountAuthAllowed(
          env,
          "login",
          [
            "username:" +
              username,
          ]
        )
      )
    ) {
      return authRateLimited();
    }
  
    const account =
      await db
        .prepare(
          `
          SELECT
            a.account_id,
            a.player_id,
            a.username,
            a.display_name,
            a.password_hash,
            a.password_salt,
            a.password_iterations,
  
            a.enabled
              AS account_enabled,
  
            p.public_id,
  
            p.enabled
              AS player_enabled
  
          FROM accounts a
  
          JOIN players p
            ON p.id =
              a.player_id
  
          WHERE
            a.username = ?
  
          LIMIT 1
          `
        )
        .bind(
          username
        )
        .first();
  
    if (
      !account ||
      !account
        .account_enabled ||
      !account
        .player_enabled ||
      !(
        await passwordMatches(
          password,
          account
        )
      )
    ) {
      return fail(
        "invalid_credentials",
        401
      );
    }
  
    await db
      .prepare(
        `
        UPDATE auth_sessions
  
        SET
          revoked_at =
            COALESCE(
              revoked_at,
              CURRENT_TIMESTAMP
            )
  
        WHERE
          player_id = ?
  
          AND
          revoked_at
            IS NULL
  
          AND
          datetime(
            expires_at
          ) <=
          datetime('now')
        `
      )
      .bind(
        account.player_id
      )
      .run();
  
    const session =
      await createSession(
        db,      account.player_id,
        env
      );
  
    await db
      .prepare(
        `
        UPDATE accounts
  
        SET
          last_login_at =
            CURRENT_TIMESTAMP,
  
          updated_at =
            CURRENT_TIMESTAMP
  
        WHERE
          account_id = ?
        `
      )
      .bind(
        account.account_id
      )
      .run();
  
    return withSessionCookie(
      json({
        logged_in:
          true,
  
        public_id:
          account.public_id,
  
        username:
          account.username,
  
        display_name:
          account.display_name,
  
        // Compatibility only; the new frontend never persists this value.
        session_token:
          session.sessionToken,
  
        session_expires_at:
          session.expiresAt,
      }),
      session.sessionToken,
      session.expiresAt
    );
  }
  
  async function authLogout(
    request,
    db
  ) {
    const token =
      sessionTokenFrom(
        request
      );
  
    if (!token) {
      return clearSessionCookie(
        json({
          logged_out:
            true,
        })
      );
    }
  
    const tokenHash =
      await sha256Hex(
        token
      );
  
    await db
      .prepare(
        `
        UPDATE auth_sessions
  
        SET
          revoked_at =
            COALESCE(
              revoked_at,
              CURRENT_TIMESTAMP
            )
  
        WHERE
          token_hash = ?
        `
      )
      .bind(
        tokenHash
      )
      .run();
  
    return clearSessionCookie(
      json({
        logged_out:
          true,
      })
    );
  }
  
  async function authRecover(
    request,
    env,
    db
  ) {
    const body =
      await readJson(
        request
      );
  
    const publicId =
      String(
        body?.public_id ||
        ""
      )
        .trim()
        .toUpperCase();
  
    const recovery =
      normalizeRecoveryCode(
        body
          ?.recovery_code
      );
  
    const newPassword =
      body
        ?.new_password;
  
    if (
      !/^YR-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(
        publicId
      ) ||
      recovery.length <
        20 ||
      !validPassword(
        newPassword
      )
    ) {
      return fail(
        "invalid_recovery_request",
        400
      );
    }

    if (
      !(
        await accountAuthAllowed(
          env,
          "recover",
          [
            "public_id:" +
              publicId,
          ]
        )
      )
    ) {
      return authRateLimited();
    }
  
    const row =
      await db
        .prepare(
          `
          SELECT
            p.id
              AS player_id,
  
            p.recovery_hash,
  
            a.account_id,
            a.username,
            a.display_name
  
          FROM players p
  
          JOIN accounts a
            ON a.player_id =
              p.id
  
          WHERE
            p.public_id = ?
  
            AND
            p.enabled = 1
  
            AND
            a.enabled = 1
  
          LIMIT 1
          `
        )
        .bind(
          publicId
        )
        .first();
  
    if (
      !row ||
      !constantTimeStringEqual(
        await sha256Hex(
          recovery
        ),
        row.recovery_hash
      )
    ) {
      return fail(
        "invalid_recovery_credentials",
        401
      );
    }
  
    const pw =
      await passwordRecord(
        newPassword
      );
  
    const newRecovery =
      newRecoveryCode();
  
    const newRecoveryHash =
      await sha256Hex(
        normalizeRecoveryCode(
          newRecovery
        )
      );
  
    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE accounts
  
            SET
              password_hash = ?,
              password_salt = ?,
              password_iterations = ?,
              updated_at =
                CURRENT_TIMESTAMP
  
            WHERE
              account_id = ?
            `
          )
          .bind(
            pw.password_hash,
            pw.password_salt,
            pw
              .password_iterations,
            row.account_id
          ),
  
        db
          .prepare(
            `
            UPDATE players
  
            SET
              recovery_hash = ?
  
            WHERE
              id = ?
            `
          )
          .bind(
            newRecoveryHash,
            row.player_id
          ),
  
        db
          .prepare(
            `
            UPDATE auth_sessions
  
            SET
              revoked_at =
                COALESCE(
                  revoked_at,
                  CURRENT_TIMESTAMP
                )
  
            WHERE
              player_id = ?
  
              AND
              revoked_at
                IS NULL
            `
          )
          .bind(
            row.player_id
          ),
      ]
    );
  
    const session =
      await createSession(
        db,
        row.player_id,
        env
      );
  
    return withSessionCookie(
      json({
        recovered:
          true,
  
        public_id:
          publicId,
  
        username:
          row.username,
  
        display_name:
          row.display_name,
  
        // Compatibility only; the new frontend never persists this value.
        session_token:
          session.sessionToken,
  
        session_expires_at:
          session.expiresAt,
  
        recovery_code:
          newRecovery,
      }),
      session.sessionToken,
      session.expiresAt
    );
  }

  return Object.freeze({
    authRegister,
    authLogin,
    authLogout,
    authRecover,
  });
})();

const {
  authRegister,
  authLogin,
  authLogout,
  authRecover,
} = WorkerAccountAuth;

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

// Internal Hosted provider-routing boundary. It owns logical-model route selection
// and persisted route overrides, but not provider spend controls or network transport.
const WorkerProviderRouting = (() => {
  const HOSTED_ROUTE_CONTROL = Object.freeze({
    "gemini-3-flash": {
      label: "Gemini 3 Flash",
      default_route: "google-official",
      routes: {
        "google-official": {
          label: "Google Gemini 官方",
          provider: "gemini",
          model: "gemini-3-flash-preview",
        },
        openrouter: {
          label: "OpenRouter",
          provider: "openrouter",
          model: "google/gemini-3-flash-preview",
        },
      },
    },
    "gemini-3.1-pro": {
      label: "Gemini 3.1 Pro",
      default_route: "google-official",
      routes: {
        "google-official": {
          label: "Google Gemini 官方",
          provider: "gemini",
          model: "gemini-3.1-pro-preview",
        },
        openrouter: {
          label: "OpenRouter",
          provider: "openrouter",
          model: "google/gemini-3.1-pro-preview",
        },
      },
    },
  });

  function hostedLogicalModel(
    provider,
    model
  ) {
    for (
      const [
        modelId,
        config,
      ]
      of Object.entries(
        HOSTED_ROUTE_CONTROL
      )
    ) {
      for (
        const [
          routeId,
          route,
        ]
        of Object.entries(
          config.routes
        )
      ) {
        if (
          route.provider ===
            provider &&
          route.model ===
            model
        ) {
          return {
            modelId,
            config,
            routeId,
          };
        }
      }
    }
  
    return null;
  }
  
  async function readHostedRouteOverride(
    db,
    modelId
  ) {
    try {
      const row =
        await db
          .prepare(
            `
            SELECT
              route_id
  
            FROM hosted_route_overrides
  
            WHERE
              model_id = ?
  
            LIMIT 1
            `
          )
          .bind(
            modelId
          )
          .first();
  
      return (
        typeof row?.route_id ===
          "string"
          ? row.route_id
          : null
      );
    }
  
    catch {
      // The control tables are created lazily from the authenticated
      // admin page. Before the first admin visit, production routing
      // must remain exactly as it was.
      return null;
    }
  }
  
  async function resolveHostedRoute(
    db,
    env,
    provider,
    model
  ) {
    const logical =
      hostedLogicalModel(
        provider,
        model
      );
  
    if (!logical) {
      return {
        provider,
        model,
        logical_model_id:
          null,
        route_id:
          null,
        overridden:
          false,
        fallback:
          false,
      };
    }
  
    const savedRouteId =
      await readHostedRouteOverride(
        db,
        logical.modelId
      );
  
    const requestedRouteId =
      logical.config.routes[
        savedRouteId
      ]
        ? savedRouteId
        : logical.config
            .default_route;
  
    let routeId =
      requestedRouteId;
  
    let route =
      logical.config
        .routes[routeId];
  
    let fallback =
      false;
  
    if (
      !modelAllowed(
        env,
        route.provider,
        route.model
      )
    ) {
      const defaultRoute =
        logical.config.routes[
          logical.config
            .default_route
        ];
  
      if (
        defaultRoute &&
        modelAllowed(
          env,
          defaultRoute.provider,
          defaultRoute.model
        )
      ) {
        routeId =
          logical.config
            .default_route;
  
        route =
          defaultRoute;
  
        fallback =
          true;
      }
    }
  
    return {
      provider:
        route.provider,
  
      model:
        route.model,
  
      logical_model_id:
        logical.modelId,
  
      route_id:
        routeId,
  
      overridden:
        Boolean(
          savedRouteId
        ),
  
      fallback,
    };
  }

  return Object.freeze({
    HOSTED_ROUTE_CONTROL,
    hostedLogicalModel,
    readHostedRouteOverride,
    resolveHostedRoute,
  });
})();

const {
  HOSTED_ROUTE_CONTROL,
  hostedLogicalModel,
  readHostedRouteOverride,
  resolveHostedRoute,
} = WorkerProviderRouting;

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

// Internal publication formatting boundary. This block owns validation,
// sanitization and catalog/profile shaping only; ownership and GitHub transport stay outside.
// Author-profile publication boundary. It owns the profile-specific GitHub PR
// transaction while shared API transport is provided below.


// Internal author-ownership boundary. Public author identity claims are kept
// separate from account/session routes and from public author-profile formatting.


// Authenticated author-account route boundary. It owns `/me/authors` request
// dispatch while ownership rules remain in WorkerAuthorOwnership.
const WorkerAccountAuthorRoutes = (() => {
async function accountAuthorRoute(
  request,
  url,
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

  if (
    player.auth_type !==
      "session" ||
    !player.username
  ) {
    return fail(
      "account_required",
      403
    );
  }

  if (
    url.pathname ===
      "/me/authors" &&
    request.method ===
      "GET"
  ) {
    return json({
      authors:
        await ownedAuthorIdentities(
          db,
          player.id
        ),
    });
  }

  if (
    url.pathname ===
      "/me/authors/claim" &&
    request.method ===
      "POST"
  ) {
    try {
      const claimed =
        await claimAuthorIdentity(
          env,
          db,
          player,
          await readJson(
            request
          )
        );

      return json(
        {
          claimed:
            true,

          ...claimed,
        },
        claimed.existing
          ? 200
          : 201
      );
    }

    catch (error) {
      if (
        error?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }
  }

  if (
    url.pathname ===
      "/me/authors/profile-pr" &&
    request.method ===
      "POST"
  ) {
    const body =
      await readJsonWithLimit(
        request,
        MAX_ADMIN_PUBLISH_BODY_BYTES
      );

    let prepared;

    try {
      prepared =
        prepareAuthorProfileUpdate(
          body
        );
    }

    catch (error) {
      if (
        error?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }

    await ensureAuthorOwnerships(
      db
    );

    const owned =
      await db
        .prepare(
          `
          SELECT
            author_id

          FROM author_ownerships

          WHERE
            author_id = ?

            AND
            player_id = ?

          LIMIT 1
          `
        )
        .bind(
          prepared.authorId,
          player.id
        )
        .first();

    if (
      !owned
    ) {
      return fail(
        "author_identity_not_owned",
        403
      );
    }

    try {
      const result =
        await createAuthorProfilePr(
          env,
          prepared
        );

      return json(
        {
          created:
            true,

          ...result,
        },
        201
      );
    }

    catch (error) {
      if (
        error?.httpStatus
      ) {
        return fail(
          error.message,
          error.httpStatus
        );
      }

      throw error;
    }
  }

  return fail(
    "not_found",
    404
  );
}

  return Object.freeze({
    accountAuthorRoute,
  });
})();

const {
  accountAuthorRoute,
} = WorkerAccountAuthorRoutes;

// Shared GitHub publication transport and character-publication transaction.
// Keep repository settings, HTTP policy, and character PR writes off route code.


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


// Admin publication HTTP subroutes. Formatting and GitHub transport stay in
// their dedicated publication boundaries; this block owns endpoint orchestration.



// Read-only admin usage history and presentation.



// Admin player directory list/create endpoints. Existing-player mutations
// and wallet top-ups remain outside this boundary.



// Existing-player status, legacy credit and USD wallet mutation endpoints.
const WorkerAdminPlayerMutationRoutes = (() => {
async function adminPlayerMutationRoute(
  request,
  path,
  db
) {
  const match =
    path.match(
      /^\/admin\/players\/([0-9a-f-]{36})\/(credit|wallet-credit|disable|enable)$/
    );

  if (
    match &&
    request.method ===
      "POST"
  ) {
    const playerId =
      match[1];

    const action =
      match[2];

    if (
      action ===
        "disable" ||
      action ===
        "enable"
    ) {
      const body =
        await readJson(
          request
        );

      const reason =
        String(
          body?.reason ||
          ""
        )
          .trim()
          .slice(
            0,
            300
          );

      const enabling =
        action ===
          "enable";

      const nextEnabled =
        enabling
          ? 1
          : 0;

      const result =
        await db
          .prepare(
            `
            UPDATE players

            SET
              enabled = ?

            WHERE
              id = ?

              AND enabled != ?
            `
          )
          .bind(
            nextEnabled,
            playerId,
            nextEnabled
          )
          .run();

      if (
        !result
          .meta
          .changes
      ) {
        const exists =
          await db
            .prepare(
              `
              SELECT
                id,
                enabled

              FROM players

              WHERE
                id = ?

              LIMIT 1
              `
            )
            .bind(
              playerId
            )
            .first();

        if (!exists) {
          return fail(
            "player_not_found",
            404
          );
        }

        return json({
          enabled:
            Boolean(
              exists.enabled
            ),

          unchanged:
            true,
        });
      }

      const statements = [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              enabled = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            nextEnabled,
            playerId
          ),

        db
          .prepare(
            `
            UPDATE accounts

            SET
              enabled = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            nextEnabled,
            playerId
          ),

        db
          .prepare(
            `
            INSERT INTO admin_player_events (
              event_id,
              player_id,
              action,
              reason
            )

            VALUES (
              ?,
              ?,
              ?,
              ?
            )
            `
          )
          .bind(
            crypto.randomUUID(),
            playerId,
            action,
            reason ||
              null
          ),
      ];

      if (!enabling) {
        statements.push(
          db
            .prepare(
              `
              UPDATE auth_sessions

              SET
                revoked_at =
                  COALESCE(
                    revoked_at,
                    CURRENT_TIMESTAMP
                  )

              WHERE
                player_id = ?

                AND
                revoked_at
                  IS NULL
              `
            )
            .bind(
              playerId
            )
        );
      }

      await db.batch(
        statements
      );

      return json({
        enabled:
          enabling,

        action,

        reason:
          reason ||
          null,

        session_relogin_required:
          enabling,
      });
    }

    const body =
      await readJson(
        request
      );

    if (
      action ===
      "credit"
    ) {
      const amount =
        body
          ?.amount_credits ??
        body
          ?.amount_microusd;

      if (
        !integer(
          amount,
          1,
          100_000_000
        )
      ) {
        return fail(
          "invalid_credit_amount"
        );
      }

      const result =
        await db
          .prepare(
            `
            UPDATE players

            SET
              balance_microusd =
                balance_microusd +
                ?

            WHERE
              id = ?

              AND
              balance_microusd <=
                1000000000 -
                ?
            `
          )
          .bind(
            amount,
            playerId,
            amount
          )
          .run();

      return result
        .meta
        .changes
        ? json({
            credited_legacy_credits:
              amount,
          })
        : fail(
            "player_not_found_or_balance_limit",
            404
          );
    }

    const creditMicrousd =
      body
        ?.credit_added_microusd ??
      body
        ?.amount_microusd;

    const paymentCurrency =
      String(
        body
          ?.payment_currency ||
        "USD"
      )
        .trim()
        .toUpperCase();

    const paymentMinor =
      Number(
        body
          ?.payment_amount_minor ??
        0
      );

    const processorFeeMinor =
      Number(
        body
          ?.processor_fee_minor ??
        0
      );

    const netReceivedMinor =
      Number(
        body
          ?.net_received_minor ??
        Math.max(
          0,
          paymentMinor -
          processorFeeMinor
        )
      );

    if (
      !integer(
        creditMicrousd,
        1,
        1_000_000_000_000
      ) ||
      ![
        "TWD",
        "USD",
      ].includes(
        paymentCurrency
      ) ||
      !integer(
        paymentMinor,
        0,
        1_000_000_000
      ) ||
      !integer(
        processorFeeMinor,
        0,
        1_000_000_000
      ) ||
      !integer(
        netReceivedMinor,
        0,
        1_000_000_000
      ) ||
      processorFeeMinor >
        paymentMinor ||
      netReceivedMinor >
        paymentMinor
    ) {
      return fail(
        "invalid_wallet_credit_amount"
      );
    }

    const current =
      await db
        .prepare(
          `
          SELECT
            balance_microusd

          FROM wallets

          WHERE
            player_id = ?

            AND
            enabled = 1
          `
        )
        .bind(
          playerId
        )
        .first();

    if (
      !current
    ) {
      return fail(
        "player_wallet_not_found",
        404
      );
    }

    const before =
      safeMoneyInt(
        current
          .balance_microusd
      );

    const after =
      before +
      creditMicrousd;

    if (
      !Number.isSafeInteger(
        after
      )
    ) {
      return fail(
        "wallet_balance_limit"
      );
    }

    const topupId =
      crypto.randomUUID();

    const ledgerId =
      crypto.randomUUID();

    const paymentMethod =
      String(
        body
          ?.payment_method ||
        "manual"
      ).slice(
        0,
        80
      );

    const paymentReference =
      String(
        body
          ?.payment_reference ||
        ""
      ).slice(
        0,
        200
      );
    const note =
      String(
        body?.note ||
        ""
      ).slice(
        0,
        500
      );

    const legacyPaymentMicrousd =
      paymentCurrency ===
      "USD"
        ? paymentMinor *
          10_000
        : 0;

    await db.batch(
      [
        db
          .prepare(
            `
            UPDATE wallets

            SET
              balance_microusd = ?,
              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              player_id = ?
            `
          )
          .bind(
            after,
            playerId
          ),

        db
          .prepare(
            `
            INSERT INTO wallet_topups (
              topup_id,
              player_id,

              payment_amount_microusd,

              credit_added_microusd,

              payment_method,
              payment_reference,
              note,

              payment_amount_minor,
              payment_currency,

              processor_fee_minor,
              net_received_minor
            )

            VALUES (
              ?,
              ?,
              ?,
              ?,
              ?,
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
            topupId,
            playerId,

            legacyPaymentMicrousd,

            creditMicrousd,

            paymentMethod,
            paymentReference,
            note,

            paymentMinor,
            paymentCurrency,

            processorFeeMinor,
            netReceivedMinor
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

              reference_id,
              note
            )

            VALUES (
              ?,
              ?,
              'topup',
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
            playerId,
            creditMicrousd,
            before,
            after,
            topupId,
            note
          ),
      ]
    );

    return json({
      topup_id:
        topupId,

      payment_currency:
        paymentCurrency,

      payment_amount_minor:
        paymentMinor,

      processor_fee_minor:
        processorFeeMinor,

      net_received_minor:
        netReceivedMinor,

      credited_microusd:
        creditMicrousd,

      credited_usd:
        creditMicrousd /
        1_000_000,

      wallet_balance_microusd:
        after,

      wallet_balance_usd:
        after /
        1_000_000,
    });
  }

  return null;
}

  return Object.freeze({
    adminPlayerMutationRoute,
  });
})();

const {
  adminPlayerMutationRoute,
} = WorkerAdminPlayerMutationRoutes;


// Authenticated admin HTTP surface. Publication formatting, provider control
// calculations and chat settlement remain in their own boundaries.
const WorkerAdminRoutes = (() => {
async function ensureAdminPlayerEvents(
  db
) {
  await db
    .prepare(
      `
      CREATE TABLE IF NOT EXISTS admin_player_events (
        event_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
      `
    )
    .run();
}

async function adminRoute(
  request,
  url,
  env,
  db
) {
  if (
    !adminAuthorized(
      request,
      env
    )
  ) {
    return fail(
      "unauthorized",
      401
    );
  }

  const path =
    url.pathname;

  const publicationResponse =
    await adminPublicationRoute(
      request,
      path,
      env
    );

  if (publicationResponse) {
    return publicationResponse;
  }


  await ensureAdminPlayerEvents(
    db
  );

  const providerControlResponse =
    await adminProviderControlRoute(
      request,
      path,
      env,
      db
    );

  if (providerControlResponse) {
    return providerControlResponse;
  }

  const playerDirectoryResponse =
    await adminPlayerDirectoryRoute(
      request,
      path,
      env,
      db
    );

  if (playerDirectoryResponse) {
    return playerDirectoryResponse;
  }

  const playerMutationResponse =
    await adminPlayerMutationRoute(
      request,
      path,
      db
    );

  if (playerMutationResponse) {
    return playerMutationResponse;
  }

  const usageResponse =
    await adminUsageRoute(
      request,
      path,
      url,
      db
    );

  if (usageResponse) {
    return usageResponse;
  }

  return fail(
    "not_found",
    404
  );
}

  return Object.freeze({
    ensureAdminPlayerEvents,
    adminRoute,
  });
})();

const {
  ensureAdminPlayerEvents,
  adminRoute,
} = WorkerAdminRoutes;

// Internal provider network-transport boundary. It owns provider payloads,
// upstream HTTP calls, response normalization and provider-facing error mapping.
// Route selection, pricing and wallet settlement stay outside this block.
const WorkerProviderTransport = (() => {
  // Hosted OpenRouter requests keep the stable system prefix as the first
  // system message. Claude requires an explicit cache breakpoint when the
  // selected endpoint may be Bedrock or Vertex; top-level automatic caching
  // would exclude those endpoints. Keep the rest of the conversation as plain
  // strings so only the stable prefix is cached.
  function openRouterExplicitCacheMessages(
    model,
    messages
  ) {
    if (
      !/^anthropic\/claude-/i.test(
        String(model || "")
      ) ||
      !Array.isArray(messages)
    ) {
      return messages;
    }

    const stableIndex =
      messages.findIndex(
        (message) =>
          message?.role ===
            "system" &&
          typeof message
            ?.content ===
            "string" &&
          message.content.trim()
      );

    if (
      stableIndex <
      0
    ) {
      return messages;
    }

    return messages.map(
      (message, index) =>
        index ===
        stableIndex
          ? {
              ...message,

              content: [
                {
                  type:
                    "text",

                  text:
                    message
                      .content,

                  cache_control: {
                    type:
                      "ephemeral",
                  },
                },
              ],
            }
          : message
    );
  }

  async function geminiErrorHint(
    response
  ) {
    try {
      const payload =
        await response.json();
  
      // Gemini errors may arrive either directly from Google or wrapped by the
      // AWS Sydney relay. Build one internal diagnostic string from known wrapper
      // locations. It is used only for classification and is never returned to
      // the player.
      const diagnosticParts =
        [
          payload?.error
            ?.message,
          typeof payload?.error ===
            "string"
            ? payload.error
            : null,
          payload?.message,
          payload?.detail,
          payload?.reason,
          payload?.hint,
          payload?.category,
          payload?.body?.error
            ?.message,
          payload?.body?.message,
          payload?.google?.error
            ?.message,
          payload?.google?.message,
          payload?.upstream?.error
            ?.message,
          payload?.upstream?.message,
          payload?.provider_error
            ?.message,
          payload?.response?.error
            ?.message,
          payload?.data?.error
            ?.message,
          payload?.cause?.message,
        ]
          .filter(
            (value) =>
              typeof value ===
                "string" &&
              value.trim()
          )
          .join(" ");
  
      let serialized =
        "";
  
      try {
        serialized =
          JSON.stringify(
            payload
          );
      }
  
      catch {
        serialized =
          "";
      }
  
      const message =
        `${diagnosticParts} ${serialized}`
          .toLowerCase()
          .slice(
            0,
            12000
          );
  
      const knownStatuses =
        new Set(
          [
            "INVALID_ARGUMENT",
            "FAILED_PRECONDITION",
            "PERMISSION_DENIED",
            "UNAUTHENTICATED",
            "RESOURCE_EXHAUSTED",
            "NOT_FOUND",
            "UNAVAILABLE",
          ]
        );
  
      const statusCandidates =
        [
          payload?.error
            ?.status,
          payload?.status,
          payload?.provider_status,
          payload?.providerStatus,
          payload?.body?.error
            ?.status,
          payload?.google?.error
            ?.status,
          payload?.upstream?.error
            ?.status,
          payload?.response?.error
            ?.status,
          payload?.data?.error
            ?.status,
        ];
  
      const providerStatus =
        statusCandidates
          .map(
            (value) =>
              String(
                value ||
                ""
              )
                .trim()
                .toUpperCase()
          )
          .find(
            (value) =>
              knownStatuses.has(
                value
              )
          ) ||
        null;
  
      if (
        /user location is not supported|location is not supported for (the )?api|not available in your (location|region|country)|unsupported (location|region|country)/.test(
          message
        )
      ) {
        return {
          hint:
            "region",
  
          providerStatus,
        };
      }
  
      if (
        /billing|billing account|enable billing|paid tier|paid plan|payment|required payment|prepay|prepaid|purchase|credit balance|insufficient provider credit/.test(
          message
        )
      ) {
        return {
          hint:
            "billing",
  
          providerStatus,
        };
      }
  
      if (
        /model[_ -]?not[_ -]?allowed|model[^a-z0-9]{0,8}(is )?not allowed|allowlist|whitelist|unsupported model/.test(
          message
        )
      ) {
        return {
          hint:
            "model_not_allowed",
  
          providerStatus,
        };
      }
  
      if (
        /thought.?signature|thought_signature/.test(
          message
        )
      ) {
        return {
          hint:
            "thought_signature",
  
          providerStatus,
        };
      }
  
      if (
        /max.?output.?tokens|generation.?config|thinking.?budget|thinking.?level/.test(
          message
        )
      ) {
        return {
          hint:
            "generation_config",
  
          providerStatus,
        };
      }
  
      if (
        /system.?instruction/.test(
          message
        )
      ) {
        return {
          hint:
            "system_instruction",
  
          providerStatus,
        };
      }
  
      if (
        /contents|turns?|parts?|roles?|conversation/.test(
          message
        )
      ) {
        return {
          hint:
            "message_format",
  
          providerStatus,
        };
      }
  
      if (
        /context.length|token.limit|too.many.tokens|input.too.long|request.too.large/.test(
          message
        )
      ) {
        return {
          hint:
            "context_limit",
  
          providerStatus,
        };
      }
  
      if (
        /(model.{0,80}(not.found|not.supported|not.available|deprecated|does not exist|unknown))|((not.found|not.supported|not.available|deprecated).{0,80}model)/.test(
          message
        ) ||
        providerStatus ===
          "NOT_FOUND"
      ) {
        return {
          hint:
            "model_unavailable",
  
          providerStatus,
        };
      }
  
      if (
        /api.?key|api_key|invalid key|key invalid|authentication|unauthenticated/.test(
          message
        ) ||
        providerStatus ===
          "UNAUTHENTICATED"
      ) {
        return {
          hint:
            "api_key",
  
          providerStatus,
        };
      }
  
      if (
        /permission denied|permission_denied|forbidden|not authorized|access denied|access not configured/.test(
          message
        ) ||
        providerStatus ===
          "PERMISSION_DENIED"
      ) {
        return {
          hint:
            "permission",
  
          providerStatus,
        };
      }
  
      if (
        /quota|resource exhausted|resource_exhausted|rate limit/.test(
          message
        ) ||
        providerStatus ===
          "RESOURCE_EXHAUSTED"
      ) {
        return {
          hint:
            "quota",
  
          providerStatus,
        };
      }
  
      if (
        /invalid.argument|invalid.request|bad request/.test(
          message
        ) ||
        providerStatus ===
          "INVALID_ARGUMENT"
      ) {
        return {
          hint:
            "invalid_argument",
  
          providerStatus,
        };
      }
  
      if (
        providerStatus ===
          "FAILED_PRECONDITION"
      ) {
        return {
          hint:
            "precondition",
  
          providerStatus,
        };
      }
  
      if (
        providerStatus ===
          "UNAVAILABLE"
      ) {
        return {
          hint:
            "unavailable",
  
          providerStatus,
        };
      }
  
      return {
        hint:
          "unknown",
  
        providerStatus,
      };
    }
  
    catch {
      return {
        hint:
          "invalid_error_payload",
  
        providerStatus:
          null,
      };
    }
  }
  
  function anthropicPayload(
    messages,
    model,
    maxOutput
  ) {
    const systemParts =
      messages
        .filter(
          (m) =>
            m.role ===
            "system"
        )
        .map(
          (m) => ({
            type:
              "text",
  
            text:
              m.content,
          })
        );
  
    const conversation =
      messages
        .filter(
          (m) =>
            m.role !==
            "system"
        )
        .map(
          (m) => ({
            role:
              m.role ===
                "assistant"
                ? "assistant"
                : "user",
  
            content:
              m.content,
          })
        );
  
    const payload = {
      model,
  
      max_tokens:
        maxOutput,
  
      messages:
        conversation,
  
      stream:
        false,
    };
  
    if (
      systemParts.length
    ) {
      payload.system =
        systemParts;
    }
  
    return payload;
  }
  
  async function recoverOpenRouterUsage(
    env,
    generationId
  ) {
    const id =
      String(
        generationId ||
        ""
      ).trim();

    if (
      !env.OPENROUTER_API_KEY ||
      !/^gen-[A-Za-z0-9_-]{8,200}$/.test(
        id
      )
    ) {
      return null;
    }

    try {
      const response =
        await fetch(
          "https://openrouter.ai/api/v1/generation?id=" +
            encodeURIComponent(
              id
            ),
          {
            method:
              "GET",

            headers: {
              authorization:
                `Bearer ${env.OPENROUTER_API_KEY}`,

              accept:
                "application/json",
            },

            signal:
              AbortSignal.timeout(
                5_000
              ),
          }
        );

      if (
        !response.ok
      ) {
        return null;
      }

      const payload =
        await response.json();

      const data =
        payload?.data ||
        {};

      const input =
        usageInt(
          data.tokens_prompt ??
          data.native_tokens_prompt
        );

      const output =
        usageInt(
          data.tokens_completion ??
          data.native_tokens_completion
        );

      if (
        input === null ||
        output === null
      ) {
        return null;
      }

      const rawCost =
        Number(
          data.total_cost ??
          data.usage
        );

      return {
        input,
        output,

        cached:
          safeInt(
            data.native_tokens_cached
          ),

        cacheWrite:
          0,

        reasoning:
          safeInt(
            data.native_tokens_reasoning
          ),

        providerCost:
          Number.isFinite(
            rawCost
          ) &&
          rawCost >= 0
            ? rawCost
            : null,
      };
    }

    catch {
      return null;
    }
  }

  function retryAfterSeconds(
    response
  ) {
    const raw =
      String(
        response?.headers?.get?.(
          "retry-after"
        ) ||
        ""
      ).trim();

    if (
      !raw
    ) {
      return null;
    }

    const numeric =
      Number(
        raw
      );

    if (
      Number.isFinite(
        numeric
      ) &&
      numeric >= 0
    ) {
      return Math.min(
        3600,
        Math.ceil(
          numeric
        )
      );
    }

    const timestamp =
      Date.parse(
        raw
      );

    if (
      !Number.isFinite(
        timestamp
      )
    ) {
      return null;
    }

    return Math.min(
      3600,
      Math.max(
        0,
        Math.ceil(
          (
            timestamp -
            Date.now()
          ) /
          1000
        )
      )
    );
  }

  async function rateLimitDiagnostic(
    response
  ) {
    let scope =
      "unknown";

    try {
      const payload =
        await response
          .clone()
          .json();

      const raw =
        [
          payload?.error?.message,
          payload?.message,
          payload?.error?.code,
          payload?.code,
          typeof payload?.error === "string"
            ? payload.error
            : "",
        ]
          .filter(
            value =>
              typeof value ===
                "string" ||
              typeof value ===
                "number"
          )
          .join(
            " "
          )
          .toLowerCase()
          .slice(
            0,
            1200
          );

      if (
        /insufficient|quota|credit|balance|budget|spend(?:ing)?|daily|weekly|monthly/.test(
          raw
        )
      ) {
        scope =
          "quota";
      }

      else if (
        /rate.?limit|too many requests|\brpm\b|\btpm\b|requests per|tokens per/.test(
          raw
        )
      ) {
        scope =
          "rate";
      }

      else if (
        /provider|upstream|capacity|overload|temporar(?:y|ily)|unavailable/.test(
          raw
        )
      ) {
        scope =
          "provider";
      }
    }

    catch {
      // Do not forward raw upstream error bodies. Only the safe enum below
      // leaves the Worker.
    }

    return {
      scope,

      retryAfterSeconds:
        retryAfterSeconds(
          response
        ),
    };
  }

  async function providerCall(
    env,
    provider,
    model,
    messages,
    maxOutput,
    player = null,
    sessionId = ""
  ) {
    let endpoint;
    let init;
    let usingAwsRelay =
      false;
  
    const configuredModel =
      modelConfig(
        env,
        provider,
        model
      );
  
    const openRouterGuard =
      provider ===
        "openrouter"
        ? openRouterPriceGuard(
            configuredModel,
            estimatedPromptTokens(
              messages
            )
          )
        : null;

    const openRouterMessages =
      provider ===
        "openrouter"
        ? openRouterExplicitCacheMessages(
            model,
            messages
          )
        : messages;
  
    if (
      provider ===
      "openrouter"
    ) {
      const useAwsRelay =
        playerUsesAwsOpenRouter(
          env,
          player
        );
  
      if (
        useAwsRelay
      ) {
        if (
          !env.AWS_RELAY_URL ||
          !env.BAO_INTERNAL_TOKEN
        ) {
          return {
            ok:
              false,
  
            category:
              "relay_not_configured",
          };
        }
  
        let relayBase;
  
        try {
          relayBase =
            new URL(
              env.AWS_RELAY_URL
            );
  
          if (
            relayBase.protocol !==
              "https:" ||
            relayBase.username ||
            relayBase.password
          ) {
            throw new Error(
              "bad_relay"
            );
          }
        }
  
        catch {
          return {
            ok:
              false,
  
            category:
              "relay_not_configured",
          };
        }
  
        endpoint =
          new URL(
            "/v1/chat",
            relayBase
          ).toString();
  
        usingAwsRelay =
          true;
  
        init = {
          method:
            "POST",
  
          headers: {
            authorization:
              `Bearer ${env.BAO_INTERNAL_TOKEN}`,
  
            "content-type":
              "application/json",
          },
  
          body:
            JSON.stringify(
              {
                provider:
                  "openrouter",
  
                model,
                messages:
                  openRouterMessages,
  
                max_output_tokens:
                  maxOutput,
  
                openrouter_provider:
                  openRouterGuard
                    ?.provider,
  
                ...(sessionId
                  ? {
                      session_id:
                        sessionId,
                    }
                  : {}),
              }
            ),
        };
      }
  
      else {
        if (
          !env.OPENROUTER_API_KEY
        ) {
          return {
            ok:
              false,
  
            category:
              "provider_not_configured",
          };
        }
  
        endpoint =
          "https://openrouter.ai/api/v1/chat/completions";
  
        init = {
          method:
            "POST",
  
          headers: {
            authorization:
              `Bearer ${env.OPENROUTER_API_KEY}`,
  
            "content-type":
              "application/json",
          },
  
          body:
            JSON.stringify(
              {
                model,
                messages:
                  openRouterMessages,
  
                max_tokens:
                  maxOutput,
  
                stream:
                  false,
  
                provider:
                  openRouterGuard
                    ?.provider,
  
                ...(sessionId
                  ? {
                      session_id:
                        sessionId,
                    }
                  : {}),
  
                usage: {
                  include:
                    true,
                },
              }
            ),
        };
      }
    }
  
    else if (
      provider ===
      "gemini"
    ) {
      if (
        !env.AWS_RELAY_URL ||
        !env.BAO_INTERNAL_TOKEN
      ) {
        return {
          ok:
            false,
  
          category:
            "provider_not_configured",
        };
      }
  
      if (
        !/^[a-zA-Z0-9._-]{1,100}$/.test(
          model
        )
      ) {
        return {
          ok:
            false,
  
          category:
            "invalid_model",
        };
      }
  
      let relayBase;
  
      try {
        relayBase =
          new URL(
            env.AWS_RELAY_URL
          );
  
        if (
          relayBase.protocol !==
            "https:" ||
          relayBase.username ||
          relayBase.password
        ) {
          throw new Error(
            "bad_relay"
          );
        }
      }
  
      catch {
        return {
          ok:
            false,
  
          category:
            "relay_not_configured",
        };
      }
  
      endpoint =
        new URL(
          "/v1/chat",
          relayBase
        ).toString();
  
      const system =
        messages
          .filter(
            (m) =>
              m.role ===
              "system"
          )
          .map(
            (m) =>
              m.content
          )
          .join(
            "\n\n"
          );
  
      const contents =
        messages
          .filter(
            (m) =>
              m.role !==
              "system"
          )
          .map(
            (m) => ({
              role:
                m.role ===
                  "assistant"
                  ? "model"
                  : "user",
  
              parts: [
                {
                  text:
                    m.content,
                },
              ],
            })
          );
  
      const payload = {
        contents,
  
        generationConfig: {
          maxOutputTokens:
            maxOutput,
        },
      };
  
      if (system) {
        payload.systemInstruction =
          {
            parts: [
              {
                text:
                  system,
              },
            ],
          };
      }
  
      init = {
        method:
          "POST",
  
        headers: {
          authorization:
            `Bearer ${env.BAO_INTERNAL_TOKEN}`,
  
          "content-type":
            "application/json",
        },
  
        body:
          JSON.stringify(
            {
              model,
              payload,
            }
          ),
      };
    }
  
    else if (
      provider ===
      "anthropic"
    ) {
      if (
        !env.ANTHROPIC_API_KEY
      ) {
        return {
          ok:
            false,
  
          category:
            "provider_not_configured",
        };
      }
  
      if (
        !/^[a-zA-Z0-9._-]{1,120}$/.test(
          model
        )
      ) {
        return {
          ok:
            false,
  
          category:
            "invalid_model",
        };
      }
  
      endpoint =
        "https://api.anthropic.com/v1/messages";
  
      init = {
        method:
          "POST",
  
        headers: {
          "x-api-key":
            env.ANTHROPIC_API_KEY,
  
          "anthropic-version":
            "2023-06-01",
  
          "content-type":
            "application/json",
        },
  
        body:
          JSON.stringify(
            anthropicPayload(
              messages,
              model,
              maxOutput
            )
          ),
      };
    }
  
    else {
      return {
        ok:
          false,
  
        category:
          "invalid_provider",
      };
    }
  
    const route =
      (
        provider ===
          "gemini" ||
        usingAwsRelay
      )
        ? "aws_relay"
        : provider ===
            "openrouter"
          ? "direct_openrouter"
          : provider ===
              "anthropic"
            ? "direct_anthropic"
            : "provider_direct";
  
    const requestBytes =
      enc.encode(
        String(
          init?.body ||
          ""
        )
      ).length;

    // AWS relay adds another network hop and can legitimately need more
    // wall-clock time than direct provider calls. Keep this below the
    // current 180s Gunicorn timeout so the relay still owns the outer cutoff.
    const transportTimeoutMs =
      route ===
        "aws_relay"
        ? 170_000
        : 75_000;
  
    let response;
    const transportStartedAt =
      Date.now();
  
    try {
      response =
        await fetch(
          endpoint,
          {          ...init,
  
            signal:
              AbortSignal.timeout(
                transportTimeoutMs
              ),
          }
        );
    }
  
    catch (error) {
      const elapsedMs =
        Math.max(
          0,
          Date.now() -
            transportStartedAt
        );

      return {
        ok:
          false,
  
        category:
          (
            provider ===
              "gemini" ||
            usingAwsRelay
          )
            ? "relay_network_error"
            : "provider_network_error",
  
        route,
        requestBytes,

        elapsedMs,
        transportTimeoutMs,

        transportFailure:
          error?.name ===
            "TimeoutError" ||
          elapsedMs >=
            Math.max(
              0,
              transportTimeoutMs -
                1_000
            )
            ? "timeout"
            : "network",
      };
    }
  
    if (
      !response.ok &&
      provider ===
        "openrouter" &&
      usingAwsRelay &&
      response.status ===
        400 &&
      openRouterMessages !==
        messages
    ) {
      let relayError =
        null;

      try {
        relayError =
          await response
            .clone()
            .json();
      }

      catch {
        relayError =
          null;
      }

      if (
        relayError
          ?.error ===
        "invalid_messages"
      ) {
        let fallbackBody;

        try {
          fallbackBody =
            JSON.parse(
              init.body
            );
        }

        catch {
          fallbackBody =
            null;
        }

        if (
          fallbackBody &&
          typeof fallbackBody ===
            "object"
        ) {
          fallbackBody.messages =
            messages;

          init = {
            ...init,

            body:
              JSON.stringify(
                fallbackBody
              ),
          };

          try {
            response =
              await fetch(
                endpoint,
                {
                  ...init,

                  signal:
                    AbortSignal.timeout(
                transportTimeoutMs
              ),
                }
              );
          }

          catch (error) {
            const elapsedMs =
              Math.max(
                0,
                Date.now() -
                  transportStartedAt
              );

            return {
              ok:
                false,

              category:
                "relay_network_error",

              route,
              requestBytes,

              elapsedMs,
              transportTimeoutMs,

              transportFailure:
                error?.name ===
                  "TimeoutError" ||
                elapsedMs >=
                  Math.max(
                    0,
                    transportTimeoutMs -
                      1_000
                  )
                  ? "timeout"
                  : "network",
            };
          }
        }
      }
    }

    if (
      !response.ok
    ) {
      const rateLimit =
        response.status ===
          429
          ? await rateLimitDiagnostic(
              response
            )
          : null;

      const diagnostic =
        provider ===
          "gemini" &&
        response.status !==
          413
          ? await geminiErrorHint(
              response
            )
          : {
              hint:
                "unknown",
  
              providerStatus:
                null,
            };
  
      const category =
        response.status ===
          413
          ? route ===
              "aws_relay"
            ? "relay_request_too_large"
            : "provider_request_too_large"
          : provider ===
              "gemini" &&
            response.status ===
              400
            ? `google_bad_request_${diagnostic.hint}`
            : "provider_http_error";
  
      return {
        ok:
          false,
  
        category,
  
        upstreamStatus:
          response.status,
  
        providerStatus:
          diagnostic
            .providerStatus,

        rateLimitScope:
          rateLimit
            ?.scope,

        retryAfterSeconds:
          rateLimit
            ?.retryAfterSeconds,
  
        route,
        requestBytes,
      };
    }
  
    let data;
  
    try {
      data =
        await response.json();
    }
  
    catch {
      return {
        ok:
          false,
  
        category:
          "provider_invalid_json",
      };
    }
  
    if (
      provider ===
      "openrouter"
    ) {
      const text =
        data.choices?.[0]
          ?.message
          ?.content;

      const usage =
        data.usage ||
        {};

      let input =
        usageInt(
          usage.prompt_tokens
        );

      let output =
        usageInt(
          usage
            .completion_tokens
        );

      let cached =
        safeInt(
          usage
            .prompt_tokens_details
            ?.cached_tokens
        );

      let cacheWrite =
        safeInt(
          usage
            .prompt_tokens_details
            ?.cache_write_tokens
        );

      let reasoning =
        safeInt(
          usage
            .completion_tokens_details
            ?.reasoning_tokens
        );

      let providerCost =
        Number(
          usage.cost
        );

      providerCost =
        Number.isFinite(
          providerCost
        ) &&
        providerCost >= 0
          ? providerCost
          : null;

      const generationId =
        String(
          data.id ||
          response.headers.get(
            "x-generation-id"
          ) ||
          ""
        ).trim();

      if (
        (
          input === null ||
          output === null
        ) &&
        generationId
      ) {
        const recovered =
          await recoverOpenRouterUsage(
            env,
            generationId
          );

        if (recovered) {
          input =
            input ??
            recovered.input;

          output =
            output ??
            recovered.output;

          cached =
            recovered.cached;

          cacheWrite =
            recovered.cacheWrite;

          reasoning =
            recovered.reasoning;

          providerCost =
            providerCost ??
            recovered.providerCost;
        }
      }

      return {
        ok:
          typeof text ===
            "string" &&
          !!text.trim(),

        text,
        input,
        output,
        cached,
        cacheWrite,
        reasoning,
        providerCost,

        generationId:
          generationId ||
          null,

        category:
          "provider_empty_text",
      };
    }

    if (
      provider ===
      "anthropic"
    ) {
      const text =
        Array.isArray(
          data.content
        )
          ? data.content
              .filter(
                (b) =>
                  b?.type ===
                    "text" &&
                  typeof b.text ===
                    "string"
              )
              .map(
                (b) =>
                  b.text
              )
              .join("")
          : "";
  
      const usage =
        data.usage ||
        {};
  
      const freshInput =
        usageInt(
          usage.input_tokens
        );
  
      const cacheWrite =
        safeInt(
          usage
            .cache_creation_input_tokens
        );
  
      const cached =
        safeInt(
          usage
            .cache_read_input_tokens
        );
  
      const input =
        freshInput === null
          ? null
          : freshInput +
            cacheWrite +
            cached;
  
      const output =
        usageInt(
          usage.output_tokens
        );
  
      const reasoning =
        safeInt(
          usage
            .output_tokens_details
            ?.thinking_tokens
        );
  
      return {
        ok:
          typeof text ===
            "string" &&
          !!text.trim(),
  
        text,
        input,
        freshInput,
        output,
        cached,
        cacheWrite,
        reasoning,
  
        providerCost:
          null,
  
        category:
          "provider_empty_text",
  
        finishReason:
          String(
            data.stop_reason ||
            ""
          )
            .replace(
              /[^a-zA-Z0-9_-]/g,
              ""
            )
            .slice(
              0,
              40
            ),
      };
    }
  
    const text =
      data.candidates?.[0]
        ?.content
        ?.parts
        ?.filter(
          (p) =>
            typeof p.text ===
              "string"
        )
        .map(
          (p) =>
            p.text
        )
        .join("");
  
    const usage =
      data.usageMetadata ||
      {};
  
    const input =
      usageInt(
        usage.promptTokenCount
      );
  
    const cached =
      safeInt(
        usage
          .cachedContentTokenCount
      );
  
    const reasoning =
      safeInt(
        usage.thoughtsTokenCount
      );
  
    const total =
      usageInt(
        usage.totalTokenCount
      );

    const candidateOutput =
      usageInt(
        usage
          .candidatesTokenCount
      );

    const output =
      total !== null &&
      input !== null
        ? Math.max(
            0,
            total -
            input
          )
        : candidateOutput ===
            null
          ? null
          : candidateOutput +
            reasoning;
  
    return {
      ok:
        typeof text ===
          "string" &&
        !!text.trim(),
  
      text,
  
      input,
  
      freshInput:
        input === null
          ? null
          : Math.max(
              0,
              input -
              cached
            ),
  
      output,
      cached,
  
      cacheWrite:
        0,
  
      reasoning,
  
      providerCost:
        null,
  
      category:
        "provider_empty_text",
  
      finishReason:
        String(
          data.candidates?.[0]
            ?.finishReason ||
          data.promptFeedback
            ?.blockReason ||
          ""
        )
          .replace(
            /[^A-Z_]/g,
            ""
          )
          .slice(
            0,
            32
          ),
    };
  }
  
  function providerFailureResponse(
    result,
    requestId
  ) {
    const extra = {
      request_id:
        requestId,
    };
  
    if (
      [
        "aws_relay",
        "direct_openrouter",
        "direct_anthropic",
        "provider_direct",
      ].includes(
        result.route
      )
    ) {
      extra.route =
        result.route;
    }
  
    if (
      integer(
        result
          .requestBytes,
        1,
        10_000_000
      )
    ) {
      extra.request_bytes =
        result.requestBytes;
    }
  
    if (
      integer(
        result
          .upstreamStatus,
        400,
        599
      )
    ) {
      extra.upstream_http_status =
        result
          .upstreamStatus;
    }
  
    if (
      result
        .providerStatus
    ) {
      extra.provider_status =
        result
          .providerStatus;
    }

    if (
      [
        "rate",
        "quota",
        "provider",
        "unknown",
      ].includes(
        result
          .rateLimitScope
      )
    ) {
      extra.rate_limit_scope =
        result
          .rateLimitScope;
    }

    if (
      integer(
        result
          .retryAfterSeconds,
        1,
        3600
      )
    ) {
      extra.retry_after_seconds =
        result
          .retryAfterSeconds;
    }
  
    if (
      result
        .finishReason
    ) {
      extra.finish_reason =
        result
          .finishReason;
    }
  
    if (
      result.category ===
        "provider_http_error" &&
      result
        .upstreamStatus ===
        429
    ) {
      return fail(
        "provider_rate_limited",
        502,
        extra
      );
    }
  
    return fail(
      result.category ||
        "provider_request_failed",
      502,
      extra
    );
  }

  return Object.freeze({
    geminiErrorHint,
    anthropicPayload,
    recoverOpenRouterUsage,
    providerCall,
    providerFailureResponse,
  });
})();

const {
  geminiErrorHint,
  anthropicPayload,
  recoverOpenRouterUsage,
  providerCall,
  providerFailureResponse,
} = WorkerProviderTransport;

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
