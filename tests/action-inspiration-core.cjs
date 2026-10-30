const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const reader = fs.readFileSync("js/story-reader.js", "utf8");
const chat = fs.readFileSync("js/chat.js", "utf8");
const api = fs.readFileSync("js/api.js", "utf8");
const start = reader.indexOf("  const parseSuggestions = input => {");
const end = reader.indexOf("  const rewriteMessage = async (index, button) => {");
assert(start >= 0 && end > start, "inspiration source block must remain available");
assert(reader.includes("hiddenInspirations.add(message)"), "closing should hide, not discard valid cached suggestions");
assert(reader.includes("entry.signature !== inspirationContext(index).signature"), "stale cached options must not render");
assert(chat.includes('if (config?.__inspirationTask) return "action-inspiration"'), "local ledger must distinguish action inspiration");
assert(api.includes("(config.__stateTask || config.__inspirationTask || config.__memoryTask)"), "Gemini action helper should use low thinking effort");

const story = {};
const messages = [
  { role: "user", content: "早先的行動：" + "A".repeat(3000) },
  { role: "assistant", content: "早先的場景：" + "B".repeat(3000) },
  { role: "user", content: "玩家決定先觀察。" + "C".repeat(3000) },
  { role: "assistant", content: "場景開頭：" + "D".repeat(9000) + "場景末尾：燈熄滅了。" }
];
const calls = [];
const sandbox = {
  App: { config: { persona: { nickname: "旅人", details: "P".repeat(6000) }, api: { model: "test-model", type: "openai", baseUrl: "https://example.test/v1", maxOutputTokens: 8192 } } },
  Chat: { messages },
  window: { GameState: { current: story } },
  API: { async send(config, input) { calls.push({ config, input }); return { text: '["觀察門邊的動靜","輕聲問候她","詢問兩人的約定","從窗邊查看燈光"]' }; } },
  normalizeAssistantMessage(message) { if (!message.id) message.id = "scene-" + messages.indexOf(message); },
  aiToolsAvailable: () => true,
  aiToolsUnavailableMessage: () => "",
  latestAssistantIndex: () => sandbox.Chat.messages.findLastIndex(m => m.role === "assistant"),
  setBusy() {},
  decorateStream() {},
  alert(message) { throw new Error(message); }
};
vm.runInNewContext("const suggestionCache = new WeakMap(); const hiddenInspirations = new WeakSet(); const inFlightInspirations = new WeakMap();\n" + reader.slice(start, end) + "\nthis.action = { inspireLatest, generateInspirations, inspirationContext };", sandbox, { filename: "action-inspiration-under-test.js" });

(async () => {
  const ctx = sandbox.action.inspirationContext(3);
  assert.equal(ctx.recent.length, 4, "helper must send at most four nearby messages");
  assert(ctx.persona.length <= 920, "large persona must be capped");
  assert(ctx.recent[3].content.length < 2440, "long current scene must be capped");
  assert(ctx.recent[3].content.endsWith("場景末尾：燈熄滅了。"), "scene ending must survive truncation");

  assert.equal(await sandbox.action.inspireLatest(null), true, "mobile helper may not have a button");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].config.__storyTool, true);
  assert.equal(calls[0].config.__inspirationTask, true);
  assert.equal(calls[0].config.__memoryTask, undefined);
  assert.equal(calls[0].config.maxOutputTokens, 1024, "choice response should have a bounded output cap");
  assert.equal(calls[0].input.length, 6, "system + four local turns + instruction");
  assert(!calls[0].input[0].content.includes("P".repeat(900)), "full player persona must not leak into helper input");

  assert.equal(await sandbox.action.inspireLatest(null), true);
  assert.equal(calls.length, 1, "same scene should reuse suggestions without another API call");

  messages[3].content += "劇情修改。";
  await sandbox.action.inspireLatest(null);
  assert.equal(calls.length, 2, "editing the scene must invalidate cached choices");

  sandbox.App.config.persona.nickname = "新玩家";
  await sandbox.action.inspireLatest(null);
  assert.equal(calls.length, 3, "changing persona must invalidate cached choices");

  let resume;
  sandbox.API.send = (config, input) => {
    calls.push({ config, input });
    return new Promise(resolve => { resume = resolve; });
  };
  sandbox.App.config.persona.nickname = "同時點擊";
  const first = sandbox.action.inspireLatest(null);
  const second = sandbox.action.inspireLatest(null);
  assert.equal(calls.length, 4, "concurrent clicks must share a single request");
  resume({ text: '["觀察","詢問","靠近","離開"]' });
  await Promise.all([first, second]);

  sandbox.App.config.persona.nickname = "切換故事";
  const delayed = sandbox.action.inspireLatest(null);
  sandbox.window.GameState.current = {};
  resume({ text: '["A","B","C","D"]' });
  assert.equal(await delayed, false, "old story response must not mount after story switch");

  console.log("action-inspiration-core: ok");
})().catch(error => { console.error(error); process.exitCode = 1; });
