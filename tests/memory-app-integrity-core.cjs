const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const input = { value: "" };
const memoryLabel = { textContent: "" };
const stream = {
  children: [],
  lastElementChild: null,
  scrollHeight: 0,
  scrollTop: 0,
  insertAdjacentHTML() {
    const node = { removed: false, remove() { this.removed = true; } };
    this.lastElementChild = node;
    this.children.push(node);
  },
  appendChild(node) { this.children.push(node); this.lastElementChild = node; }
};
global.window = global;
global.document = {
  getElementById(id) {
    if (id === "user-input") return input;
    if (id === "chat-stream") return stream;
    if (id === "usage-memory") return memoryLabel;
    return null;
  },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement() { return { className: "", innerHTML: "" }; }
};
global.addEventListener = () => {};
global.window.addEventListener = () => {};
global.alert = () => {};
global.BAOCreditsPilot = null;

global.Chat = {
  messages: [],
  memoryHealth: { phase: "idle" },
  reset() { this.messages = []; this.memoryHealth = { phase: "idle" }; },
  add(role, content) {
    const message = { id: "m-" + (this.messages.length + 1), role, content };
    this.messages.push(message);
    return message;
  },
  renderTurnUsage() {},
  memoryStatus() { return "ok"; },
  afterTurnCalls: 0,
  async afterTurn() { this.afterTurnCalls += 1; }
};
global.GameState = {
  current: null,
  create(character, config) { this.current = { characterId: character.id, config }; },
  addEvent() {}
};
global.Storage = { saveStory() { return true; } };
global.API = { async send() { return { text: "主要故事回覆", usage: { input_tokens: 20, output_tokens: 10 } }; } };

const source = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
vm.runInThisContext(`${source}\nglobalThis.__App = App;`, { filename: "js/app.js" });
const App = global.__App;
App.activeCharacter = { id: "hero", name: "角色", greeting: "這是正式開場白。" };
App.collectConfig = () => ({
  narrativeMode: "immersive",
  displayMode: "text",
  persona: { name: "玩家" },
  api: { key: "test-key", model: "test-model", baseUrl: "https://example.test", protocol: "openai" },
  memory: { mode: "smart", maxRounds: 20 }
});
App.renderChatShell = () => {};
App.showView = () => {};
App.saveStory = () => true;

App.startStory();
assert.deepEqual(Chat.messages.map(message => [message.role, message.content]), [
  ["assistant", "這是正式開場白。"]
], "new-story greeting must be a real assistant history message");

App.buildMessages = async () => [{ role: "user", content: input.value }];
input.value = "繼續。";
(async () => {
  await App.sendMessage();
  assert.equal(Chat.afterTurnCalls, 1, "core App.sendMessage must run memory post-turn without World State Hook");
  assert.deepEqual(Chat.messages.slice(-2).map(message => message.role), ["user", "assistant"]);
  assert.equal(Chat.messages.at(-1).content, "主要故事回覆");

  Chat.afterTurn = async () => {
    Chat.afterTurnCalls += 1;
    throw new Error("memory helper failed");
  };
  input.value = "再繼續。";
  await App.sendMessage();
  assert.equal(Chat.messages.at(-1).content, "主要故事回覆", "memory helper failure must not discard a paid main-model reply");
  assert.equal(Chat.memoryHealth.phase, "failed");
  assert.match(Chat.memoryHealth.message, /memory helper failed/);
  const latestAssistantNode = stream.children.at(-1);
  assert.doesNotMatch(String(latestAssistantNode?.innerHTML || ""), /連線失敗/, "post-turn memory failure must not be shown as a main chat failure");

  console.log("memory app integrity core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
