const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "../workers/bao-lab-credits-api/worker.js"),
  "utf8"
);

assert.match(
  source,
  /const WorkerProviderTransport = \(\(\) => \{/,
  "provider network helpers must stay grouped behind WorkerProviderTransport"
);
for (const helper of [
  "geminiErrorHint",
  "anthropicPayload",
  "providerCall",
  "providerFailureResponse",
]) {
  assert.match(source, new RegExp("\\b" + helper + "\\b"), "WorkerProviderTransport is missing " + helper);
}

const instrumented =
  source.replace(
    /export\s+default\s+\{/,
    "const __workerDefault = {"
  ) +
  "\nreturn { providerCall, providerFailureResponse, anthropicPayload };";

const {
  providerCall,
  providerFailureResponse,
  anthropicPayload,
} = new Function(instrumented)();

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

(async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];

  try {
    globalThis.fetch = async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      requests.push({ url: String(url), init, body });

      if (String(url) === "https://openrouter.ai/api/v1/chat/completions") {
        if (body?.model === "openai/too-large") {
          return jsonResponse({ error: { message: "payload too large" } }, 413);
        }
        return jsonResponse({
          choices: [{ message: { content: "OpenRouter OK" } }],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            prompt_tokens_details: { cached_tokens: 30, cache_write_tokens: 5 },
            completion_tokens_details: { reasoning_tokens: 4 },
            cost: 0.000123,
          },
        });
      }

      if (String(url) === "https://relay.example/v1/chat") {
        if (body?.provider === "openrouter") {
          return jsonResponse({ error: "request_too_large" }, 413);
        }
        return jsonResponse({
          candidates: [{ content: { parts: [{ text: "Gemini OK" }] }, finishReason: "STOP" }],
          usageMetadata: {
            promptTokenCount: 120,
            cachedContentTokenCount: 40,
            candidatesTokenCount: 25,
            thoughtsTokenCount: 5,
            totalTokenCount: 150,
          },
        });
      }

      if (String(url) === "https://api.anthropic.com/v1/messages") {
        return jsonResponse({
          content: [{ type: "text", text: "Claude OK" }],
          usage: {
            input_tokens: 80,
            cache_creation_input_tokens: 10,
            cache_read_input_tokens: 20,
            output_tokens: 30,
          },
          stop_reason: "end_turn",
        });
      }

      throw new Error("Unexpected provider request: " + url);
    };

    const messages = [
      { role: "system", content: "system" },
      { role: "user", content: "hello" },
    ];

    const openRouter = await providerCall(
      {
        OPENROUTER_API_KEY: "or-secret",
        MODELS_JSON: JSON.stringify([{
          provider: "openrouter",
          model: "openai/test-model",
          input_microusd_per_million: 100000,
          output_microusd_per_million: 200000,
        }]),
      },
      "openrouter",
      "openai/test-model",
      messages,
      512,
      null,
      "story:session-1"
    );

    assert.equal(openRouter.ok, true);
    assert.equal(openRouter.text, "OpenRouter OK");
    assert.equal(openRouter.input, 100);
    assert.equal(openRouter.output, 20);
    assert.equal(openRouter.cached, 30);
    assert.equal(openRouter.cacheWrite, 5);
    assert.equal(openRouter.reasoning, 4);
    assert.equal(openRouter.providerCost, 0.000123);

    const orRequest = requests.find(item => item.url.includes("openrouter.ai"));
    assert.ok(orRequest);
    assert.equal(orRequest.init.headers.authorization, "Bearer or-secret");
    assert.equal(orRequest.body.model, "openai/test-model");
    assert.equal(orRequest.body.session_id, "story:session-1");
    assert.equal(orRequest.body.max_tokens, 512);
    assert.equal(orRequest.body.stream, false);
    assert.deepEqual(orRequest.body.usage, { include: true });
    assert.equal(orRequest.body.provider.max_price.prompt, 0.1);
    assert.equal(orRequest.body.provider.max_price.completion, 0.2);

    const directTooLarge = await providerCall(
      {
        OPENROUTER_API_KEY: "or-secret",
      },
      "openrouter",
      "openai/too-large",
      messages,
      512
    );

    assert.equal(directTooLarge.ok, false);
    assert.equal(directTooLarge.category, "provider_request_too_large");
    assert.equal(directTooLarge.upstreamStatus, 413);
    assert.equal(directTooLarge.route, "direct_openrouter");
    assert.ok(directTooLarge.requestBytes > 0);

    const directFailure = providerFailureResponse(
      directTooLarge,
      "req-direct-413"
    );
    const directFailureBody = await directFailure.json();
    assert.equal(directFailure.status, 502);
    assert.equal(directFailureBody.error, "provider_request_too_large");
    assert.equal(directFailureBody.route, "direct_openrouter");
    assert.equal(directFailureBody.upstream_http_status, 413);
    assert.equal(directFailureBody.request_bytes, directTooLarge.requestBytes);
    assert.equal(directFailureBody.request_id, "req-direct-413");

    const relayTooLarge = await providerCall(
      {
        AWS_RELAY_URL: "https://relay.example",
        BAO_INTERNAL_TOKEN: "relay-secret",
        AWS_OPENROUTER_PLAYERS: "P1",
      },
      "openrouter",
      "anthropic/claude-sonnet-4.6",
      messages,
      512,
      { id: "P1" },
      "story:session-413"
    );

    assert.equal(relayTooLarge.ok, false);
    assert.equal(relayTooLarge.category, "relay_request_too_large");
    assert.equal(relayTooLarge.upstreamStatus, 413);
    assert.equal(relayTooLarge.route, "aws_relay");
    assert.ok(relayTooLarge.requestBytes > 0);

    const relayFailure = providerFailureResponse(
      relayTooLarge,
      "req-relay-413"
    );
    const relayFailureBody = await relayFailure.json();
    assert.equal(relayFailure.status, 502);
    assert.equal(relayFailureBody.error, "relay_request_too_large");
    assert.equal(relayFailureBody.route, "aws_relay");
    assert.equal(relayFailureBody.upstream_http_status, 413);
    assert.equal(relayFailureBody.request_bytes, relayTooLarge.requestBytes);
    assert.equal(relayFailureBody.request_id, "req-relay-413");

    const gemini = await providerCall(
      {
        AWS_RELAY_URL: "https://relay.example",
        BAO_INTERNAL_TOKEN: "relay-secret",
        MODELS_JSON: JSON.stringify([{
          provider: "gemini",
          model: "gemini-test",
          input_microusd_per_million: 100000,
          output_microusd_per_million: 200000,
        }]),
      },
      "gemini",
      "gemini-test",
      messages,
      256
    );

    assert.equal(gemini.ok, true);
    assert.equal(gemini.text, "Gemini OK");
    assert.equal(gemini.input, 120);
    assert.equal(gemini.cached, 40);
    assert.equal(gemini.reasoning, 5);
    assert.equal(gemini.output, 30);
    assert.equal(gemini.finishReason, "STOP");

    const geminiRequest = requests.find(item => item.url === "https://relay.example/v1/chat");
    assert.ok(geminiRequest);
    assert.equal(geminiRequest.init.headers.authorization, "Bearer relay-secret");
    assert.equal(geminiRequest.body.model, "gemini-test");
    assert.equal(geminiRequest.body.payload.generationConfig.maxOutputTokens, 256);
    assert.equal(geminiRequest.body.payload.systemInstruction.parts[0].text, "system");
    assert.equal(geminiRequest.body.payload.contents[0].role, "user");

    const anthropic = await providerCall(
      {
        ANTHROPIC_API_KEY: "anthropic-secret",
        MODELS_JSON: JSON.stringify([{
          provider: "anthropic",
          model: "claude-test",
          input_microusd_per_million: 100000,
          output_microusd_per_million: 200000,
        }]),
      },
      "anthropic",
      "claude-test",
      messages,
      300
    );

    assert.equal(anthropic.ok, true);
    assert.equal(anthropic.text, "Claude OK");
    assert.equal(anthropic.input, 110);
    assert.equal(anthropic.freshInput, 80);
    assert.equal(anthropic.cached, 20);
    assert.equal(anthropic.cacheWrite, 10);
    assert.equal(anthropic.output, 30);
    assert.equal(anthropic.finishReason, "end_turn");

    const anthropicRequest = requests.find(item => item.url.includes("api.anthropic.com"));
    assert.ok(anthropicRequest);
    assert.equal(anthropicRequest.init.headers["x-api-key"], "anthropic-secret");
    assert.equal(anthropicRequest.body.model, "claude-test");
    assert.equal(anthropicRequest.body.max_tokens, 300);
    assert.equal(anthropicRequest.body.system[0].text, "system");

    const failure = providerFailureResponse(
      { category: "provider_http_error", upstreamStatus: 429 },
      "req-test"
    );
    assert.equal(failure.status, 502);
    const failureBody = await failure.json();
    assert.equal(failureBody.error, "provider_rate_limited");
    assert.equal(failureBody.request_id, "req-test");
    assert.equal(failureBody.upstream_http_status, 429);

    const payload = anthropicPayload(messages, "claude-test", 123);
    assert.equal(payload.model, "claude-test");
    assert.equal(payload.max_tokens, 123);
    assert.equal(payload.system[0].text, "system");
    assert.equal(payload.messages[0].role, "user");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("worker provider transport core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
