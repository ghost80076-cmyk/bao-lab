const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const rolloutPath = path.join(
  __dirname,
  "../workers/bao-lab-credits-api/model-rollouts/2026-10-02-mainstream-openrouter.json"
);

const configs = JSON.parse(
  fs.readFileSync(rolloutPath, "utf8")
);

assert.equal(configs.length, 4, "expected four mainstream Hosted rollout entries");

const byModel = new Map(
  configs.map((config) => [config.model, config])
);

const expected = {
  "anthropic/claude-haiku-4.5": {
    input: 1_000_000,
    output: 5_000_000,
    cacheRead: 100_000,
    cacheWrite: 1_250_000,
  },
  "anthropic/claude-sonnet-5": {
    input: 2_000_000,
    output: 10_000_000,
    cacheRead: 200_000,
    cacheWrite: 2_500_000,
  },
  "openai/gpt-5.6-luna": {
    input: 200_000,
    output: 1_200_000,
    cacheRead: 20_000,
    cacheWrite: 250_000,
  },
  "x-ai/grok-4.5": {
    input: 2_000_000,
    output: 6_000_000,
    cacheRead: 300_000,
  },
};

assert.deepEqual(
  [...byModel.keys()].sort(),
  Object.keys(expected).sort(),
  "rollout must contain only the four reviewed Hosted additions"
);

for (const [model, rates] of Object.entries(expected)) {
  const config = byModel.get(model);
  assert.equal(config.provider, "openrouter", `${model} must use OpenRouter Hosted`);
  assert.equal(config.input_microusd_per_million, rates.input, `${model} input pricing drifted`);
  assert.equal(config.output_microusd_per_million, rates.output, `${model} output pricing drifted`);
  assert.equal(config.cache_read_microusd_per_million, rates.cacheRead, `${model} cache-read pricing drifted`);

  if (rates.cacheWrite !== undefined) {
    assert.equal(config.cache_write_microusd_per_million, rates.cacheWrite, `${model} cache-write pricing drifted`);
  }

  assert.equal(
    config.openrouter_max_prompt_microusd_per_million,
    rates.input,
    `${model} prompt hard ceiling must match the reviewed standard input price`
  );
  assert.equal(
    config.openrouter_max_completion_microusd_per_million,
    rates.output,
    `${model} completion hard ceiling must match the reviewed standard output price`
  );
}

const grok = byModel.get("x-ai/grok-4.5");
assert.equal(grok.long_context_threshold_tokens, 200_000);
assert.equal(grok.long_context_input_microusd_per_million, 4_000_000);
assert.equal(grok.long_context_output_microusd_per_million, 12_000_000);
assert.equal(grok.long_context_cache_read_microusd_per_million, 600_000);
assert.equal(grok.long_context_openrouter_max_prompt_microusd_per_million, 4_000_000);
assert.equal(grok.long_context_openrouter_max_completion_microusd_per_million, 12_000_000);

console.log("hosted mainstream rollout core test passed");
