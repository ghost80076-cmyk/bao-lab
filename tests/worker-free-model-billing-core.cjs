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
  "\nreturn { reservePlan, actualUsageCostMicrousd, computedUsageCostMicrousd };";

const {
  reservePlan,
  actualUsageCostMicrousd,
  computedUsageCostMicrousd,
} = new Function(instrumented)();

const messages = [
  {
    role: "user",
    content: "free model billing test",
  },
];

const freeConfig = {
  input_microusd_per_million: 0,
  output_microusd_per_million: 0,
  cache_read_microusd_per_million: 0,
  cache_write_microusd_per_million: 0,
};

const freePlan = reservePlan(
  freeConfig,
  messages,
  2048,
  0
);

assert.equal(freePlan.ok, true);
assert.equal(freePlan.inputReserveMicrousd, 0);
assert.equal(freePlan.outputReserveMicrousd, 0);
assert.equal(freePlan.reserveMicrousd, 0);
assert.equal(freePlan.effectiveMaxOutput, 2048);

const storedFreeUsage = {
  freshInput: 5000,
  cached: 0,
  cacheWrite: 0,
  output: 1000,
  providerCostMicrousd: 0,
};

assert.equal(
  actualUsageCostMicrousd(
    freeConfig,
    storedFreeUsage
  ),
  0,
  "explicit upstream usage.cost=0 must remain zero"
);

assert.equal(
  computedUsageCostMicrousd(
    freeConfig,
    {
      ...storedFreeUsage,
      providerCostMicrousd: null,
    }
  ),
  0,
  "zero configured rates must also compute to zero"
);

const inputOnlyConfig = {
  input_microusd_per_million: 1_000_000,
  output_microusd_per_million: 0,
  cache_read_microusd_per_million: 1_000_000,
  cache_write_microusd_per_million: 1_000_000,
};

const inputOnlyPlan = reservePlan(
  inputOnlyConfig,
  messages,
  1024,
  10_000_000
);

assert.equal(inputOnlyPlan.ok, true);
assert.equal(inputOnlyPlan.outputReserveMicrousd, 0);
assert.equal(inputOnlyPlan.effectiveMaxOutput, 1024);
assert.ok(inputOnlyPlan.inputReserveMicrousd > 0);

const paidConfig = {
  input_microusd_per_million: 2_000_000,
  output_microusd_per_million: 12_000_000,
};

const paidNoBalance = reservePlan(
  paidConfig,
  messages,
  1024,
  0
);

assert.equal(paidNoBalance.ok, false);

assert.match(
  source,
  /plan\s*\.\s*reserveMicrousd\s*>\s*0/,
  "zero-reserve requests should skip the wallet debit UPDATE"
);

console.log("worker free-model billing core test passed");
