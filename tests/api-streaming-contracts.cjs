const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
const source = fs.readFileSync(path.join(__dirname, "..", "js", "api.js"), "utf8");
vm.runInThisContext(`${source}\nglobalThis.__API = API;`, { filename: "js/api.js" });
const API = global.__API;
const requests = [];
const messages = [{ role: "system", content: "規則" }, { role: "user", content: "開始" }];

const sseResponse = (events, splits = [11, 29, 47]) => {
  const bytes = new TextEncoder().encode(events);
  const points = [...splits, bytes.length].filter((value, index, list) => value > 0 && value <= bytes.length && value > (list[index - 1] || 0));
  let start = 0;
  const stream = new ReadableStream({
    pull(controller) {
      const end = points.shift();
      if (end == null) { controller.close(); return; }
      controller.enqueue(bytes.slice(start, end));
      start = end;
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream; charset=utf-8" } });
};

global.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  requests.push({ url: String(url), body, options });
  if (body.model === "openai-stream") return sseResponse([
    `data: ${JSON.stringify({ choices: [{ delta: { content: "第一段" } }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: "＋第二段" } }] })}`,
    `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 5, total_tokens: 17 } })}`,
    "data: [DONE]"
  ].join("\n\n") + "\n\n", [1, 8, 31, 73]);
  if (body.model === "zai-stream") return sseResponse([
    `data: ${JSON.stringify({ choices: [{ delta: { content: "GLM 串" } }] })}`,
    `data: ${JSON.stringify({ choices: [{ delta: { content: "流" } }] })}`,
    `data: ${JSON.stringify({ choices: [{ finish_reason: "stop", delta: { role: "assistant", content: "" } }], usage: { prompt_tokens: 20, completion_tokens: 6, total_tokens: 26, prompt_tokens_details: { cached_tokens: 8 } } })}`,
    "data: [DONE]"
  ].join("\n\n") + "\n\n", [2, 13, 41, 87]);
  if (body.model === "claude-stream") return sseResponse([
    `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 20, cache_read_input_tokens: 8, cache_creation_input_tokens: 2, output_tokens: 1 } } })}`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Claude 串" } })}`,
    `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "流" } })}`,
    `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 6 } })}`,
    `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}`
  ].join("\r\n\r\n") + "\r\n\r\n", [5, 19, 62, 101]);
  return sseResponse([
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Gemini 串" }] } }] })}`,
    `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "流" }] } }], usageMetadata: { promptTokenCount: 30, candidatesTokenCount: 7, totalTokenCount: 37 } })}`
  ].join("\n\n") + "\n\n", [3, 17, 44, 89]);
};

(async () => {
  const openAIDeltas = [];
  const openAI = await API.send({ type: "openai", protocol: "openai", model: "openai-stream", baseUrl: "https://api.openai.com/v1/chat/completions", key: "SECRET", stream: true, onDelta: (delta, text) => openAIDeltas.push({ delta, text }) }, messages);
  assert.equal(openAI.text, "第一段＋第二段");
  assert.deepEqual(openAIDeltas.map(item => item.text), ["第一段", "第一段＋第二段"]);
  assert.equal(openAI.usage.total_tokens, 17);
  assert.equal(requests[0].body.stream, true);
  assert.deepEqual(requests[0].body.stream_options, { include_usage: true });

  const zaiDeltas = [];
  const zai = await API.send({ type: "zai", protocol: "openai", route: "official", model: "zai-stream", baseUrl: "https://api.z.ai/api/paas/v4/chat/completions", key: "SECRET", stream: true, onDelta: delta => zaiDeltas.push(delta) }, messages);
  assert.equal(zai.text, "GLM 串流");
  assert.deepEqual(zaiDeltas, ["GLM 串", "流"]);
  assert.equal(zai.usage.total_tokens, 26);
  assert.equal(zai.usage.cached_tokens, 8);
  assert.equal(zai.usage.new_input_tokens, 12);
  assert.equal(requests[1].body.stream, true);
  assert.equal(requests[1].body.stream_options, undefined, "Z.AI must not receive OpenAI-specific stream_options by assumption");
  assert.equal(requests[1].body.session_id, undefined, "Z.AI must not receive OpenRouter session_id");

  const anthropicDeltas = [];
  const anthropic = await API.send({ type: "anthropic", protocol: "anthropic", route: "official", model: "claude-stream", baseUrl: "https://api.anthropic.com/v1/messages", key: "SECRET", stream: true, onDelta: delta => anthropicDeltas.push(delta) }, messages);
  assert.equal(anthropic.text, "Claude 串流");
  assert.deepEqual(anthropicDeltas, ["Claude 串", "流"]);
  assert.equal(anthropic.usage.input_tokens, 30);
  assert.equal(anthropic.usage.output_tokens, 6);
  assert.equal(requests[2].body.stream, true);

  const geminiDeltas = [];
  const gemini = await API.send({ type: "gemini", protocol: "gemini", model: "gemini-stream", baseUrl: "https://generativelanguage.googleapis.com/v1beta/models", key: "SECRET", stream: true, onDelta: delta => geminiDeltas.push(delta) }, messages);
  assert.equal(gemini.text, "Gemini 串流");
  assert.deepEqual(geminiDeltas, ["Gemini 串", "流"]);
  assert.equal(gemini.usage.total_tokens, 37);
  assert.match(requests[3].url, /gemini-stream:streamGenerateContent\?alt=sse$/);

  console.log("API streaming contracts test passed (OpenAI-compatible, Z.AI, Anthropic, Gemini)");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
