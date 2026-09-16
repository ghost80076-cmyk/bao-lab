const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class MemoryStorage {
  constructor() { this.data = new Map(); }
  get length() { return this.data.size; }
  key(index) { return [...this.data.keys()][index] ?? null; }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(String(key), String(value)); }
  removeItem(key) { this.data.delete(String(key)); }
}

global.window = global;
global.localStorage = new MemoryStorage();
global.sessionStorage = new MemoryStorage();
global.GameState = { current: null };
global.Storage = { buildStoryPayload: () => ({ config: { api: { key: "" } } }) };
global.document = {
  readyState: "complete",
  querySelector() { return null; },
  getElementById() { return null; },
  createElement() { return { style: {}, dataset: {}, appendChild() {}, addEventListener() {}, querySelector() { return null; } }; },
  head: { appendChild() {} }
};
global.App = {
  activeCharacter: null,
  collectConfig: () => ({ api: {} }),
  getSelectedPreset: () => null,
  escapeHTML: value => String(value ?? "")
};

global.fetch = async () => ({
  ok: true,
  status: 200,
  async text() { return JSON.stringify({ content: [{ type: "text", text: "OK" }], usage: { input_tokens: 3, output_tokens: 1 } }); }
});

const load = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { filename: file });
load("js/api.js");
vm.runInThisContext("globalThis.__BAO_API = API;", { filename: "api-export.js" });
const APIRef = global.__BAO_API;
load("js/provider-browser-compat.js");
load("js/provider-diagnostics.js");

(async () => {
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 200,
      async text() { return JSON.stringify({ content: [{ type: "text", text: "Claude OK" }], usage: { input_tokens: 3, output_tokens: 1 } }); }
    };
  };
  const messages = [{ role: "system", content: "Reply OK" }, { role: "user", content: "OK?" }];
  await APIRef.send({ type: "anthropic", protocol: "anthropic", route: "official", model: "claude-test", baseUrl: "https://api.anthropic.com/v1/messages", key: "CLAUDE-SECRET" }, messages);
  assert.equal(requests.at(-1).options.headers["anthropic-dangerous-direct-browser-access"], "true", "official Anthropic browser calls require the explicit direct-browser header");
  assert.equal(JSON.stringify(requests.at(-1).body).includes("CLAUDE-SECRET"), false, "Anthropic key must stay in headers only");

  await APIRef.send({ type: "custom", protocol: "anthropic", route: "custom", model: "proxy-test", baseUrl: "https://proxy.example/messages", key: "PROXY-SECRET" }, messages);
  assert.equal(requests.at(-1).options.headers["anthropic-dangerous-direct-browser-access"], undefined, "custom Anthropic-compatible gateways must not inherit Anthropic's browser-only header");

  const originalTest = APIRef.test.bind(APIRef);
  const calls = [];
  APIRef.test = async config => {
    calls.push({ stream: config.stream === true, key: config.key });
    if (config.stream && typeof config.onDelta === "function") {
      config.onDelta("O", "O");
      config.onDelta("K", "OK");
    }
    return { text: "OK", usage: { total_tokens: config.stream ? 5 : 4 } };
  };
  const result = await BAOProviderDiagnostics.runConfig({ type: "openrouter", protocol: "openai", model: "test/model", baseUrl: "https://openrouter.ai/api/v1/chat/completions", key: "DIAG-SECRET" });
  assert.equal(result.ok, true);
  assert.equal(result.standard.ok, true);
  assert.equal(result.streaming.ok, true);
  assert.equal(result.streaming.mode, "sse");
  assert.equal(result.streaming.chunks, 2);
  assert.deepEqual(calls.map(call => call.stream), [false, true], "diagnostics must test buffered and streaming requests in order");
  assert.equal(JSON.stringify(result).includes("DIAG-SECRET"), false, "diagnostic results must never retain the API key");
  assert.equal(result.privacy.ok, true);

  APIRef.test = async () => { throw new Error("401 authentication failed for LEAK-ME-SECRET"); };
  const failed = await BAOProviderDiagnostics.runConfig({ type: "custom", protocol: "openai", model: "bad", baseUrl: "https://example.invalid/v1/chat/completions", key: "LEAK-ME-SECRET" });
  assert.equal(failed.ok, false);
  assert.equal(failed.standard.category, "key");
  assert.equal(JSON.stringify(failed).includes("LEAK-ME-SECRET"), false, "provider error text must redact the key before entering UI state");
  assert.match(failed.standard.error, /已遮蔽 API Key/);

  APIRef.test = originalTest;
  console.log("provider browser diagnostics core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
