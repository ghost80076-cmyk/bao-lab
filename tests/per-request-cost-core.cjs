const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.document = {
  readyState: "loading",
  addEventListener() {},
  getElementById() { return null; },
  querySelector() { return null; }
};
let domReadyHandler = null;
global.addEventListener = (event, handler) => {
  if (event === "DOMContentLoaded") domReadyHandler = handler;
};
global.setTimeout = handler => {
  if (typeof handler === "function") handler();
  return 0;
};
global.API = {
  send: async () => ({}),
  __sendWrapperIds: new Set(),
  wrapSend(id, wrapper) {
    if (this.__sendWrapperIds.has(id)) return false;
    const next = this.send.bind(this);
    this.send = (config, messages, ...rest) => wrapper(next, config, messages, ...rest);
    this.__sendWrapperIds.add(id);
    return true;
  }
};
global.Chat = {
  usage: { prompt: 0, completion: 0, cached: 0, total: 0 },
  usageLedger: [
    { kind: "chat", model: "gemini-wallet", baseUrl: "https://wallet.example/chat", input: 10000, output: 1000, cached: 0, actualUsd: 0.01 },
    { kind: "memory", model: "qwen-memory", baseUrl: "https://qwen.example/chat", input: 1000000, output: 0, cached: 0, actualUsd: null },
    { kind: "state", model: "unknown-helper", baseUrl: "https://unknown.example/chat", input: 5000, output: 500, cached: 0, actualUsd: null },
    { kind: "chat", model: "custom-main", baseUrl: "https://main.example/chat", input: 1000, output: 100, cached: 0, actualUsd: null }
  ],
  addUsage() {},
  renderUsage() {}
};
global.App = {
  config: {
    api: { model: "custom-main", baseUrl: "https://main.example/chat" },
    cost: { inputPerMillion: 2, outputPerMillion: 12, cachePerMillion: 0.2, usdTwd: 32, budgetTwd: 0 }
  },
  modelPresets: [
    { model: "qwen-memory", base_url: "https://qwen.example/chat", pricing: { input: 0.03, output: 0.13, cache: 0.006 } }
  ],
  collectConfig() { return { api: {}, cost: {} }; }
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "cost-control.js"), "utf8");
vm.runInThisContext(source, { filename: "js/cost-control.js" });
domReadyHandler?.();

assert.equal(API.__sendWrapperIds.has("cost-control:budget"), true, "cost-control must install through API.wrapSend");

const result = BAOCostControl.cumulativeCost();
assert.equal(result.actualCalls, 1, "YoruBay-like backend charge should be counted as actual");
assert.equal(result.actualUsd, 0.01);
assert.equal(result.estimatedCalls, 2, "known helper preset and custom main should be estimated independently");
assert.equal(result.unpricedCalls, 1, "unknown helper rate must stay unpriced instead of inheriting main-model pricing");
assert.ok(Math.abs(result.estimatedUsd - 0.0332) < 1e-12);
assert.ok(Math.abs(result.usd - 0.0432) < 1e-12);
assert.ok(Math.abs(result.twd - 1.3824) < 1e-12);

console.log("per-request cost accounting core test passed");
