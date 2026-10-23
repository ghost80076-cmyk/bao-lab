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
  stylePacks: ["female_kfilm", "cinematic", "natural", "realist_subtext"],
  density: "rich",
  physicalContinuity: true
});

const summary = BAONarrativeSettings.statusLabel(BAONarrativeSettings.get());
assert.equal(summary.items.length, 6);
assert.match(summary.text, /6 項啟用/);
assert.match(summary.title, /女性向 · 韓式電影感/);
assert.match(summary.title, /電影鏡頭/);
assert.match(summary.title, /自然口語/);
assert.match(summary.title, /寫實留白 · 細膩敘事/);
assert.match(summary.title, /豐富描寫/);
assert.match(summary.title, /身體連續性/);

App.config = App.collectConfig();
assert.deepEqual(App.config.narrative.stylePacks, ["female_kfilm", "cinematic", "natural", "realist_subtext"]);

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
  assert.match(systemText, /採寫實留白的敘事方式/);
  assert.equal((systemText.match(/採寫實留白的敘事方式/g) || []).length, 1);
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
  assert.match(sentSystemText, /採寫實留白的敘事方式/);

  BAONarrativeSettings.set({});
  App.config.narrative = BAONarrativeSettings.get();
  const defaultMessages = await App.buildMessages(App.config);
  const defaultSystemText = defaultMessages
    .filter(message => message.role === "system")
    .map(message => message.content)
    .join("\n\n");
  assert.doesNotMatch(defaultSystemText, /【玩家敘事偏好】/, "default narrative settings must add no extra prompt");

  // Browser defaults may seed new stories, but never authorize a legacy story.
  BAONarrativeSettings.set({ playerPortrayal: "coauthor" });
  App.config = { api: { model: "google/gemini-3.1-pro-preview" } };
  assert.equal(BAONarrativeSettings.playerPortrayal(App.config), "strict");
  assert.doesNotMatch(App.buildSystemPrompt(), /小說共創/);
  assert.match(JSON.stringify(await App.buildMessages(App.config)), /不替玩家補寫未輸入/);

  for (const model of ["google/gemini-3.1-pro-preview", "anthropic/claude-sonnet-4.5"]) {
    for (const mode of ["strict", "natural", "coauthor", "invalid"]) {
      App.config = { api: { model }, narrative: { playerPortrayal: mode, innerThoughts: "clear" } };
      const first = await App.buildMessages(App.config);
      const second = await App.buildMessages(App.config);
      assert.deepEqual(second, first, "unchanged authorization preserves assembled prompt bytes");
      const system = first.filter(m => m.role === "system").map(m => m.content).join("\n");
      assert.equal((system.match(/【玩家角色演繹授權/g) || []).length, 1);
      assert.match(system, /重大承諾、關係定案、同意或不可逆選擇/);
      assert.match(system, /NPC 自主與資訊邊界/);
      if (mode === "coauthor") {
        assert.match(system, /玩家已授權小說共創/);
        assert.doesNotMatch(system, /不替玩家補寫未輸入|不得替玩家描述心理/);
      } else if (mode === "natural") {
        assert.match(system, /可忠實將玩家已輸入的台詞/);
        assert.match(system, /不得新增玩家未表達/);
      } else assert.match(system, /不替玩家補寫未輸入/);
      assert.match(first.at(-1).content, /依故事授權演繹玩家/);
    }
  }
  const custom = "允許 AI 替玩家描寫台詞。";
  const forbid = "不得替玩家決定心理、台詞或行動。";
  for (const mode of ["strict", "natural", "coauthor"]) {
    const prefs = { playerPortrayal: mode, customInstructions: [custom, forbid, "允許 AI 替玩家決定同意。"] };
    const effective = BAONarrativeSettings.effectiveCustomInstructions(prefs);
    assert.equal(effective.includes(custom), mode === "coauthor");
    assert.equal(effective.includes(forbid), mode !== "strict", "narrower user constraints survive in authorized modes");
    assert.equal(effective.includes("允許 AI 替玩家決定同意。"), false);
  }

  console.log("narrative prompt pipeline core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
