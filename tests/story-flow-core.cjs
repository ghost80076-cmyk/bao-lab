const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.localStorage = {
  data: {},
  setItem(key, value) { this.data[key] = String(value); },
  getItem(key) { return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null; },
  removeItem(key) { delete this.data[key]; }
};
global.document = {
  querySelector() { return null; },
  createElement() {
    return {
      append() {},
      appendChild() {},
      remove() {},
      click() {},
      style: {},
      set rel(value) {},
      set href(value) {}
    };
  },
  head: { appendChild() {} },
  body: { appendChild() {} }
};
global.alert = () => {};
global.confirm = () => true;
global.API = { send: async () => ({ text: "{}" }) };
global.CharacterEngine = null;
global.BAOMemoryWorkbench = null;
global.BAOPlayerSettings = null;
global.BAONarrativeSettings = null;

const character = {
  id: "test-hero",
  name: "林塵封",
  system_prompt: "扮演林塵封。",
  greeting: "故事開始。",
  initial_state: { time: "夜晚", location: "舊城", events: ["兩人相遇"], npcs: [], modules: {} },
  character_status: {
    enabled: true,
    fields: [
      { key: "hp", label: "生命", type: "meter", min: 0, max: 100, default: 80, context: "core", track: true, player_toggle: false, player_rename: false }
    ]
  },
  world_modules: []
};

global.App = {
  activeCharacter: character,
  characters: [character],
  config: {
    narrativeMode: "world",
    displayMode: "ui",
    persona: { name: "玩家" },
    api: { key: "SECRET-KEY", model: "test-model" },
    memory: { mode: "smart", maxRounds: 20 }
  },
  escapeHTML: String,
  buildSystemPrompt() { return "BASE SYSTEM"; },
  renderChatShell() {},
  showView() {},
  saveStory() { return Storage.saveStory(); }
};

global.Chat = {
  messages: [
    { role: "user", content: "我走進舊城。" },
    { role: "assistant", content: "林塵封抬眼看來。" }
  ],
  summary: "舊摘要",
  summarizedUntil: 0,
  usage: { prompt: 0, completion: 0, cached: 0, total: 0 },
  lastStoryPromptTokens: 0,
  contextGuard: {},
  reset() {
    this.messages = [];
    this.summary = "";
    this.summarizedUntil = 0;
    this.usage = { prompt: 0, completion: 0, cached: 0, total: 0 };
    this.lastStoryPromptTokens = 0;
  }
};

const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { filename: file });
run("js/state.js");
run("js/world-state.js");
run("js/storage.js");
run("js/character-status.js");
run("js/world-modules.js");
run("js/story-tools.js");
run("js/global-bridge.js");

GameState.create(character, App.config);

BAOCharacterStatus.applyCustomization({
  customFields: [
    { key: "focus", label: "專注", type: "number", min: 0, max: 10, default: 5, context: "core", track: true }
  ],
  hidden: ["hp"],
  labels: { hp: "不可改名" },
  order: ["focus", "hp"]
}, character);
assert.equal(BAOCharacterStatus.configFor(character).customization.hidden.includes("hp"), false);
assert.equal(BAOCharacterStatus.configFor(character).customization.labels.hp, undefined);
GameState.applyUpdate({ character_statuses: { [character.name]: { focus: 99 } } });
assert.equal(GameState.current.characterStatuses[character.name].focus, 10);
assert.match(BAOCharacterStatus.compactForPrompt("查看專注").text, /專注=10/);

BAOWorldModules.applyCustomization({
  enabledBuiltIns: ["inventory", "skills"],
  customModules: [
    { id: "oaths", label: "誓約", kind: "collection", context: "relevant", tracking: "medium", triggers: ["誓約"] }
  ],
  order: ["oaths", "inventory", "skills"]
}, character);
assert.deepEqual(GameState.current.moduleDefinitions.map(item => item.id), ["oaths", "inventory", "skills"]);
GameState.applyUpdate({ modules: { inventory: [{ name: "短刀" }], oaths: [{ name: "守密" }], unknown: ["drop"] } });
assert.deepEqual(GameState.current.modules.inventory, [{ name: "短刀" }]);
assert.deepEqual(GameState.current.modules.oaths, [{ name: "守密" }]);
assert.equal(GameState.current.modules.unknown, undefined);

const story = Storage.buildStoryPayload("測試備份");
assert.equal(story.version, 4);
assert.equal(JSON.stringify(story).includes("SECRET-KEY"), false);
assert.ok(story.character);
assert.ok(story.state.characterStatusCustomization);
assert.ok(story.state.worldModuleCustomization);

const importedPack = BAOStoryTools.parseExternalText(JSON.stringify({
  schema: "bao-lab-context-pack",
  summary: "外部摘要",
  playerConfirmed: true
}));
assert.equal(importedPack.pack.playerConfirmed, false);

const plain = BAOStoryTools.parseExternalText("玩家：你好\n角色：在。");
const modelJSON = BAOStoryTools.parseExternalText(JSON.stringify([
  { role: "user", content: "A" },
  { role: "model", content: "B" }
]));
assert.equal(plain.messages.length, 2);
assert.equal(modelJSON.messages[1].role, "assistant");

const pack = BAOStoryTools.createPack(Chat.messages);
pack.summary = "已整理的唯一前情";
pack.playerConfirmed = true;
const editedPack = structuredClone(pack);
editedPack.summary = "尚未重新確認的修改";
assert.notEqual(BAOStoryTools.confirmationSignature(editedPack), BAOStoryTools.confirmationSignature(pack));
BAOStoryTools.startSequel(pack);
assert.equal(Storage.listSlots().length, 1);
assert.equal(Chat.summary, "");
assert.equal((App.buildSystemPrompt().match(/Context Pack · 玩家已確認的前情/g) || []).length, 1);
assert.equal(GameState.current.contextPack.playerConfirmed, true);

const preview = BAOStoryTools.preview();
const estimate = value => {
  const text = String(value || "");
  const cjk = (text.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
  return Math.max(1, Math.ceil(cjk + (text.length - cjk) / 4));
};
assert.equal(preview.estimatedTokens, estimate(preview.systemPrompt + JSON.stringify(preview.memoryMessages)));

const portable = Storage.buildStoryPayload("續篇");
App.characters = [];
App.activeCharacter = null;
GameState.current = null;
assert.equal(Storage.restoreStory(portable), true);
assert.equal(App.activeCharacter.id, "test-hero");
assert.equal(App.config.api.key, "");
assert.equal(GameState.current.contextPack.playerConfirmed, true);

console.log("story flow core test passed");