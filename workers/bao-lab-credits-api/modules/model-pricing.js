// Pure hosted-model allowlist, pricing and reservation calculations.
// Keep this module independent of storage, sessions, HTTP and provider transport.
const DEFAULT_PRICING_VERSION = "2026-09-25-v1";
const MODEL_PRICING_MAX_OUTPUT = 8192;
const MODEL_PRICING_MIN_AFFORDABLE_OUTPUT_TOKENS = 64;

const modelPricingSafeInt = (n) =>
  Number.isSafeInteger(n) &&
  n >= 0 &&
  n <= 1_000_000_000
    ? n
    : 0;

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
      modelPricingSafeInt(
        result?.input
      );
  
    const cached =
      modelPricingSafeInt(
        result?.cached
      );
  
    const cacheWrite =
      modelPricingSafeInt(
        result
          ?.cacheWrite
      );
  
    const reasoning =
      modelPricingSafeInt(
        result
          ?.reasoning
      );
  
    const output =
      modelPricingSafeInt(
        result?.output
      );
  
    const freshInput =
      modelPricingSafeInt(
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
          MODEL_PRICING_MAX_OUTPUT
        )
        ? MODEL_PRICING_MAX_OUTPUT
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
        MODEL_PRICING_MIN_AFFORDABLE_OUTPUT_TOKENS
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

export {
  DEFAULT_PRICING_VERSION,
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
  openRouterPriceGuard,
  pricingRate,
  providerCostMicrousd,
  reservePlan,
  resolvedPricingRates,
  usageForStorage,
};
