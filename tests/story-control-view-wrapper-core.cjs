const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "story-control-center.js"), "utf8");
const match = source.match(/const storyControlViewWrapper = function\(next, view, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "storyControlViewWrapper must remain directly testable");

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
  `(function(next, view, ...args) {${match[1]}\n})`,
  context
);

let result = wrapper(
  (view, ...args) => {
    calls.push(["view", view, ...args]);
    return { view, args };
  },
  "chat",
  "extra"
);
assert.deepEqual(result, { view: "chat", args: ["extra"] });
assert.deepEqual(calls, [
  ["view", "chat", "extra"],
  ["schedule", 0],
  ["inject"]
]);

calls.length = 0;
result = wrapper(
  (view, ...args) => {
    calls.push(["view", view, ...args]);
    return "home-result";
  },
  "home"
);
assert.equal(result, "home-result");
assert.deepEqual(calls, [["view", "home"]], "non-chat views must not schedule story-control injection");

console.log("story-control-view-wrapper: only chat view schedules overview entry");
