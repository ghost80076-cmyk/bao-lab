const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();

assert.match(
  source,
  /const WorkerChatDispatch = \(\(\) => \{/,
  "chat authentication and billing-mode selection must stay grouped behind WorkerChatDispatch"
);

const boundaryStart = source.indexOf("const WorkerChatDispatch = (() => {");
const boundaryEnd = source.indexOf("const {\n  chatRoute,\n} = WorkerChatDispatch;");
const boundary = source.slice(boundaryStart, boundaryEnd);

assert.match(boundary, /await playerFor\(/);
assert.match(boundary, /await readJson\(/);
assert.match(boundary, /billingModeForPlayer\(/);
assert.match(boundary, /costUsdChatRoute\(/);
assert.match(boundary, /legacyChatRoute\(/);
assert.doesNotMatch(
  boundary,
  /UPDATE wallets|UPDATE players|INSERT INTO api_usage/,
  "the dispatch boundary must not take ownership of settlement SQL"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerChatDispatch, chatRoute };";

const {
  WorkerChatDispatch,
  chatRoute,
} = new Function(instrumented)();

assert.equal(WorkerChatDispatch.chatRoute, chatRoute);

(async () => {
  const unauthorized = await chatRoute(
    new Request("https://worker.test/v1/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    }),
    {},
    {}
  );

  assert.equal(unauthorized.status, 401);
  assert.equal((await unauthorized.json()).error, "unauthorized");

  console.log("worker chat dispatch core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
