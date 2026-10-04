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

  {
    let release;
    let calls = 0;
    const pending = new Promise(resolve => { release = resolve; });
    const context = {
      App: { config: { offlineWorldPreview: false, demoMode: false } },
      hasKey: () => true,
      open: () => {}
    };
    const fn = vm.runInNewContext(
      `(function(next, ...args) {${match[1]}\n})`,
      context
    );
    const first = fn(async () => {
      calls += 1;
      await pending;
      return "first";
    });
    const duplicate = await fn(async () => {
      calls += 1;
      return "duplicate";
    });
    assert.equal(duplicate, undefined, "a second send while the first is pending must be ignored");
    assert.equal(calls, 1, "double Enter/tap must not create a second provider request");
    release();
    assert.equal(await first, "first");
    assert.equal(context.App.__chatSendInFlight, false, "send lock must clear after completion");
    assert.equal(await fn(async () => {
      calls += 1;
      return "third";
    }), "third", "a later turn must be allowed after the first completes");
    assert.equal(calls, 2);
  }

  console.log("chat-api-send-gate: connection routing and single-flight send preserved");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
