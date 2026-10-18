const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "js", "world-state-hook.js"), "utf8");

let baseBehavior = async () => {};
let updateResult = null;
let persistenceHint = false;
let npcActive = false;
let activePanel = "status";
let updateCalls = [];
let renderCalls = [];
let saveCalls = 0;

const owner = { id: "story-a" };
const context = {
  console,
  setTimeout(callback) { callback(); return 0; },
  MutationObserver: class MutationObserver { observe() {} disconnect() {} },
  document: {
    readyState: "complete",
    querySelector(selector) {
      if (selector.startsWith('script[src=')) return {};
      if (selector === '.ui-tab[data-panel="npc"]') {
        return { classList: { contains(value) { return value === "active" && npcActive; } } };
      }
      if (selector === ".ui-tab.active") return { dataset: { panel: activePanel } };
      return null;
    },
    getElementById() { return null; },
    createElement() { return { addEventListener() {}, dataset: {} }; },
    head: { appendChild() {} }
  },
  Chat: { messages: [] },
  GameState: { current: owner },
  WorldStateEngine: {
    async update(config, player, assistant) {
      updateCalls.push({ config, player, assistant });
      return updateResult;
    },
    takePersistenceHint() {
      const value = persistenceHint;
      persistenceHint = false;
      return value;
    }
  },
  Storage: {},
  API: {},
  BAOCharacterStatus: {},
  BAOHelperData: {},
  App: {
    __sendMessageWrapperIds: new Set(),
    config: { displayMode: "text", marker: "config" },
    async sendMessage() { return baseBehavior(); },
    wrapSendMessage(id, wrapper) {
      if (this.__sendMessageWrapperIds.has(id)) return false;
      const next = this.sendMessage.bind(this);
      this.sendMessage = (...args) => wrapper.call(this, next, ...args);
      this.__sendMessageWrapperIds.add(id);
      return true;
    },
    renderUIPanel(panel) { renderCalls.push(panel); },
    saveStory(value) { saveCalls += 1; assert.equal(value, false); }
  }
};
context.window = context;
context.BAOStatusUsageIntegrity = {};
context.BAONativeStatusPacks = { hookScene() {}, paintSceneStatus() {} };

vm.runInNewContext(source, context, { filename: "js/world-state-hook.js" });

assert.equal(context.App.__worldStateHooked, true);
assert.equal(
  context.App.__sendMessageWrapperIds.has("world-state-hook:after-turn"),
  true,
  "world-state hook must install through App.wrapSendMessage"
);

const reset = () => {
  context.GameState.current = owner;
  context.Chat.messages.length = 0;
  updateCalls = [];
  renderCalls = [];
  saveCalls = 0;
  updateResult = null;
  persistenceHint = false;
  npcActive = false;
  activePanel = "status";
  context.App.config = { displayMode: "text", marker: "config" };
  delete context.App.storyTurnReceipts;
};

(async () => {
  reset();
  baseBehavior = async () => {};
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 0, "no completed turn means no world-state update");
  assert.equal(saveCalls, 0);

  reset();
  persistenceHint = true;
  npcActive = true;
  baseBehavior = async () => {
    context.Chat.messages.push(
      { role: "user", content: "玩家行動" },
      { role: "assistant", content: "故事回覆" }
    );
  };
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 1);
  assert.equal(updateCalls[0].config, context.App.config);
  assert.equal(updateCalls[0].player, "玩家行動");
  assert.equal(updateCalls[0].assistant, "故事回覆");
  assert.deepEqual(renderCalls, ["npc"], "active NPC panel should repaint even while helper is waiting");
  assert.equal(saveCalls, 1, "persistence hint should save pending state work");

  reset();
  updateResult = { time: "午夜" };
  context.App.config.displayMode = "ui";
  activePanel = "memory";
  baseBehavior = async () => {
    context.Chat.messages.push(
      { role: "user", content: "第二輪" },
      { role: "assistant", content: "第二輪回覆" }
    );
  };
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(renderCalls, ["memory"]);
  assert.equal(saveCalls, 1, "confirmed world-state changes must persist");

  reset();
  const otherOwner = { id: "story-b" };
  baseBehavior = async () => {
    context.Chat.messages.push(
      { role: "user", content: "切換前" },
      { role: "assistant", content: "切換後" }
    );
    context.GameState.current = otherOwner;
  };
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 0, "switching stories during a request must not update the old/new story by mistake");
  assert.equal(saveCalls, 0);

  reset();
  baseBehavior = async () => {
    context.Chat.messages.push(
      { role: "assistant", content: "角色順序錯誤" },
      { role: "assistant", content: "仍不是完整回合" }
    );
  };
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 0, "only a user+assistant completed turn may update world state");

  reset();
  let release;
  const barrier = new Promise(resolve => { release = resolve; });
  let started = 0;
  baseBehavior = async () => {
    if (++started === 1) await barrier;
    else {
      context.Chat.messages.push(
        { id: 'u-shared', role: 'user', content: 'one turn' },
        { id: 'a-shared', role: 'assistant', content: 'one reply' }
      );
      release();
    }
  };
  await Promise.all([context.App.sendMessage(), context.App.sendMessage()]);
  assert.equal(updateCalls.length, 1, "overlapping continuations cannot dispatch the same completed pair twice");

  reset();
  context.Chat.messages.push({ id: 'old', role: 'assistant', content: 'original source' });
  baseBehavior = async () => {
    context.Chat.messages[0].content = 'edited source';
    context.Chat.messages.push({ role: 'user', content: 'unrelated player' }, { role: 'assistant', content: 'unrelated reply' });
  };
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 0, "legacy fallback cannot dispatch against edited prior history");

  reset();
  context.App.storyTurnReceipts = true;
  baseBehavior = async () => {
    context.Chat.messages.push({ role: 'user', content: 'not committed' }, { role: 'assistant', content: 'unrelated reply' });
  };
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 0, "receipt-capable core must explicitly confirm a completed turn");

  reset();
  context.App.storyTurnReceipts = true;
  const config = context.App.config;
  const receipt = Object.freeze({ kind: 'bao:story-turn', owner, config,
    playerId: 'receipt-u', assistantId: 'receipt-a', playerText: 'actual player', assistantText: 'actual reply',
    isCurrent: () => true });
  baseBehavior = async () => {
    if (!context.Chat.messages.length) context.Chat.messages.push(
      { id: receipt.playerId, role: 'user', content: receipt.playerText },
      { id: receipt.assistantId, role: 'assistant', content: receipt.assistantText },
      { id: 'later-u', role: 'user', content: 'later player' },
      { id: 'later-a', role: 'assistant', content: 'later reply' }
    );
    return receipt;
  };
  const result = await context.App.sendMessage('forwarded');
  assert.equal(result, receipt, "hook must preserve the core completion result");
  assert.equal(updateCalls[0].player, 'actual player');
  assert.equal(updateCalls[0].assistant, 'actual reply', "receipt identifies its pair even after later messages append");
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 1, "replaying the same receipt cannot dispatch again");
  context.Chat.messages[1].content = 'edited reply';
  baseBehavior = async () => ({ ...receipt, assistantId: 'later-a', isCurrent: () => false });
  await context.App.sendMessage();
  assert.equal(updateCalls.length, 1, "invalidated receipt cannot dispatch another tail pair");

  console.log("world-state-after-turn-hook: completed-turn isolation and persistence behavior preserved");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
