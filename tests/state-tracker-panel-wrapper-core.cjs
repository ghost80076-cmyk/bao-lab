const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "state-tracker-repairs.js"), "utf8");
const match = source.match(/const statePanelWrapper = function\(next, panel\) \{([\s\S]*?)\n  \};/);
assert.ok(match, "statePanelWrapper must remain directly testable");

let decorateCalls = 0;
let appended = [];
let existingTracker = false;
const ui = {
  querySelector(selector) {
    if (selector === "[data-world-state-tracker]") return existingTracker ? {} : null;
    return null;
  },
  appendChild(node) { appended.push(node); }
};
const context = {
  decorateNPCPresence() { decorateCalls += 1; },
  GameState: { current: { stateTracker: { phase: "failed", message: "quota" } } },
  document: {
    getElementById(id) { return id === "ui-panel" ? ui : null; },
    createElement(tag) {
      assert.equal(tag, "p");
      return {
        dataset: {},
        className: "",
        textContent: "",
        attrs: {},
        setAttribute(name, value) { this.attrs[name] = value; }
      };
    }
  }
};
const wrapper = vm.runInNewContext(
  `(function(next, panel) {${match[1]}\n})`,
  context
);

let baseCalls = [];
const next = panel => {
  baseCalls.push(panel);
  return "base:" + panel;
};

let result = wrapper(next, "npc");
assert.equal(result, "base:npc");
assert.deepEqual(baseCalls, ["npc"]);
assert.equal(decorateCalls, 1);
assert.equal(appended.length, 0);

baseCalls = [];
result = wrapper(next, "status");
assert.equal(result, "base:status");
assert.deepEqual(baseCalls, ["status"]);
assert.equal(appended.length, 1);
assert.equal(appended[0].dataset.worldStateTracker, "true");
assert.equal(appended[0].className, "note");
assert.equal(appended[0].attrs.role, "status");
assert.match(appended[0].textContent, /狀態模型：更新失敗。quota/);

existingTracker = true;
result = wrapper(next, "status");
assert.equal(result, "base:status");
assert.equal(appended.length, 1, "existing tracker note must not be duplicated");

result = wrapper(next, "events");
assert.equal(result, "base:events");
assert.equal(decorateCalls, 1);
assert.equal(appended.length, 1);

context.GameState.current = { stateTracker: null };
existingTracker = false;
appended = [];
result = wrapper(next, "status");
assert.equal(result, "base:status");
assert.equal(appended.length, 1);
assert.match(appended[0].textContent, /尚未完成第一次整理/);

console.log("state-tracker-panel-wrapper: NPC/status decoration remains isolated");
