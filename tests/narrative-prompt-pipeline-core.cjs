const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.addEventListener = () => {};
global.localStorage = {
  value: "",
  getItem() { return this.value || null; },
  setItem(_key, value) { this.value = String(value); }
};

const fakeHead = { appendChild() {} };
global.document = {
  readyState: "loading",
  head: fakeHead,
  body: { appendChild() {} },
  createElement() { return { classList: { toggle() {} }, dataset: {}, setAttribute() {} }; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  addEventListener() {}
};

let capturedRequest = null;
global.API = {
  async send(config, messages) {
    capturedRequest = { config, messages };
    return { text: "ok", usage: {} };
  },
  isOpenRouter() { return false; }
};

global.Chat = {
  usage: {},
  async context() {
    return [
      { role: "assistant", content: "上一輪" },
      { role: "user", content: "玩家最新輸入" }
    ];
  },
  addUsage() {},
  reset() {},
  renderUsage() {},
  async maybeSummarize() {}
};

global.GameState = { current: {} };

global.App = {
  __buildMessagesWrapperIds: new Set(),
  config: {},
  activeCharacter: { id: "pipeline-test", world_focus: [] },
  escapeHTML: String,
  collectConfig() {
    return {
      api: { type: "openrouter", model: "google/gemini-3.1-pro-preview" },
      memory: { cache: true }
    };
  },
  buildSystemPrompt() { return "BASE CHARACTER PROMPT"; },
  renderChatShell() {},
  openBuilder() {},
  saveStory() {},
  getSelectedPreset() { return null; },
  wrapBuildMessages(id, wrapper) {
    if (this.__buildMessagesWrapperIds.has(id)) return false;
    const next = this.buildMessages.bind(this);
    this.buildMessages = (...args) => wrapper.call(this, next, ...args);
    this.__buildMessagesWrapperIds.add(id);
    return true;
  }
};

const run = file => vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
  { filename: file }
);

run("js/narrative-settings.js");

BAONarrativeSettings.set({
  stylePacks: ["female_kfilm", "cinematic", "natural"],
  density: "rich",
  physicalContinuity: true
});

const summary = BAONarrativeSettings.statusLabel(BAONarrativeSettings.get());
assert.equal(summary.items.length, 5);
assert.match(summary.text, /5 項啟用/);
assert.match(summary.title, /女性向 · 韓式電影感/);
assert.match(summary.title, /電影鏡頭/);
assert.match(summary.title, /自然口語/);
assert.match(summary.title, /豐富描寫/);
assert.match(summary.title, /身體連續性/);

App.config = App.collectConfig();
assert.deepEqual(App.config.narrative.stylePacks, ["female_kfilm", "cinematic", "natural"]);

run("js/prompt-cache.js");
run("js/prompt-orchestrator.js");
assert.equal(
  App.__buildMessagesWrapperIds.has("prompt-orchestrator:rules"),
  true,
  "combined prompt pipeline must use App.wrapBuildMessages"
);

(async () => {
  const messages = await App.buildMessages(App.config);
  const systemText = messages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n\n");

  assert.match(systemText, /【玩家敘事偏好】/);
  assert.match(systemText, /克制的韓式電影感/);
  assert.match(systemText, /電影鏡頭式/);
  assert.match(systemText, /自然口語/);
  assert.match(systemText, /描寫密度高/);
  assert.match(systemText, /保持身體與空間連續性/);
  assert.match(systemText, /【平台硬規則】/);

  const preferenceHeaderCount = (systemText.match(/【玩家敘事偏好】/g) || []).length;
  assert.equal(preferenceHeaderCount, 1, "narrative preference prompt must not be duplicated");

  assert.match(messages.at(-1).content, /【玩家最新輸入】/);
  assert.match(messages.at(-1).content, /玩家最新輸入/);
  assert.match(messages.at(-1).content, /【本輪】/);

  await API.send(App.config.api, messages);
  const sentSystemText = capturedRequest.messages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n\n");
  assert.match(sentSystemText, /克制的韓式電影感/);
  assert.match(sentSystemText, /電影鏡頭式/);
  assert.match(sentSystemText, /自然口語/);

  BAONarrativeSettings.set({});
  App.config.narrative = BAONarrativeSettings.get();
  const defaultMessages = await App.buildMessages(App.config);
  const defaultSystemText = defaultMessages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n\n");
  assert.doesNotMatch(defaultSystemText, /【玩家敘事偏好】/, "default narrative settings must add no extra prompt");

  console.log("narrative prompt pipeline core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
