const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerAccountValidation = \(\(\) => \{/,
  "account input normalization must stay behind WorkerAccountValidation"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerAccountValidation, validUsername, validPassword, validDisplayName };";

const {
  WorkerAccountValidation,
  validUsername,
  validPassword,
  validDisplayName,
} = new Function(instrumented)();

assert.equal(WorkerAccountValidation.validUsername, validUsername);
assert.equal(WorkerAccountValidation.validPassword, validPassword);
assert.equal(WorkerAccountValidation.validDisplayName, validDisplayName);

assert.equal(validUsername("  Player.Name-1  "), "player.name-1");
assert.equal(validUsername("ab"), null);
assert.equal(validUsername("玩家名稱"), null);
assert.equal(validUsername("a".repeat(33)), null);

assert.equal(validPassword("1234567890"), true);
assert.equal(validPassword("123456789"), false);
assert.equal(validPassword("a".repeat(128)), true);
assert.equal(validPassword("a".repeat(129)), false);
assert.equal(validPassword(null), false);

assert.equal(validDisplayName("  夜航者  "), "夜航者");
assert.equal(validDisplayName(""), null);
assert.equal(validDisplayName("名".repeat(50)), "名".repeat(50));
assert.equal(validDisplayName("名".repeat(51)), null);

console.log("worker account validation core test passed");
