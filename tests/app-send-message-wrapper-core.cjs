const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapSendMessage\(id, wrapper\)\{[\s\S]*?\n  \}),\n  async init\(\)\{/);
assert.ok(match, "wrapSendMessage method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 7,
  async sendMessage(arg) {
    calls.push(["base", this.value, arg]);
    return `base:${arg}`;
  },
  wrapSendMessage: holder.wrapSendMessage
};

assert.equal(app.wrapSendMessage("first", async function(next, arg) {
  calls.push(["first-before", this.value, arg]);
  const result = await next(arg + "-1");
  calls.push(["first-after", this.value, result]);
  return result + ":first";
}), true);

assert.equal(app.wrapSendMessage("second", async function(next, arg) {
  calls.push(["second-before", this.value, arg]);
  const result = await next(arg + "-2");
  calls.push(["second-after", this.value, result]);
  return result + ":second";
}), true);

assert.equal(app.wrapSendMessage("first", async () => "duplicate"), false, "duplicate wrapper IDs must be ignored");

(async () => {
  const result = await app.sendMessage("x");
  assert.equal(result, "base:x-2-1:first:second");
  assert.deepEqual(calls, [
    ["second-before", 7, "x"],
    ["first-before", 7, "x-2"],
    ["base", 7, "x-2-1"],
    ["first-after", 7, "base:x-2-1"],
    ["second-after", 7, "base:x-2-1:first"]
  ]);
  assert.throws(() => app.wrapSendMessage("", () => {}), /唯一識別碼/);
  assert.throws(() => app.wrapSendMessage("bad", null), /必須是函式/);
  console.log("app-send-message-wrapper-core: registration, order and this-binding ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
