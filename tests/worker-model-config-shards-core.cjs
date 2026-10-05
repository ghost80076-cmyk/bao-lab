const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();
const workerEntrySource = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);
const moduleSource = fs.readFileSync(
  path.join(
    __dirname,
    "../workers/bao-lab-credits-api/modules/model-pricing.js"
  ),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/model-pricing\.js";/,
  "the Worker entry must import the extracted model pricing module"
);
assert.doesNotMatch(
  workerEntrySource,
  /const WorkerModelPricing =/,
  "model pricing implementation must not remain duplicated in worker.js"
);
assert.match(
  moduleSource,
  /const WorkerModelPricing = \(\(\) => \{/,
  "model allowlist and pricing helpers must stay grouped behind WorkerModelPricing"
);
for (const helper of [
  "modelConfigs",
  "modelConfig",
  "modelAllowed",
  "pricingRate",
  "longContextActive",
  "resolvedPricingRates",
  "openRouterPriceGuard",
  "costBucketsMicrousd",
  "usageForStorage",
  "computedUsageCostMicrousd",
  "actualUsageCostMicrousd",
  "estimatedPromptTokens",
  "reservePlan",
]) {
  assert.match(source, new RegExp("\\b" + helper + "\\b"), "WorkerModelPricing boundary is missing " + helper);
}

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { modelConfigs, modelConfig, modelAllowed };";

const {
  modelConfigs,
  modelConfig,
  modelAllowed,
} = new Function(instrumented)();

const base = [
  {
    provider: "gemini",
    model: "gemini-3-flash-preview",
  },
];

const extra = [
  {
    provider: "openrouter",
    model: "anthropic/claude-haiku-4.5",
  },
  {
    provider: "openrouter",
    model: "openai/gpt-5.6-luna",
  },
];

const env = {
  MODELS_JSON: JSON.stringify(base),
  MODELS_JSON_EXTRA: JSON.stringify(extra),
};

assert.equal(modelConfigs(env).length, 3);
assert.equal(
  modelAllowed(env, "gemini", "gemini-3-flash-preview"),
  true
);
assert.equal(
  modelAllowed(env, "openrouter", "anthropic/claude-haiku-4.5"),
  true
);
assert.equal(
  modelConfig(env, "openrouter", "openai/gpt-5.6-luna")?.model,
  "openai/gpt-5.6-luna"
);

// A malformed extra shard must not erase a valid base allowlist.
assert.equal(
  modelConfigs({
    MODELS_JSON: JSON.stringify(base),
    MODELS_JSON_EXTRA: "{bad-json",
  }).length,
  1
);

console.log("worker model config shard core test passed");
