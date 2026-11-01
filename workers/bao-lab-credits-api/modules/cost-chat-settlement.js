import { recordRequestTrace } from "./request-trace.js";

import {
  ensureWalletReservations,
  reserveWallet,
  settleWallet,
  recoverExpiredWalletReservations,
} from "./wallet-reservations.js";

import {
  COST_BILLING_MODE,
} from "./billing-constants.js";

import {
  maxOutputForRequest,
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
  providerFailureCode,
  providerFailureResponse,
} from "./provider-transport.js";

import {
  recordUsageFailure,
} from "./usage-diagnostics.js";

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
      maxOutputForRequest(requestedProvider, kind)
    )
  ) {
    return fail(
      "invalid_max_output_tokens"
    );
  }

  // Validate the submitted contract, then budget the actual admin-selected transport.
  const routedMaxOutput = Math.min(requestedMaxOutput, maxOutputForRequest(provider, kind));

  let walletBalance = safeMoneyInt(player.wallet_balance_microusd);

  let plan =
    reservePlan(
      config,
      messages,
      routedMaxOutput,
      walletBalance
    );

  if (!plan) {
    return fail(
      "pricing_not_configured",
      503
    );
  }

  await ensureWalletReservations(db);
  await recoverExpiredWalletReservations(db, player.id);
  const currentWallet = await db.prepare(
    'SELECT balance_microusd FROM wallets WHERE player_id = ?'
  ).bind(player.id).first();
  walletBalance = safeMoneyInt(currentWallet?.balance_microusd);
  plan = reservePlan(config, messages, routedMaxOutput, walletBalance);

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

  // A shortened JSON summary can consume money without producing valid memory.
  // Reserve the full routed output or stop before creating a paid request.
  if (kind === 'summary' && plan.effectiveMaxOutput < routedMaxOutput) {
    return fail('insufficient_wallet_balance_for_summary', 402, {
      requested_max_output_tokens: requestedMaxOutput,
      effective_max_output_tokens: plan.effectiveMaxOutput,
      affordable_output_tokens: plan.effectiveMaxOutput,
      wallet_balance_microusd: walletBalance,
      model_called: false
    });
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

  const reserved = await reserveWallet(db, requestId, player.id, plan.reserveMicrousd);
  if (!reserved) {
    await db.prepare("UPDATE api_usage SET status = 'denied' WHERE request_id = ?")
      .bind(requestId).run();
    return fail("insufficient_wallet_balance", 402);
  }

  const refundReservation = (status, stored = {}) => settleWallet(db, {
    requestId, playerId: player.id, actualCost: 0, stored, status,
    billingMode: COST_BILLING_MODE, pricingVersion, provider, model, refund: true,
  });

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

  await recordRequestTrace(db, requestId, result);

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
      await refundReservation("unverified_refunded");

      await recordUsageFailure(
        db,
        requestId,
        providerFailureCode(
          result
        ),
        result
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

    await refundReservation("failed");

    await recordUsageFailure(
      db,
      requestId,
      providerFailureCode(
        result
      ),
      result
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
    const refunded = await refundReservation("unverified_refunded", stored);

    await recordUsageFailure(
      db,
      requestId,
      "usage_metadata_unverified",
      result
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
          safeMoneyInt(refunded?.balance_after_microusd),

        wallet_balance_usd:
          safeMoneyInt(refunded?.balance_after_microusd) /
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
    await refundReservation("pricing_error", stored);

    await recordUsageFailure(
      db,
      requestId,
      "pricing_calculation_failed",
      result
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

  const settlement = await settleWallet(db, {
    requestId, playerId: player.id, actualCost, stored,
    billingMode: COST_BILLING_MODE, pricingVersion, provider, model,
  });
  if (settlement?.state !== 'settled') {
    return fail('reservation_already_refunded', 409, {
      request_id: requestId, billing_refunded: true,
    });
  }
  const charged = settlement.charged_microusd;
  const settlementStatus = settlement.settlement_status;
  const balanceAfter = settlement.balance_after_microusd;

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
