const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "api.js"), "utf8");
const sandbox = {
  console,
  URL,
  setTimeout,
  clearTimeout,
  TextDecoder,
  fetch: async () => { throw new Error("fetch should not run in wrapper contract test"); }
};
vm.createContext(sandbox);
vm.runInContext(source + "\n;globalThis.__API = API;", sandbox, { filename: "js/api.js" });
const API = sandbox.__API;

const calls = [];
API.send = async (config, messages, ...rest) => {
  calls.push(["base", config.step, messages.length, rest[0]]);
  return { trace: ["base"], config };
};

assert.equal(API.wrapSend("first", async (next, config, messages, ...rest) => {
  calls.push(["first-before", config.step]);
  const result = await next({ ...config, first: true }, messages, ...rest);
  result.trace.push("first");
  return result;
}), true);

assert.equal(API.wrapSend("second", async (next, config, messages, ...rest) => {
  calls.push(["second-before", config.step]);
  const result = await next({ ...config, second: true }, messages, ...rest);
  result.trace.push("second");
  return result;
}), true);

assert.equal(API.wrapSend("first", async () => ({ trace: ["duplicate"] })), false, "duplicate wrapper IDs must be ignored");

(async () => {
  const result = await API.send({ step: 1 }, [{ role: "user", content: "hello" }], "extra");
  assert.deepEqual(Array.from(result.trace), ["base", "first", "second"]);
  assert.equal(result.config.first, true);
  assert.equal(result.config.second, true);
  assert.deepEqual(calls, [
    ["second-before", 1],
    ["first-before", 1],
    ["base", 1, 1, "extra"]
  ]);

  assert.throws(() => API.wrapSend("", () => {}), /唯一識別碼/);
  assert.throws(() => API.wrapSend("bad", null), /必須是函式/);

  console.log("api-send-wrapper-core: registration, order and duplicate guard ok");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
