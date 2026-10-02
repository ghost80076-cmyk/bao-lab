const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapBuildMessages\(id, wrapper\)\{[\s\S]*?\n  \}),\n  async init\(\)\{/);
assert.ok(match, "wrapBuildMessages method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 11,
  async buildMessages(config) {
    calls.push(["base", this.value, config.id]);
    return [{ role: "system", content: "BASE:" + config.id }];
  },
  wrapBuildMessages: holder.wrapBuildMessages
};

assert.equal(app.wrapBuildMessages("first", async function(next, config) {
  calls.push(["first-before", this.value, config.id]);
  const result = await next(config);
  calls.push(["first-after", this.value, result[0].content]);
  return [...result, { role: "user", content: "first" }];
}), true);

assert.equal(app.wrapBuildMessages("second", async function(next, config) {
  calls.push(["second-before", this.value, config.id]);
  const result = await next(config);
  calls.push(["second-after", this.value, result.length]);
  return [...result, { role: "user", content: "second" }];
}), true);

assert.equal(app.wrapBuildMessages("first", async () => []), false);

(async () => {
  const result = await app.buildMessages({ id: "story" });
  assert.deepEqual(result, [
    { role: "system", content: "BASE:story" },
    { role: "user", content: "first" },
    { role: "user", content: "second" }
  ]);
  assert.deepEqual(calls, [
    ["second-before", 11, "story"],
    ["first-before", 11, "story"],
    ["base", 11, "story"],
    ["first-after", 11, "BASE:story"],
    ["second-after", 11, 2]
  ]);
  assert.throws(() => app.wrapBuildMessages("", () => {}), /唯一識別碼/);
  assert.throws(() => app.wrapBuildMessages("bad", null), /必須是函式/);
  console.log("app-build-messages-wrapper-core: order, async return and this-binding ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
