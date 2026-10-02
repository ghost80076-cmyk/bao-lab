const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "story-control-center.js"), "utf8");
const match = source.match(/const storyControlShellWrapper = function\(next, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "storyControlShellWrapper must remain directly testable");

const calls = [];
const context = {
  window: {
    setTimeout(callback, delay) {
      calls.push(["schedule", delay]);
      callback();
      return 1;
    }
  },
  injectEntry() { calls.push(["inject"]); }
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
  false,
  "extra"
);

assert.deepEqual(result, { args: [false, "extra"] });
assert.deepEqual(calls, [
  ["shell", false, "extra"],
  ["schedule", 0],
  ["inject"]
]);

console.log("story-control-shell-wrapper: overview entry is deferred until after shell rendering");
