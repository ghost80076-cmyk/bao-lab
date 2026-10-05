const assert = require("node:assert/strict");

const {
  auditAwsOpenRouterModels,
  compareAwsOpenRouterModels,
  normalizeCsv,
} = require("../scripts/audit-aws-openrouter-models.cjs");

assert.deepEqual(normalizeCsv(" a,b,a ,, c "), {
  entries: ["a", "b", "a", "c"],
  unique: ["a", "b", "c"],
});

const expected = [
  "anthropic/claude-haiku-4.5",
  "openai/gpt-5.6-luna",
  "x-ai/grok-4.5",
];

const aligned = compareAwsOpenRouterModels(
  "x-ai/grok-4.5,anthropic/claude-haiku-4.5,openai/gpt-5.6-luna",
  expected
);
assert.equal(aligned.ok, true);
assert.deepEqual(aligned.missing, []);
assert.deepEqual(aligned.unexpected, []);
assert.deepEqual(aligned.duplicates, []);
assert.equal(aligned.expected_count, 3);
assert.equal(aligned.current_count, 3);
assert.equal(
  aligned.expected_csv,
  "anthropic/claude-haiku-4.5,openai/gpt-5.6-luna,x-ai/grok-4.5"
);

const drift = compareAwsOpenRouterModels(
  "anthropic/claude-haiku-4.5,legacy/model,legacy/model",
  expected
);
assert.equal(drift.ok, false);
assert.deepEqual(drift.missing, [
  "openai/gpt-5.6-luna",
  "x-ai/grok-4.5",
]);
assert.deepEqual(drift.unexpected, ["legacy/model"]);
assert.deepEqual(drift.duplicates, ["legacy/model"]);

const fixturePlan = {
  aws: {
    entries: expected,
  },
};

assert.deepEqual(
  auditAwsOpenRouterModels({
    registry: { schema: "fixture" },
    plan: fixturePlan,
    currentValue:
      "anthropic/claude-haiku-4.5,openai/gpt-5.6-luna,x-ai/grok-4.5",
  }).ok,
  true
);

assert.throws(
  () =>
    auditAwsOpenRouterModels({
      registry: { schema: "fixture" },
      plan: fixturePlan,
      currentValue: undefined,
    }),
  /OPENROUTER_MODELS is required/
);

console.log("AWS OpenRouter model registry audit core test passed");
