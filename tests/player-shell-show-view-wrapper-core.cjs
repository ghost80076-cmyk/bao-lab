const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "player-shell-v2.js"), "utf8");
const match = source.match(/const playerShellViewWrapper = function\(next, view, \.\.\.args\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "playerShellViewWrapper must remain directly testable");

const calls = [];
const context = {
  dismissNavigationSurfaces() { calls.push("dismiss"); },
  refreshMeView() { calls.push("refresh-me"); },
  decorateDetail() { calls.push("decorate-detail"); },
  syncNavigation(view) { calls.push("sync-nav:" + view); },
  requestAnimationFrame(callback) {
    calls.push("raf");
    callback();
    return 1;
  },
  window: {
    BAOMobileReadingLayout: {
      sync() { calls.push("mobile-sync"); }
    }
  }
};
const wrapper = vm.runInNewContext(
  `(function(next, view, ...args) {${match[1]}\n})`,
  context
);

let result = wrapper(
  (view, ...args) => {
    calls.push(["view", view, ...args]);
    return "me-result";
  },
  "me",
  "extra"
);
assert.equal(result, "me-result");
assert.deepEqual(calls, [
  "dismiss",
  ["view", "me", "extra"],
  "refresh-me",
  "sync-nav:me",
  "raf",
  "mobile-sync"
]);

calls.length = 0;
result = wrapper(
  view => {
    calls.push(["view", view]);
    return "detail-result";
  },
  "detail"
);
assert.equal(result, "detail-result");
assert.deepEqual(calls, [
  "dismiss",
  ["view", "detail"],
  "raf",
  "decorate-detail",
  "sync-nav:detail",
  "raf",
  "mobile-sync"
]);

calls.length = 0;
result = wrapper(
  view => {
    calls.push(["view", view]);
    return "chat-result";
  },
  "chat"
);
assert.equal(result, "chat-result");
assert.deepEqual(calls, [
  "dismiss",
  ["view", "chat"],
  "sync-nav:chat"
], "chat view must not trigger non-chat mobile reading sync");

console.log("player-shell-show-view-wrapper: navigation side effects preserve view-specific order");
