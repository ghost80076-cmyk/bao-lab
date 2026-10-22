const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Run the real player preference and prompt-wrapping scripts without a browser or API.
global.window = global;
global.addEventListener = () => {};
const values = new Map();
global.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => { values.set(key, String(value)); }
};
global.document = {
  readyState: "loading",
  getElementById() { return null; },
  querySelector() { return null; }
};
global.Chat = { messages: [] };
global.App = {
  activeCharacter: { id: "kurobane-yume-kabukicho", name: "黑羽ゆめ" },
  config: { api: { type: "openrouter", model: "some/model" } },
  escapeHTML: String,
  buildSystemPrompt() { return "BASE"; },
  async buildMessages() {
    return [{ role: "system", content: this.buildSystemPrompt() }, { role: "user", content: "玩家本輪輸入" }];
  },
  openBuilder() {}, collectConfig() { return {}; }, startStory() {},
  sendMessage() {}, renderChatShell() {}
};

for (const file of ["player-settings.js", "prompt-orchestrator.js"]) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", "js", file), "utf8"), { filename: file });
}

(async () => {
  const cases = {
    "zh-Hant": "本輪新生成的旁白、敘事與台詞使用繁體中文",
    "zh-Hans": "本轮新生成的旁白、叙述与对话使用简体中文",
    en: "Write all newly generated narration and dialogue in English"
  };

  for (const [choice, expected] of Object.entries(cases)) {
    BAOPlayerSettings.set({ language: choice });
    assert.equal(BAOPlayerSettings.getLanguage(), choice);
    assert.equal(JSON.parse(values.get("bao-lab:player-settings")).language, choice);
    const messages = await App.buildMessages();
    assert.match(messages[0].content, /BASE/);
    assert.ok(messages[0].content.includes(expected), "language rule should reach the final provider messages");
    assert.doesNotMatch(messages[0].content, /場景旁白、人物動作及環境描述使用自然繁體中文/,
      "character-specific constraints must not force Traditional Chinese");
    assert.match(messages[0].content, /保留日文人名及日本專有詞/,
      "language switching must retain character-specific cultural context");
    assert.equal(messages.filter(message => message.role === "user").length, 1,
      "switching language must not introduce a second request");
  }

  BAOPlayerSettings.set({ language: "fr" });
  assert.equal(BAOPlayerSettings.getLanguage(), "zh-Hant", "unsupported choices revert to default");
  const fallbackMessages = await App.buildMessages();
  assert.ok(fallbackMessages[0].content.includes(cases["zh-Hant"]));
  assert.equal(BAOPromptOrchestrator.outputLanguage(), "zh-Hant");
  console.log("response language core test passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
