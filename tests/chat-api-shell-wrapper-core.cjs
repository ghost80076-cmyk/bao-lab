const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "chat-api-settings.js"), "utf8");
const match = source.match(/const chatApiShellWrapper = function\(next, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "chatApiShellWrapper must remain directly testable");

const calls = [];
const context = {
  installEntries() { calls.push(["install"]); }
};
const wrapper = vm.runInNewContext(
  `(function(next, ...args) {${match[1]}\n})`,
  context
);

const result = wrapper(
  (...args) => {
    calls.push(["shell", ...args]);
    return { rendered: true, args };
  },
  false,
  "extra"
);

assert.deepEqual(result, { rendered: true, args: [false, "extra"] });
assert.deepEqual(calls, [
  ["shell", false, "extra"],
  ["install"]
]);

console.log("chat-api-shell-wrapper: shell renders before connection entries refresh");
