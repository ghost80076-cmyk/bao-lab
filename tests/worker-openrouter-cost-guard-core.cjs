const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { reservePlan, resolvedPricingRates, openRouterPriceGuard, computedUsageCostMicrousd };";

const {
  reservePlan,
  resolvedPricingRates,
  openRouterPriceGuard,
  computedUsageCostMicrousd,
} = new Function(instrumented)();

const config = {
  provider: "openrouter",
  input_microusd_per_million: 100_000,
  output_microusd_per_million: 200_000,
  cache_read_microusd_per_million: 50_000,
  cache_write_microusd_per_million: 125_000,

  openrouter_max_prompt_microusd_per_million: 150_000,
  openrouter_max_completion_microusd_per_million: 300_000,

  long_context_threshold_tokens: 200_000,
  long_context_input_microusd_per_million: 200_000,
  long_context_output_microusd_per_million: 400_000,
  long_context_cache_read_microusd_per_million: 100_000,
  long_context_cache_write_microusd_per_million: 250_000,
  long_context_openrouter_max_prompt_microusd_per_million: 250_000,
  long_context_openrouter_max_completion_microusd_per_million: 500_000,
};

const standard = resolvedPricingRates(config, 199_999);
assert.equal(standard.longContext, false);
assert.equal(standard.inputRate, 100_000);
assert.equal(standard.outputRate, 200_000);

const long = resolvedPricingRates(config, 200_001);
assert.equal(long.longContext, true);
assert.equal(long.inputRate, 200_000);
assert.equal(long.outputRate, 400_000);
assert.equal(long.cacheWriteRate, 250_000);

const standardGuard = openRouterPriceGuard(config, 199_999);
assert.equal(standardGuard.provider.max_price.prompt, 0.15);
assert.equal(standardGuard.provider.max_price.completion, 0.3);

const longGuard = openRouterPriceGuard(config, 200_001);
assert.equal(longGuard.provider.max_price.prompt, 0.25);
assert.equal(longGuard.provider.max_price.completion, 0.5);

const messages = [{ role: "user", content: "cost guard" }];
const guardedPlan = reservePlan(config, messages, 1000, 1_000_000);
assert.equal(guardedPlan.ok, true);
assert.equal(guardedPlan.pricingTier, "standard");
assert.equal(guardedPlan.openRouterMaxPromptMicrousdPerMillion, 150_000);
assert.equal(guardedPlan.openRouterMaxCompletionMicrousdPerMillion, 300_000);

// Reserve must use the hard ceiling, so it can never reserve less than the
// configured prompt/completion cap for the estimated tokens.
assert.ok(guardedPlan.inputReserveMicrousd > 0);
assert.equal(guardedPlan.outputReserveMicrousd, 300);

const fallbackLongCost = computedUsageCostMicrousd(
  config,
  {
    input: 200_001,
    freshInput: 200_001,
    cached: 0,
    cacheWrite: 0,
    output: 1000,
    providerCostMicrousd: null,
  }
);
assert.equal(fallbackLongCost, 40_401);

assert.match(
  source,
  /openrouter_provider:\s*openRouterGuard\s*\?\.provider/,
  "AWS relay contract must receive the same OpenRouter price guard"
);

assert.match(
  source,
  /provider:\s*openRouterGuard\s*\?\.provider[\s\S]*usage:\s*\{\s*include:\s*true/,
  "direct OpenRouter requests must send provider.max_price"
);

console.log("worker OpenRouter cost guard core test passed");
