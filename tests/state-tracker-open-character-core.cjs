const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "state-tracker-repairs.js"), "utf8");
const match = source.match(/const stateOpenWrapper = async function\(next, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "stateOpenWrapper must remain directly testable");

const events = [];
const context = {
  ensureSchema() { events.push("ensure"); }
};
const wrapper = vm.runInNewContext(
  `(async function(next, ...args) {${match[1]}\n})`,
  context
);

(async () => {
  const result = await wrapper(async id => {
    events.push("open-start:" + id);
    await Promise.resolve();
    events.push("open-finish:" + id);
    return { id };
  }, "autonomous-npc-world");

  assert.deepEqual(result, { id: "autonomous-npc-world" });
  assert.deepEqual(events, [
    "ensure",
    "open-start:autonomous-npc-world",
    "open-finish:autonomous-npc-world",
    "ensure"
  ], "post-load schema repair must wait for async openCharacter completion");

  events.length = 0;
  await assert.rejects(
    wrapper(async () => {
      events.push("open-start:broken");
      await Promise.resolve();
      throw new Error("load failed");
    }, "broken"),
    /load failed/
  );
  assert.deepEqual(events, [
    "ensure",
    "open-start:broken",
    "ensure"
  ], "failed loads must still run final schema repair without swallowing the error");

  console.log("state-tracker-open-character: async schema repair waits for character load");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
