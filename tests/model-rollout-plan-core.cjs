const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const tool = path.join(
  root,
  "workers/bao-lab-credits-api/build-model-rollout-plan.cjs"
);
const rollout = path.join(
  root,
  "workers/bao-lab-credits-api/model-rollouts/2026-10-02-mainstream-openrouter.json"
);

const plan = JSON.parse(execFileSync(process.execPath, [tool, rollout], {
  cwd: root,
  encoding: "utf8",
}));

assert.equal(plan.schema, "yorubay-worker-model-rollout-plan/v1");
assert.equal(plan.source_registry, "data/presets/models.json");
assert.equal(
  plan.source_rollout,
  "workers/bao-lab-credits-api/model-rollouts/2026-10-02-mainstream-openrouter.json"
);
assert.equal(plan.cloudflare.binding, "MODELS_JSON_EXTRA");
assert.equal(plan.cloudflare.entries.length, 4);
assert.deepEqual(JSON.parse(plan.cloudflare.value_json), plan.cloudflare.entries);
assert.deepEqual(
  plan.resolved_routes.map(route => route.logical_model_id),
  ["claude-haiku-4.5", "claude-sonnet-5", "gpt-5.6-luna", "grok-4.5"]
);
assert.equal(plan.resolved_routes.every(route => route.route_id === "openrouter"), true);
assert.deepEqual(plan.aws.append, [
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-5",
  "openai/gpt-5.6-luna",
  "x-ai/grok-4.5",
]);
assert.equal(plan.aws.variable, "OPENROUTER_MODELS");
assert.equal(plan.aws.append_csv, plan.aws.append.join(","));

const missingArgument = spawnSync(process.execPath, [tool], {
  cwd: root,
  encoding: "utf8",
});
assert.equal(missingArgument.status, 2);
assert.match(missingArgument.stderr, /usage:/);

console.log("model rollout plan core test passed");
