const assert = require("node:assert/strict");
const { loadWorkerTestSource } = require("./helpers/worker-test-source.cjs");
const fs = require("node:fs");
const path = require("node:path");

const source = loadWorkerTestSource();

assert.match(
  source,
  /const WorkerChatInput = \(\(\) => \{/,
  "chat payload validation must stay behind WorkerChatInput"
);

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { WorkerChatInput, normalizeMessages, normalizeHostedSessionId };";

const {
  WorkerChatInput,
  normalizeMessages,
  normalizeHostedSessionId,
} = new Function(instrumented)();

assert.equal(WorkerChatInput.normalizeMessages, normalizeMessages);
assert.equal(
  WorkerChatInput.normalizeHostedSessionId,
  normalizeHostedSessionId
);

const input = [
  { role: "system", content: "Stay concise.", ignored: "not forwarded" },
  { role: "user", content: "Hello", metadata: { private: true } },
  { role: "assistant", content: "Hi" },
];
assert.deepEqual(normalizeMessages(input), [
  { role: "system", content: "Stay concise." },
  { role: "user", content: "Hello" },
  { role: "assistant", content: "Hi" },
]);
assert.equal(normalizeMessages(null), null);
assert.equal(normalizeMessages([]), null);
assert.equal(
  normalizeMessages(Array.from({ length: 101 }, () => ({
    role: "user",
    content: "x",
  }))),
  null
);
assert.equal(normalizeMessages([{ role: "tool", content: "x" }]), null);
assert.equal(normalizeMessages([{ role: "user", content: "" }]), null);
assert.equal(
  normalizeMessages([{ role: "user", content: "x".repeat(80_001) }]),
  null
);
assert.equal(normalizeMessages([{ role: "system", content: "only system" }]), null);
assert.equal(
  normalizeMessages([
    { role: "user", content: "x".repeat(70_000) },
    { role: "assistant", content: "x".repeat(70_000) },
    { role: "user", content: "x".repeat(70_000) },
  ]),
  null,
  "the serialized prompt byte ceiling must still apply"
);

assert.equal(normalizeHostedSessionId(undefined), "");
assert.equal(normalizeHostedSessionId(null), "");
assert.equal(normalizeHostedSessionId(""), "");
assert.equal(
  normalizeHostedSessionId("  bao-lab:story_1.chat-2  "),
  "bao-lab:story_1.chat-2"
);
assert.equal(normalizeHostedSessionId(123), null);
assert.equal(normalizeHostedSessionId("   "), null);
assert.equal(normalizeHostedSessionId("bad/session"), null);
assert.equal(normalizeHostedSessionId("x".repeat(256)), "x".repeat(256));
assert.equal(normalizeHostedSessionId("x".repeat(257)), null);

console.log("worker chat input core test passed");
