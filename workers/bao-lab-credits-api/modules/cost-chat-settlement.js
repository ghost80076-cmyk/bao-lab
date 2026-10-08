import {
  COST_BILLING_MODE,
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
  DEFAULT_PRICING_VERSION,
  actualUsageCostMicrousd,
  modelConfig,
  reservePlan,
  usageForStorage,
} from "./model-pricing.js";

import {
  integer,
  safeMoneyInt,
} from "./number-utils.js";

import {
  resolveHostedRoute,
} from "./provider-routing.js";

import {
  providerCall,
  providerFailureResponse,
} from "./provider-transport.js";

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
      sessionId,
      kind
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
      finish_reason: result.finishReason || null,

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
    finish_reason: result.finishReason || null,

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

export {
  WorkerCostChatSettlement,
  costUsdChatRoute,
};
