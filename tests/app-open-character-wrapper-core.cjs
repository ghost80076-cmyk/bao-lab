const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const match = source.match(/(wrapOpenCharacter\(id, wrapper\)\{[\s\S]*?\n  \}),\n  wrapBuildSystemPrompt\(/);
assert.ok(match, "wrapOpenCharacter method must remain directly testable on App");

const holder = vm.runInNewContext(`({ ${match[1]} })`);
const calls = [];
const app = {
  value: 13,
  async openCharacter(id) {
    calls.push(["base-start", this.value, id]);
    await Promise.resolve();
    calls.push(["base-finish", this.value, id]);
    return { id };
  },
  wrapOpenCharacter: holder.wrapOpenCharacter
};

assert.equal(app.wrapOpenCharacter("first", async function(next, id) {
  calls.push(["first-before", this.value, id]);
  const result = await next(id);
  calls.push(["first-after", this.value, result.id]);
  return result;
}), true);

assert.equal(app.wrapOpenCharacter("second", async function(next, id) {
  calls.push(["second-before", this.value, id]);
  const result = await next(id);
  calls.push(["second-after", this.value, result.id]);
  return result;
}), true);

assert.equal(app.wrapOpenCharacter("first", async () => null), false);

(async () => {
  const result = await app.openCharacter("hero");
  assert.deepEqual(result, { id: "hero" });
  assert.deepEqual(calls, [
    ["second-before", 13, "hero"],
    ["first-before", 13, "hero"],
    ["base-start", 13, "hero"],
    ["base-finish", 13, "hero"],
    ["first-after", 13, "hero"],
    ["second-after", 13, "hero"]
  ]);
  assert.throws(() => app.wrapOpenCharacter("", () => {}), /唯一識別碼/);
  assert.throws(() => app.wrapOpenCharacter("bad", null), /必須是函式/);
  console.log("app-open-character-wrapper-core: async order, return and this-binding ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
