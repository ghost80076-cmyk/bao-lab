const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildModelDeploymentPlan,
  buildWorkerEntry,
  loadRegistry,
  toMicrousd,
} = require("../workers/bao-lab-credits-api/build-model-deployment-plan.cjs");

const root = path.join(__dirname, "..");
const registry = loadRegistry(path.join(root, "data/presets/models.json"));
const plan = buildModelDeploymentPlan(registry);

assert.equal(plan.schema, "yorubay-worker-model-deployment-plan/v1");
assert.equal(plan.source_registry, "data/presets/models.json");
assert.equal(plan.cloudflare.MODELS_JSON.entries.length, 11);
assert.equal(plan.cloudflare.MODELS_JSON_EXTRA.entries.length, 4);
assert.equal(plan.resolved_routes.length, 15);
assert.equal(plan.aws.variable, "OPENROUTER_MODELS");
assert.equal(plan.aws.entries.length, 11);
assert.equal(new Set(plan.aws.entries).size, 11);
assert.equal(plan.aws.value_csv, plan.aws.entries.join(","));

const keyOf = entry => `${entry.provider}:${entry.model}`;
const allEntries = [
  ...plan.cloudflare.MODELS_JSON.entries,
  ...plan.cloudflare.MODELS_JSON_EXTRA.entries,
];
assert.equal(new Set(allEntries.map(keyOf)).size, 15);

const byKey = new Map(allEntries.map(entry => [keyOf(entry), entry]));

assert.deepEqual(
  byKey.get("gemini:gemini-3-flash-preview"),
  {
    provider: "gemini",
    model: "gemini-3-flash-preview",
    input_microusd_per_million: 500000,
    output_microusd_per_million: 3000000,
    cache_read_microusd_per_million: 50000,
  }
);

assert.deepEqual(
  byKey.get("openrouter:anthropic/claude-sonnet-4.5"),
  {
    provider: "openrouter",
    model: "anthropic/claude-sonnet-4.5",
    input_microusd_per_million: 3000000,
    output_microusd_per_million: 15000000,
    cache_read_microusd_per_million: 300000,
    cache_write_microusd_per_million: 3750000,
    openrouter_max_prompt_microusd_per_million: 4000000,
    openrouter_max_completion_microusd_per_million: 18000000,
  }
);

assert.deepEqual(
  byKey.get("openrouter:x-ai/grok-4.5"),
  {
    provider: "openrouter",
    model: "x-ai/grok-4.5",
    input_microusd_per_million: 2000000,
    output_microusd_per_million: 6000000,
    cache_read_microusd_per_million: 300000,
    openrouter_max_prompt_microusd_per_million: 2000000,
    openrouter_max_completion_microusd_per_million: 6000000,
    long_context_threshold_tokens: 200000,
    long_context_input_microusd_per_million: 4000000,
    long_context_output_microusd_per_million: 12000000,
    long_context_cache_read_microusd_per_million: 600000,
    long_context_openrouter_max_prompt_microusd_per_million: 4000000,
    long_context_openrouter_max_completion_microusd_per_million: 12000000,
  }
);

assert.deepEqual(
  byKey.get("gemini:gemini-3.1-pro-preview"),
  {
    provider: "gemini",
    model: "gemini-3.1-pro-preview",
    input_microusd_per_million: 2000000,
    output_microusd_per_million: 12000000,
    cache_read_microusd_per_million: 200000,
    long_context_threshold_tokens: 200000,
    long_context_input_microusd_per_million: 4000000,
    long_context_output_microusd_per_million: 18000000,
    long_context_cache_read_microusd_per_million: 400000,
  }
);

const hostedKeys = [];
for (const model of registry.models) {
  if (!model.hosted?.route_id) continue;
  const route = model.routes.find(candidate => candidate.id === model.hosted.route_id);
  hostedKeys.push(keyOf(route));
}
for (const key of hostedKeys) {
  assert.ok(byKey.has(key), `hosted route missing from full deployment plan: ${key}`);
}

const relayKeys = new Set(
  plan.resolved_routes
    .filter(route => route.relay)
    .map(route => `${route.provider}:${route.model}`)
);
assert.equal(relayKeys.has("openrouter:google/gemini-3-flash-preview"), false);
assert.equal(relayKeys.has("openrouter:google/gemini-3.1-pro-preview"), false);
assert.equal(relayKeys.has("openrouter:deepseek/deepseek-v4-flash-0731"), true);
assert.equal(relayKeys.has("openrouter:x-ai/grok-4.5"), true);

const rolloutPath = path.join(
  root,
  "workers/bao-lab-credits-api/model-rollouts/2026-10-02-mainstream-openrouter.json"
);
const rollout = JSON.parse(fs.readFileSync(rolloutPath, "utf8"));
const extraByKey = new Map(
  plan.cloudflare.MODELS_JSON_EXTRA.entries.map(entry => [keyOf(entry), entry])
);
assert.equal(rollout.length, extraByKey.size);
for (const entry of rollout) {
  assert.deepEqual(extraByKey.get(keyOf(entry)), entry);
}

assert.equal(toMicrousd(0.00255, "test"), 2550);
assert.throws(() => toMicrousd(-1, "test"), /non-negative/);

const isolated = buildWorkerEntry(
  { id: "fixture" },
  {
    id: "route",
    provider: "openrouter",
    model: "fixture/model",
    pricing: { input: 99, output: 99 },
    worker: {
      binding: "MODELS_JSON",
      pricing: { input: 1, output: 2, cache: 0.1, cache_write: 1.25 },
      openrouter_max_price: { prompt: 1.5, completion: 3 },
      aws_openrouter_relay: true,
    },
  }
);
assert.equal(isolated.entry.input_microusd_per_million, 1000000);
assert.equal(isolated.entry.output_microusd_per_million, 2000000);
assert.equal(isolated.entry.cache_write_microusd_per_million, 1250000);
assert.equal(isolated.relay, true);

assert.throws(
  () =>
    buildWorkerEntry(
      { id: "fixture" },
      {
        id: "route",
        provider: "openrouter",
        model: "fixture/model",
        worker: {
          binding: "MODELS_JSON",
          pricing: { input: 2, output: 2 },
          openrouter_max_price: { prompt: 1, completion: 2 },
        },
      }
    ),
  /prompt max price cannot be below input price/
);

console.log(
  `model deployment plan: ${plan.cloudflare.MODELS_JSON.entries.length} base + ${plan.cloudflare.MODELS_JSON_EXTRA.entries.length} extra, ${plan.aws.entries.length} relay models ok`
);
