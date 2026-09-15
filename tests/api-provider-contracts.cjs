const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.BAOPromptCache = { storySessionId: () => "bao-lab:test:stable-session" };
let requests = [];
let responseData = {};
global.fetch = async (url, options) => {
  requests.push({ url, options, body: JSON.parse(options.body) });
  return { ok: true, status: 200, async text() { return JSON.stringify(responseData); } };
};

const source = fs.readFileSync(path.join(__dirname, "..", "js", "api.js"), "utf8");
vm.runInThisContext(`${source}\nglobalThis.__API = API;`, { filename: "js/api.js" });
const API = global.__API;
const messages = [
  { role: "system", content: "固定平台規則與角色設定" },
  { role: "system", content: "長期記憶" },
  { role: "user", content: "玩家輸入" }
];
const lastRequest = () => requests.at(-1);

(async () => {
  const providerSend = API.send.bind(API);
  let diagnosticConfig = null;
  API.send = async (config, diagnosticMessages) => {
    diagnosticConfig = config;
    assert.deepEqual(diagnosticMessages.map(message => message.role), ["system", "user"]);
    return { text: "OK", usage: { total_tokens: 3 } };
  };
  await API.test({ type: "custom", model: "diagnostic-model", baseUrl: "https://example.test/v1/chat/completions", key: "DIAGNOSTIC-SECRET" });
  assert.equal(diagnosticConfig.__connectionTest, true, "connection checks must be identifiable by accounting and routing wrappers");
  assert.equal(diagnosticConfig.maxOutputTokens, 16, "connection checks must use a minimal output limit");
  API.send = providerSend;

  const unknown = API.normalizeUsage({ prompt_tokens: 120, completion_tokens: 30 }, "openai");
  assert.equal(unknown.input_tokens, 120);
  assert.equal(unknown.cached_tokens, null);
  assert.equal(unknown.new_input_tokens, null, "missing cache usage must remain unknown");
  const controller = new AbortController();
  API.activeSignal = controller.signal;
  const canceled = API.networkError({ name: "AbortError" });
  assert.equal(canceled.code, "BAO_ABORTED");
  assert.match(canceled.message, /玩家輸入已還原/);

  responseData = { choices: [{ message: { content: "OpenRouter OK" } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 60 } } };
  const openRouter = await API.send({ type: "openrouter", protocol: "openai", model: "anthropic/claude-sonnet", baseUrl: "https://openrouter.ai/api/v1/chat/completions", key: "OR-SECRET", cacheMode: "explicit", explicitCacheModel: "anthropic/claude-sonnet", cacheEnabled: true, maxOutputTokens: 500 }, messages);
  assert.equal(openRouter.usage.cached_tokens, 60);
  assert.equal(openRouter.usage.new_input_tokens, 40);
  assert.equal(lastRequest().body.session_id, "bao-lab:test:stable-session");
  assert.deepEqual(lastRequest().body.messages[0].content[0].cache_control, { type: "ephemeral" });
  assert.equal(JSON.stringify(lastRequest().body).includes("OR-SECRET"), false);
  assert.equal(lastRequest().options.signal, controller.signal, "OpenAI-compatible requests must accept the active generation signal");

  await API.send({ type: "openrouter", protocol: "openai", model: "different/model", baseUrl: "https://openrouter.ai/api/v1/chat/completions", key: "OR-SECRET", cacheMode: "explicit", explicitCacheModel: "anthropic/claude-sonnet", cacheEnabled: true }, messages);
  assert.equal(typeof lastRequest().body.messages[0].content, "string", "stale explicit-cache verification must not follow a changed Model ID");

  await API.send({ type: "openrouter", protocol: "openai", model: "qwen/test", baseUrl: "https://openrouter.ai/api/v1/chat/completions", key: "OR-SECRET", cacheMode: "provider-dependent", cacheEnabled: true }, messages);
  assert.equal(typeof lastRequest().body.messages[0].content, "string", "unverified OpenRouter models must not receive cache_control");

  await API.send({ type: "custom", protocol: "openai", model: "custom-model", baseUrl: "https://gateway.example/v1/chat/completions", key: "CUSTOM-SECRET", cacheMode: "explicit", cacheEnabled: true }, messages);
  assert.equal(lastRequest().body.session_id, undefined);
  assert.equal(typeof lastRequest().body.messages[0].content, "string", "custom providers must not inherit explicit caching assumptions");

  responseData = { candidates: [{ content: { parts: [{ text: "Gemini OK" }] } }], usageMetadata: { promptTokenCount: 200, cachedContentTokenCount: 125, candidatesTokenCount: 25, totalTokenCount: 225 } };
  const gemini = await API.send({ type: "gemini", protocol: "gemini", model: "gemini-test", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", key: "GEMINI-SECRET", cacheMode: "supported", cacheEnabled: true }, messages);
  assert.equal(gemini.usage.cached_tokens, 125);
  assert.equal(gemini.usage.new_input_tokens, 75);
  assert.equal(lastRequest().body.cachedContent, undefined);
  assert.equal(JSON.stringify(lastRequest().body).includes("cache_control"), false, "Gemini direct requests must rely on implicit caching");
  assert.equal(lastRequest().options.headers["x-goog-api-key"], "GEMINI-SECRET");
  assert.equal(JSON.stringify(lastRequest().body).includes("GEMINI-SECRET"), false);
  assert.equal(lastRequest().options.signal, controller.signal, "Gemini requests must accept the active generation signal");

  responseData = { content: [{ type: "text", text: "Claude OK" }], usage: { input_tokens: 40, cache_read_input_tokens: 100, cache_creation_input_tokens: 20, output_tokens: 15 } };
  const anthropic = await API.send({ type: "anthropic", protocol: "anthropic", route: "official", model: "claude-test", baseUrl: "https://api.anthropic.com/v1/messages", key: "CLAUDE-SECRET", cacheMode: "explicit", explicitCacheModel: "claude-test", cacheEnabled: true }, messages);
  assert.equal(anthropic.usage.input_tokens, 160);
  assert.equal(anthropic.usage.cached_tokens, 100);
  assert.equal(anthropic.usage.cache_write_tokens, 20);
  assert.equal(anthropic.usage.new_input_tokens, 60);
  assert.deepEqual(lastRequest().body.system[0].cache_control, { type: "ephemeral" });
  assert.equal(JSON.stringify(lastRequest().body).includes("CLAUDE-SECRET"), false);
  assert.equal(lastRequest().options.signal, controller.signal, "Anthropic requests must accept the active generation signal");

  await API.send({ type: "custom", protocol: "anthropic", route: "custom", model: "claude-proxy", baseUrl: "https://proxy.example/messages", key: "PROXY-SECRET", cacheMode: "explicit", cacheEnabled: true }, messages);
  assert.equal(typeof lastRequest().body.system, "string", "custom Anthropic-compatible services must not receive cache_control by assumption");
  API.activeSignal = null;

  console.log("API provider contracts test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
