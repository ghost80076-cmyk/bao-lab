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
  getElementById() { return null; },
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
    memory: { mode: "smart", maxRounds: 20, summaryApi: { model: "memory-model", key: "MEMORY-SECRET" } },
    cost: { stateApi: { model: "state-model", key: "STATE-SECRET" } }
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

const storyToolsSource = fs.readFileSync(path.join(__dirname, "..", "js/story-tools.js"), "utf8");
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
assert.equal(JSON.stringify(story).includes("MEMORY-SECRET"), false);
assert.equal(JSON.stringify(story).includes("STATE-SECRET"), false);
assert.equal(story.config.memory.summaryApi.key, undefined);
assert.equal(story.config.cost.stateApi.key, undefined);
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

const claudeJSON = BAOStoryTools.parseExternalText(JSON.stringify({
  chat_messages: [
    { sender: "human", text: "Claude 玩家訊息" },
    { sender: "assistant", text: "Claude 角色訊息" }
  ]
}));
assert.equal(claudeJSON.report.format, "Claude chat_messages JSON");
assert.deepEqual(claudeJSON.messages.map(item => item.role), ["user", "assistant"]);

const chatGPTJSON = BAOStoryTools.parseExternalText(JSON.stringify({
  current_node: "assistant-node",
  mapping: {
    root: { parent: null, message: { author: { role: "system" }, content: { parts: ["系統"] }, create_time: 1 } },
    "user-node": { parent: "root", message: { author: { role: "user" }, content: { parts: ["玩家問題"] }, create_time: 2 } },
    "assistant-node": { parent: "user-node", message: { author: { role: "assistant" }, content: { parts: ["角色回答"] }, create_time: 3 } }
  }
}));
assert.equal(chatGPTJSON.report.format, "ChatGPT 匯出 JSON");
assert.deepEqual(chatGPTJSON.messages.map(item => item.content), ["玩家問題", "角色回答"]);
assert.equal(chatGPTJSON.report.skippedCount, 1);

const multiChatGPTJSON = BAOStoryTools.parseExternalText(JSON.stringify([
  {
    id: "chat-a",
    title: "第一個故事",
    current_node: "a-user",
    mapping: {
      "a-user": { parent: null, message: { author: { role: "user" }, content: { parts: ["只屬於故事 A"] }, create_time: 1 } }
    }
  },
  {
    id: "chat-b",
    title: "第二個故事",
    current_node: "b-assistant",
    mapping: {
      "b-user": { parent: null, message: { author: { role: "user" }, content: { parts: ["故事 B 問題"] }, create_time: 1 } },
      "b-assistant": { parent: "b-user", message: { author: { role: "assistant" }, content: { parts: ["故事 B 回答"] }, create_time: 2 } }
    }
  }
]));
assert.equal(multiChatGPTJSON.conversations.length, 2);
assert.deepEqual(multiChatGPTJSON.conversations.map(item => item.title), ["第一個故事", "第二個故事"]);
assert.deepEqual(multiChatGPTJSON.conversations[0].result.messages.map(item => item.content), ["只屬於故事 A"]);
assert.deepEqual(multiChatGPTJSON.conversations[1].result.messages.map(item => item.content), ["故事 B 問題", "故事 B 回答"]);
assert.equal(multiChatGPTJSON.messages.length, 0);
assert.match(multiChatGPTJSON.report.warnings[0], /不會自動合併/);

const multiClaudeJSON = BAOStoryTools.parseExternalText(JSON.stringify([
  { uuid: "claude-a", name: "Claude A", chat_messages: [{ sender: "human", text: "A 訊息" }] },
  { uuid: "claude-b", name: "Claude B", chat_messages: [{ sender: "assistant", text: "B 訊息" }] }
]));
assert.equal(multiClaudeJSON.conversations.length, 2);
assert.deepEqual(multiClaudeJSON.conversations.map(item => item.title), ["Claude A", "Claude B"]);
assert.equal(multiClaudeJSON.conversations[0].result.messages[0].content, "A 訊息");

const tavernJSONL = BAOStoryTools.parseExternalText([
  JSON.stringify({ user_name: "旅人", character_name: "林塵封" }),
  JSON.stringify({ name: "旅人", is_user: true, mes: "走吧。" }),
  JSON.stringify({ name: "林塵封", is_user: false, mes: "跟上。" })
].join("\n"));
assert.equal(tavernJSONL.report.format, "SillyTavern／JSONL");
assert.deepEqual(tavernJSONL.messages.map(item => item.role), ["user", "assistant"]);
assert.equal(tavernJSONL.report.skippedCount, 1);

const namedPlain = BAOStoryTools.parseExternalText("小明：你好\n林塵封：在。");
assert.equal(namedPlain.messages.length, 0);
assert.equal(namedPlain.report.unassignedCount, 2);
assert.deepEqual(
  BAOStoryTools.resolveImportedMessages(namedPlain, { "小明": "user", "林塵封": "assistant" }).map(item => item.role),
  ["user", "assistant"]
);
assert.equal(BAOStoryTools.resolveImportedMessages(namedPlain, { "小明": "skip", "林塵封": "assistant" }).length, 1);

const longMessages = Array.from({ length: 12 }, (_, index) => ([
  { role: "user", content: "玩家第" + index + "輪：" + "前進。".repeat(12) },
  { role: "assistant", content: "角色第" + index + "輪：" + "回應。".repeat(12) }
])).flat();
const chunks = BAOStoryTools.chunkMessages(longMessages, { maxTokens: 90 });
assert.ok(chunks.length > 1);
assert.equal(chunks.flat().length, longMessages.length);
assert.ok(chunks.every(chunk => chunk.reduce((sum, item) => sum + BAOStoryTools.tokenEstimate(item.content) + 8, 0) <= 90));
const pairedChunks = BAOStoryTools.chunkMessages(longMessages.slice(0, 4), { maxTokens: 100 });
assert.deepEqual(pairedChunks[0].map(item => item.role), ["user", "assistant"]);
const oversizedChunks = BAOStoryTools.chunkMessages([{ role: "user", content: "很長的內容。".repeat(300) }], { maxTokens: 80 });
assert.ok(oversizedChunks.length > 1);
assert.ok(oversizedChunks.every(chunk => chunk.reduce((sum, item) => sum + BAOStoryTools.tokenEstimate(item.content) + 8, 0) <= 80));
assert.equal(BAOStoryTools.mergeCallCount(1), 0);
assert.equal(BAOStoryTools.mergeCallCount(6), 1);
assert.equal(BAOStoryTools.mergeCallCount(7), 2);
const plan = BAOStoryTools.organizationPlan(longMessages, { maxTokens: 90 });
assert.equal(plan.totalCalls, plan.chunkCount + plan.mergeCalls);
assert.equal(storyToolsSource.includes("slice(-400)"), false);
assert.equal(storyToolsSource.includes("slice(-80000)"), false);
assert.equal(storyToolsSource.includes("while (level.length > 1)"), true);
assert.equal(storyToolsSource.includes("contextPackDraftProgress"), true);
assert.equal(storyToolsSource.includes("繼續未確認草稿"), true);
assert.equal(storyToolsSource.includes("const libraryScreen = async host"), true);
assert.equal(storyToolsSource.includes("data-open-story-library"), true);
assert.equal(storyToolsSource.includes("API Key 不會儲存在故事書庫"), true);
assert.equal(storyToolsSource.includes("確認身分並建立草稿"), true);
assert.equal(storyToolsSource.includes("SillyTavern／JSONL"), true);
assert.equal(storyToolsSource.includes("resolveImportedMessages"), true);
assert.equal(storyToolsSource.includes("IndexedDB 無法使用"), true);
assert.equal(storyToolsSource.includes("選擇要匯入的對話"), true);
assert.equal(storyToolsSource.includes("不同對話不會自動合併"), true);

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
assert.equal(preview.tokenBreakdown.systemPrompt, estimate(preview.systemPrompt));
assert.equal(preview.tokenBreakdown.memoryMessages, estimate(JSON.stringify(preview.memoryMessages)));
assert.deepEqual(Object.keys(preview.tokenBreakdown.sections), Object.keys(preview.sections));
Object.entries(preview.sections).forEach(([label, value]) => {
  assert.equal(
    preview.tokenBreakdown.sections[label],
    estimate(typeof value === "string" ? value : JSON.stringify(value))
  );
});
assert.equal(
  preview.estimatedTokens,
  preview.tokenBreakdown.systemPrompt + preview.tokenBreakdown.memoryMessages
);
assert.equal(storyToolsSource.includes("data.tokenBreakdown.systemPrompt.toLocaleString()"), true);
assert.equal(storyToolsSource.includes("data.tokenBreakdown.sections[label]"), true);

App.config.demoMode = true;
GameState.current.config = App.config;
Chat.messages = [
  { role: "user", content: "跨裝置後繼續這句。" },
  { role: "assistant", content: "續篇狀態仍然存在。" }
];
localStorage.setItem("bao-lab:player-settings", JSON.stringify({ displayName: "搬家玩家" }));
localStorage.setItem("bao-lab:narrative-settings-v1", JSON.stringify({ styles: ["韓式電影"] }));
localStorage.setItem("bao-lab:player-memory-slots", JSON.stringify([{ id: "portable-memory", text: "不可遺失的記憶", enabled: true }]));
const portable = Storage.buildStoryPayload("續篇");
assert.equal(JSON.stringify(portable).includes("SECRET-KEY"), false);
App.characters = [];
App.activeCharacter = null;
App.config = {};
Chat.messages = [];
GameState.current = null;
localStorage.removeItem("bao-lab:player-settings");
localStorage.removeItem("bao-lab:narrative-settings-v1");
localStorage.removeItem("bao-lab:player-memory-slots");
assert.equal(Storage.restoreStory(portable), true);
assert.equal(App.activeCharacter.id, "test-hero");
assert.equal(App.config.api.key, "");
assert.equal(App.config.demoMode, true);
assert.deepEqual(Chat.messages.map(item => item.content), ["跨裝置後繼續這句。", "續篇狀態仍然存在。"]);
assert.equal(GameState.current.contextPack.playerConfirmed, true);
assert.equal(GameState.current.characterStatusCustomization.customFields[0].key, "focus");
assert.equal(GameState.current.worldModuleCustomization.customModules[0].id, "oaths");
assert.deepEqual(GameState.current.modules.inventory, [{ name: "短刀" }]);
assert.deepEqual(GameState.current.modules.oaths, [{ name: "守密" }]);
assert.deepEqual(JSON.parse(localStorage.getItem("bao-lab:player-settings")), { displayName: "搬家玩家" });
assert.deepEqual(JSON.parse(localStorage.getItem("bao-lab:narrative-settings-v1")), { styles: ["韓式電影"] });
assert.deepEqual(JSON.parse(localStorage.getItem("bao-lab:player-memory-slots")), [{ id: "portable-memory", text: "不可遺失的記憶", enabled: true }]);

console.log("story flow core test passed");
