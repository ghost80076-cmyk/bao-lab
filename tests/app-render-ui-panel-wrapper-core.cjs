const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapRenderUIPanel\(id, wrapper\)\{[\s\S]*?\n  \}),\n  wrapBuildSystemPrompt\(/);
assert.ok(match, "wrapRenderUIPanel method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 5,
  renderUIPanel(panel, extra) {
    calls.push(["base", this.value, panel, extra]);
    return `panel:${panel}:${extra}`;
  },
  wrapRenderUIPanel: holder.wrapRenderUIPanel
};

assert.equal(app.wrapRenderUIPanel("first", function(next, panel, extra) {
  calls.push(["first-before", this.value, panel]);
  const result = next(panel, extra);
  calls.push(["first-after", this.value, result]);
  return result + ":first";
}), true);

assert.equal(app.wrapRenderUIPanel("second", function(next, panel, extra) {
  calls.push(["second-before", this.value, panel]);
  const result = next(panel, extra);
  calls.push(["second-after", this.value, result]);
  return result + ":second";
}), true);

assert.equal(app.wrapRenderUIPanel("first", () => "duplicate"), false);
assert.equal(app.renderUIPanel("npc", "x"), "panel:npc:x:first:second");
assert.deepEqual(calls, [
  ["second-before", 5, "npc"],
  ["first-before", 5, "npc"],
  ["base", 5, "npc", "x"],
  ["first-after", 5, "panel:npc:x"],
  ["second-after", 5, "panel:npc:x:first"]
]);
assert.throws(() => app.wrapRenderUIPanel("", () => {}), /唯一識別碼/);
assert.throws(() => app.wrapRenderUIPanel("bad", null), /必須是函式/);

console.log("app-render-ui-panel-wrapper-core: order, return value and this-binding ok");
