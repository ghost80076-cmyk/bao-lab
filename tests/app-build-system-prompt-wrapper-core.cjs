const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapBuildSystemPrompt\(id, wrapper\)\{[\s\S]*?\n  \}),\n  async init\(\)\{/);
assert.ok(match, "wrapBuildSystemPrompt method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 9,
  buildSystemPrompt(label) {
    calls.push(["base", this.value, label]);
    return "BASE:" + label;
  },
  wrapBuildSystemPrompt: holder.wrapBuildSystemPrompt
};

assert.equal(app.wrapBuildSystemPrompt("first", function(next, label) {
  calls.push(["first-before", this.value, label]);
  const value = next(label);
  calls.push(["first-after", this.value, value]);
  return value + ":first";
}), true);

assert.equal(app.wrapBuildSystemPrompt("second", function(next, label) {
  calls.push(["second-before", this.value, label]);
  const value = next(label);
  calls.push(["second-after", this.value, value]);
  return value + ":second";
}), true);

assert.equal(app.wrapBuildSystemPrompt("first", () => "duplicate"), false);

const result = app.buildSystemPrompt("story");
assert.equal(result, "BASE:story:first:second");
assert.deepEqual(calls, [
  ["second-before", 9, "story"],
  ["first-before", 9, "story"],
  ["base", 9, "story"],
  ["first-after", 9, "BASE:story"],
  ["second-after", 9, "BASE:story:first"]
]);
assert.throws(() => app.wrapBuildSystemPrompt("", () => {}), /唯一識別碼/);
assert.throws(() => app.wrapBuildSystemPrompt("bad", null), /必須是函式/);

console.log("app-build-system-prompt-wrapper-core: order, return value and this-binding ok");
