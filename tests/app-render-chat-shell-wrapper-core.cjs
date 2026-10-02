const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapRenderChatShell\(id, wrapper\)\{[\s\S]*?\n  \}),\n  async init\(\)\{/);
assert.ok(match, "wrapRenderChatShell method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 3,
  renderChatShell(fresh, extra) {
    calls.push(["base", this.value, fresh, extra]);
    return `shell:${fresh}:${extra}`;
  },
  wrapRenderChatShell: holder.wrapRenderChatShell
};

assert.equal(app.wrapRenderChatShell("first", function(next, fresh, extra) {
  calls.push(["first-before", this.value, fresh, extra]);
  const result = next(fresh, extra);
  calls.push(["first-after", this.value, result]);
  return result + ":first";
}), true);

assert.equal(app.wrapRenderChatShell("second", function(next, fresh, extra) {
  calls.push(["second-before", this.value, fresh, extra]);
  const result = next(fresh, extra);
  calls.push(["second-after", this.value, result]);
  return result + ":second";
}), true);

assert.equal(app.wrapRenderChatShell("first", () => "duplicate"), false);

const result = app.renderChatShell(true, "x");
assert.equal(result, "shell:true:x:first:second");
assert.deepEqual(calls, [
  ["second-before", 3, true, "x"],
  ["first-before", 3, true, "x"],
  ["base", 3, true, "x"],
  ["first-after", 3, "shell:true:x"],
  ["second-after", 3, "shell:true:x:first"]
]);
assert.throws(() => app.wrapRenderChatShell("", () => {}), /唯一識別碼/);
assert.throws(() => app.wrapRenderChatShell("bad", null), /必須是函式/);

console.log("app-render-chat-shell-wrapper-core: order, return value and this-binding ok");
