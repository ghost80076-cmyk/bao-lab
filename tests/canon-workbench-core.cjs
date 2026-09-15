const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.document = { querySelectorAll() { return []; } };
global.confirm = () => true;
global.GameState = { current: {} };
global.Chat = {
  messages: [
    { role: "user", content: "我去找艾琳，詢問北塔的封印。" },
    { role: "assistant", content: "艾琳承認她昨夜見過守塔人。" }
  ]
};
global.App = {
  activeCharacter: { id: "test-character" },
  config: { api: { key: "test-key" }, memory: {} },
  escapeHTML: String,
  escapeAttr: String,
  saveStory() {},
  buildSystemPrompt() { return "平台規則\n\n【固定 Schema】\n格式要求"; }
};
global.API = {
  calls: [],
  async send(config, messages) {
    this.calls.push({ config, messages });
    return { text: JSON.stringify({ notebooks: [{ title: "艾琳與北塔", category: "relationships", tier: "relevant", certainty: "confirmed", content: "艾琳昨夜見過守塔人。", evidence: "訊息 2" }] }) };
  }
};

const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { filename: file });
run("js/canon-workbench.js");

const normalized = BAOCanonWorkbench.normalizeCanon({ notebooks: [
  { title: "世界硬規則", category: "world", content: "月蝕會關閉城門。" },
  { title: "衝突證據", category: "conflicts", content: "日期不一致。" }
] });
assert.equal(normalized.notebooks[0].tier, "core");
assert.equal(normalized.notebooks[1].tier, "ui");
assert.ok(BAOCanonWorkbench.searchTerms("我去找艾琳").includes("艾琳"));

GameState.current.canon = BAOCanonWorkbench.normalizeCanon({ notebooks: [
  { title: "月蝕規則", category: "world", tier: "core", certainty: "confirmed", content: "月蝕會關閉城門。" },
  { title: "艾琳動向", category: "current", tier: "relevant", certainty: "confirmed", content: "艾琳在北塔。" },
  { title: "內部證據", category: "conflicts", tier: "ui", certainty: "uncertain", content: "日期有衝突。" }
] });
const prompt = App.buildSystemPrompt();
assert.match(prompt, /Canon Core · 玩家已確認/);
assert.match(prompt, /月蝕會關閉城門/);
assert.match(prompt, /本輪相關 Canon/);
assert.match(prompt, /艾琳在北塔/);
assert.doesNotMatch(prompt, /日期有衝突/);

(async () => {
  delete GameState.current.canon;
  await BAOCanonWorkbench.run("full");
  assert.equal(API.calls.length, 2, "one extraction call plus one merge call expected");
  assert.equal(API.calls.every(call => call.config.__memoryTask === true), true);
  assert.equal(GameState.current.canon, undefined, "AI output must not become official Canon before player confirmation");
  assert.equal(GameState.current.canonDraft.notebooks[0].title, "艾琳與北塔");
  assert.equal(GameState.current.canonDraft.lastProcessedMessageCount, Chat.messages.length);
  console.log("canon workbench core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
