const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapShowView\(id, wrapper\)\{[\s\S]*?\n  \}),\n  wrapBuildSystemPrompt\(/);
assert.ok(match, "wrapShowView method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 17,
  showView(view, extra) {
    calls.push(["base", this.value, view, extra]);
    return `view:${view}:${extra}`;
  },
  wrapShowView: holder.wrapShowView
};

assert.equal(app.wrapShowView("first", function(next, view, extra) {
  calls.push(["first-before", this.value, view]);
  const result = next(view, extra);
  calls.push(["first-after", this.value, result]);
  return result + ":first";
}), true);

assert.equal(app.wrapShowView("second", function(next, view, extra) {
  calls.push(["second-before", this.value, view]);
  const result = next(view, extra);
  calls.push(["second-after", this.value, result]);
  return result + ":second";
}), true);

assert.equal(app.wrapShowView("first", () => "duplicate"), false);
assert.equal(app.showView("chat", "x"), "view:chat:x:first:second");
assert.deepEqual(calls, [
  ["second-before", 17, "chat"],
  ["first-before", 17, "chat"],
  ["base", 17, "chat", "x"],
  ["first-after", 17, "view:chat:x"],
  ["second-after", 17, "view:chat:x:first"]
]);
assert.throws(() => app.wrapShowView("", () => {}), /唯一識別碼/);
assert.throws(() => app.wrapShowView("bad", null), /必須是函式/);

console.log("app-show-view-wrapper-core: order, return value and this-binding ok");
