const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "story-tools.js"), "utf8");
const match = source.match(/const storyToolsShellWrapper = function\(next, fresh = false\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "storyToolsShellWrapper must remain directly testable");

const calls = [];
const context = {
  inject() { calls.push(["inject"]); },
  setTimeout(callback, delay) {
    calls.push(["schedule", delay]);
    callback();
    return 1;
  }
};
const wrapper = vm.runInNewContext(
  `(function(next, fresh = false) {${match[1]}\n})`,
  context
);

const result = wrapper(
  fresh => {
    calls.push(["shell", fresh]);
    return "base-return";
  },
  true
);

// Preserve the old story-tools wrapper semantics: it did not return the base result.
assert.equal(result, undefined);
assert.deepEqual(calls, [
  ["shell", true],
  ["schedule", 0],
  ["inject"]
]);

calls.length = 0;
wrapper(
  fresh => { calls.push(["shell", fresh]); },
);
assert.deepEqual(calls, [
  ["shell", false],
  ["schedule", 0],
  ["inject"]
]);

console.log("story-tools-shell-wrapper: shell renders before deferred tool injection");
