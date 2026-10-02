const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "chat-api-settings.js"), "utf8");
const match = source.match(/const sendGateWrapper = function\(next, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "sendGateWrapper must remain directly testable");

const wrapper = vm.runInNewContext(
  `(function(next, ...args) {${match[1]}\n})`,
  {
    App: { config: {} },
    hasKey: () => true,
    open: () => {}
  }
);

async function runCase(config, keyReady) {
  let opened = 0;
  let nextCalls = 0;
  let received = null;
  const context = {
    App: { config },
    hasKey: () => keyReady,
    open: () => { opened += 1; }
  };
  const fn = vm.runInNewContext(
    `(function(next, ...args) {${match[1]}\n})`,
    context
  );
  const result = await fn(async (...args) => {
    nextCalls += 1;
    received = args;
    return "sent";
  }, "message", 42);
  return { opened, nextCalls, received, result };
}

(async () => {
  let result = await runCase({ offlineWorldPreview: true, demoMode: false }, true);
  assert.equal(result.opened, 1);
  assert.equal(result.nextCalls, 0);
  assert.equal(result.result, undefined);

  result = await runCase({ offlineWorldPreview: false, demoMode: false }, false);
  assert.equal(result.opened, 1);
  assert.equal(result.nextCalls, 0);

  result = await runCase({ offlineWorldPreview: false, demoMode: false }, true);
  assert.equal(result.opened, 0);
  assert.equal(result.nextCalls, 1);
  assert.deepEqual(Array.from(result.received), ["message", 42]);
  assert.equal(result.result, "sent");

  result = await runCase({ offlineWorldPreview: false, demoMode: true }, false);
  assert.equal(result.opened, 0, "demo mode must not require a connection key");
  assert.equal(result.nextCalls, 1);
  assert.equal(result.result, "sent");

  console.log("chat-api-send-gate: offline/key/demo routing preserved");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
