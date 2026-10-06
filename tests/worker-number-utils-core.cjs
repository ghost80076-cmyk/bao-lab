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
  path.join(__dirname, "../workers/bao-lab-credits-api/modules/number-utils.js"),
  "utf8"
);

assert.match(
  workerEntrySource,
  /from "\.\/modules\/number-utils\.js";/,
  "worker entry must import the extracted numeric helpers"
);
assert.doesNotMatch(
  workerEntrySource,
  /const safeMoneyInt =/,
  "numeric helper implementation must not remain duplicated in worker.js"
);
assert.match(
  moduleSource,
  /const safeMoneyInt =/,
  "money guard must live in the numeric helper module"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { integer, safeInt, usageInt, safeMoneyInt };";

const {
  integer,
  safeInt,
  usageInt,
  safeMoneyInt,
} = new Function(instrumented)();

assert.equal(integer(0, 0, 10), true);
assert.equal(integer(10, 0, 10), true);
assert.equal(integer(-1, 0, 10), false);
assert.equal(integer(11, 0, 10), false);
assert.equal(integer(1.5, 0, 10), false);
assert.equal(integer(Number.MAX_SAFE_INTEGER + 1, 0, Number.MAX_SAFE_INTEGER + 1), false);

assert.equal(safeInt(0), 0);
assert.equal(safeInt(1_000_000_000), 1_000_000_000);
assert.equal(safeInt(-1), 0);
assert.equal(safeInt(1_000_000_001), 0);
assert.equal(safeInt("7"), 0);

assert.equal(usageInt(0), 0);
assert.equal(usageInt(1_000_000_000), 1_000_000_000);
assert.equal(usageInt(-1), null);
assert.equal(usageInt(1_000_000_001), null);
assert.equal(usageInt(undefined), null);

assert.equal(safeMoneyInt(0), 0);
assert.equal(safeMoneyInt(9_000_000_000_000), 9_000_000_000_000);
assert.equal(safeMoneyInt(-1), 0);
assert.equal(safeMoneyInt(9_000_000_000_001), 0);
assert.equal(safeMoneyInt(1.25), 0);

console.log("worker number utils core test passed");
