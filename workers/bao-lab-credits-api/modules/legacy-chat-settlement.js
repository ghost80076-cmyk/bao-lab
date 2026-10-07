import {
  LEGACY_BILLING_MODE,
} from "./billing-constants.js";

import {
  MAX_OUTPUT,
  normalizeHostedSessionId,
  normalizeMessages,
} from "./chat-input.js";

import {
  fail,
  json,
} from "./http.js";

import {
  estimatedPromptTokens,
  modelAllowed,
  usageForStorage,
} from "./model-pricing.js";

import {
  integer,
} from "./number-utils.js";

import {
  resolveHostedRoute,
} from "./provider-routing.js";

import {
  providerCall,
  providerFailureResponse,
} from "./provider-transport.js";

const LEGACY_CREDIT_TOKEN_UNIT = 100;

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

export {
  WorkerLegacyChatSettlement,
  legacyChatRoute,
};
