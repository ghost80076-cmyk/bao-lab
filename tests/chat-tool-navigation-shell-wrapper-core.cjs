const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "chat-tool-navigation.js"), "utf8");
const match = source.match(/const toolNavigationShellWrapper = function\(next, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "toolNavigationShellWrapper must remain directly testable");

const calls = [];
const context = {
  watchSidebar() { calls.push("watch"); },
  schedule() { calls.push("schedule"); }
};
const wrapper = vm.runInNewContext(
  `(function(next, ...args) {${match[1]}\n})`,
  context
);

const result = wrapper(
  (...args) => {
    calls.push(["shell", ...args]);
    return { args };
  },
  true,
  "extra"
);

assert.deepEqual(result, { args: [true, "extra"] });
assert.deepEqual(calls, [
  ["shell", true, "extra"],
  "watch",
  "schedule"
]);

console.log("chat-tool-navigation-shell-wrapper: sidebar watch and sync follow shell rendering");
