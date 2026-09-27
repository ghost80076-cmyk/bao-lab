const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
vm.runInThisContext(`${fs.readFileSync(path.join(__dirname, "..", "js", "api.js"), "utf8")}\nglobalThis.__API = API;`, { filename: "js/api.js" });
const API = global.__API;
API.waitForRetry = async () => {};

const messages = [{ role: "user", content: "hello" }];
const base = { type: "custom", protocol: "openai", model: "test-model", baseUrl: "https://example.test/v1/chat/completions", key: "TEST-ONLY" };
const response = (status, body = {}, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: name => headers[String(name).toLowerCase()] || null },
  body: { async cancel() {} },
  async text() { return JSON.stringify(body); }
});
const okOpenAI = text => response(200, { choices: [{ message: { content: text } }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } });

(async () => {
  {
    const seen = [];
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return response(503, { error: { message: "temporary" } });
      if (calls === 2) return response(429, { error: { message: "rate limit" } }, { "retry-after": "0" });
      return okOpenAI("recovered");
    };
    const result = await API.send({ ...base, onRetry: event => seen.push(event) }, messages);
    assert.equal(result.text, "recovered");
    assert.equal(calls, 3, "default policy must allow at most two transient retries");
    assert.deepEqual(seen.map(item => [item.reason, item.status || null]), [["http", 503], ["http", 429]]);
  }

  {
    for (const status of [408, 500, 502, 504]) {
      let calls = 0;
      global.fetch = async () => (++calls === 1 ? response(status, { error: { message: "temporary" } }) : okOpenAI(String(status)));
      const result = await API.send(base, messages);
      assert.equal(result.text, String(status));
      assert.equal(calls, 2, `HTTP ${status} must retry`);
    }
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("Failed to fetch");
      return okOpenAI("network recovered");
    };
    const result = await API.send(base, messages);
    assert.equal(result.text, "network recovered");
    assert.equal(calls, 2, "browser-style transient network failures must retry");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      throw new Error("local programming failure");
    };
    await assert.rejects(API.send(base, messages), /無法連線到 API/);
    assert.equal(calls, 1, "unknown errors must not be retried as transient network failures");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    };
    await assert.rejects(API.send(base, messages), error => error.code === "BAO_ABORTED");
    assert.equal(calls, 1, "player cancellation must never retry");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(503, { error: { message: "still unavailable" } });
    };
    await assert.rejects(API.send(base, messages), /503/);
    assert.equal(calls, 3, "retry budget must stop after two retries");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(503, { error: { message: "wallet endpoint unavailable" } });
    };
    await assert.rejects(API.send({ ...base, type: "bao-credits", route: "bao-credits" }, messages), /503/);
    assert.equal(calls, 1, "charge-sensitive Hosted requests must not browser-retry without idempotency");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      return response(503, { error: { message: "disabled" } });
    };
    await assert.rejects(API.send({ ...base, retryEnabled: false }, messages), /503/);
    assert.equal(calls, 1, "callers must be able to disable retry explicitly");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return response(503, { error: { message: "temporary" } });
      return response(200, { content: [{ type: "text", text: "anthropic recovered" }], usage: { input_tokens: 2, output_tokens: 1 } });
    };
    const result = await API.send({ type: "anthropic", protocol: "anthropic", route: "official", model: "claude-test", baseUrl: "https://example.test/v1/messages", key: "TEST-ONLY" }, messages);
    assert.equal(result.text, "anthropic recovered");
    assert.equal(calls, 2, "Anthropic transport must use the shared retry policy");
  }

  {
    let calls = 0;
    global.fetch = async () => {
      calls += 1;
      if (calls === 1) return response(503, { error: { message: "temporary" } });
      return response(200, { candidates: [{ content: { parts: [{ text: "gemini recovered" }] } }], usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1, totalTokenCount: 3 } });
    };
    const result = await API.send({ type: "gemini", protocol: "gemini", model: "gemini-test", baseUrl: "https://example.test/v1beta/models", key: "TEST-ONLY" }, messages);
    assert.equal(result.text, "gemini recovered");
    assert.equal(calls, 2, "Gemini transport must use the shared retry policy");
  }

  console.log("bounded API retry contracts test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
