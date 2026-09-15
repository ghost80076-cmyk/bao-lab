const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let received = null;
global.window = global;
global.App = {
  config: {
    api: { model: "main-model", baseUrl: "https://main.example/v1", key: "MAIN-KEY" },
    memory: { summaryApi: { model: "memory-model", baseUrl: "https://memory.example/v1", key: "MEMORY-KEY" } },
    cost: { stateApi: { model: "state-model", baseUrl: "https://state.example/v1", key: "STATE-KEY" } }
  }
};
global.API = {
  async send(config, messages) {
    received = { config, messages };
    return { text: "OK" };
  }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "helper-api-routing.js"), "utf8");
vm.runInThisContext(source, { filename: "js/helper-api-routing.js" });

(async () => {
  await API.send({ ...App.config.api, __memoryTask: true }, [{ role: "user", content: "summary" }]);
  assert.equal(received.config.model, "memory-model", "memory tasks must use the configured memory route");

  await API.send({ ...App.config.api, __stateTask: true }, [{ role: "user", content: "state" }]);
  assert.equal(received.config.model, "state-model", "state tasks must use the configured state route");

  await API.send({ ...App.config.api, __memoryTask: true, __connectionTest: true }, [{ role: "user", content: "diagnostic" }]);
  assert.equal(received.config.model, "main-model", "a main connection diagnostic must never be redirected to the memory route");
  assert.equal(received.config.__connectionTest, true);

  console.log("helper API diagnostics core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
