const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

global.window = global;
global.document = {
  addEventListener() {},
  querySelector() { return null; },
  querySelectorAll() { return []; },
  body: null
};
global.alert = () => {};
global.confirm = () => true;
global.Storage = { clone: value => structuredClone(value) };
global.GameState = { current: {} };
global.App = {
  activeCharacter: { id: "hero", name: "角色" },
  config: { api: { key: "SECRET", model: "main-model" }, memory: { summaryModel: "memory-model" } },
  saveCount: 0,
  saveStory() { this.saveCount += 1; }
};
global.Chat = {
  messages: [
    { role: "user", content: "U1" }, { role: "assistant", content: "A1" },
    { role: "user", content: "U2" }, { role: "assistant", content: "A2" },
    { role: "user", content: "U3" }, { role: "assistant", content: "A3" }
  ]
};

const normalizePack = input => {
  const raw = input && typeof input === "object" ? input : {};
  return {
    schema: "bao-lab-context-pack",
    title: String(raw.title || "測試 Pack"),
    source: structuredClone(raw.source || {}),
    summary: String(raw.summary || ""),
    importantEvents: Array.isArray(raw.importantEvents) ? raw.importantEvents.map(String) : [],
    relationships: Array.isArray(raw.relationships) ? raw.relationships.map(String) : [],
    characterStatuses: structuredClone(raw.characterStatuses || {}),
    worldState: structuredClone(raw.worldState || {}),
    modules: structuredClone(raw.modules || {}),
    openThreads: Array.isArray(raw.openThreads) ? raw.openThreads.map(String) : [],
    recentDialogue: Array.isArray(raw.recentDialogue) ? structuredClone(raw.recentDialogue) : [],
    playerConfirmed: Boolean(raw.playerConfirmed)
  };
};

global.BAOStoryTools = {
  createPack(messages, source = {}) {
    return normalizePack({
      title: "測試 Pack",
      source: Object.assign({ type: "current-story", messageCount: messages.length }, source),
      recentDialogue: messages.slice(-12),
      playerConfirmed: false
    });
  },
  normalizePack,
  confirmationSignature(input) {
    const pack = normalizePack(input);
    return JSON.stringify([pack.title, pack.summary, pack.importantEvents, pack.relationships, pack.characterStatuses, pack.worldState, pack.modules, pack.openThreads, pack.recentDialogue]);
  },
  organizationPlan(messages) {
    const chunks = [messages.slice(0, 2), messages.slice(2, 4), messages.slice(4, 6)];
    return { chunks, chunkCount: 3, mergeCalls: 1, totalCalls: 4, estimatedInputTokens: 100 };
  },
  parseExternalText() { throw new Error("not used"); },
  resolveImportedMessages(parsed) { return parsed.messages || []; }
};

const calls = [];
let failOnCall = 2;
global.API = {
  async send(config, messages) {
    calls.push({ config: structuredClone(config), prompt: messages[1].content });
    if (calls.length === failOnCall) throw new Error("simulated network loss");
    const index = calls.length;
    return {
      text: JSON.stringify({
        summary: "fragment-" + index,
        importantEvents: ["event-" + index],
        relationships: [],
        characterStatuses: {},
        worldState: {},
        modules: {},
        openThreads: []
      })
    };
  }
};

const source = fs.readFileSync(require("node:path").join(__dirname, "..", "js/context-pack-resume.js"), "utf8");
vm.runInThisContext(source, { filename: "context-pack-resume.js" });

const currentSource = BAOContextPackResume.makeSource(Chat.messages, { type: "current-story" });
assert.equal(currentSource.kind, "current-story");
assert.equal(Object.hasOwn(currentSource, "messages"), false);
assert.deepEqual(BAOContextPackResume.resolveSource(currentSource), Chat.messages);
Chat.messages.push({ role: "user", content: "new append" });
assert.deepEqual(BAOContextPackResume.resolveSource(currentSource), Chat.messages.slice(0, 6));
const originalFirst = Chat.messages[0].content;
Chat.messages[0].content = "changed";
assert.equal(BAOContextPackResume.resolveSource(currentSource), null);
Chat.messages[0].content = originalFirst;

const externalSource = BAOContextPackResume.makeSource(Chat.messages.slice(0, 4), { type: "external", platform: "import.json" });
assert.equal(externalSource.kind, "external");
assert.equal(externalSource.messages.length, 4);
assert.deepEqual(BAOContextPackResume.resolveSource(externalSource), Chat.messages.slice(0, 4));

const sourceMessages = Chat.messages.slice(0, 6);
const pack = BAOContextPackResume.beginDraft(sourceMessages, { type: "current-story", platform: "BAO/LAB" });
assert.ok(GameState.current.contextPackDraft);
assert.ok(GameState.current.contextPackDraftResume);
assert.equal(JSON.stringify(GameState.current.contextPackDraftResume).includes("SECRET"), false);

(async () => {
  await assert.rejects(
    BAOContextPackResume.organizeDraft(pack, sourceMessages, () => {}, { skipConfirm: true }),
    /simulated network loss/
  );
  assert.equal(GameState.current.contextPackDraftResume.work.nextChunk, 1);
  assert.equal(GameState.current.contextPackDraftProgress.phase, "chunk");
  assert.equal(GameState.current.contextPackDraftProgress.completed, 1);
  assert.match(calls[0].prompt, /第 1／3 段/);
  assert.match(calls[1].prompt, /第 2／3 段/);

  const persisted = structuredClone(GameState.current);
  GameState.current = persisted;
  failOnCall = -1;
  const beforeRetry = calls.length;
  const result = await BAOContextPackResume.organizeDraft(
    GameState.current.contextPackDraft,
    BAOContextPackResume.resolveSource(GameState.current.contextPackDraftResume.source),
    () => {},
    { skipConfirm: true }
  );
  const retryPrompts = calls.slice(beforeRetry).map(item => item.prompt);
  assert.equal(retryPrompts.length, 3);
  assert.equal(retryPrompts.some(prompt => /第 1／3 段/.test(prompt)), false);
  assert.equal(retryPrompts.filter(prompt => /第 2／3 段/.test(prompt)).length, 1);
  assert.equal(retryPrompts.filter(prompt => /第 3／3 段/.test(prompt)).length, 1);
  assert.equal(retryPrompts.filter(prompt => /待合併草稿/.test(prompt)).length, 1);
  assert.equal(GameState.current.contextPackDraftResume.work, null);
  assert.equal(GameState.current.contextPackDraftProgress, undefined);
  assert.equal(result.playerConfirmed, false);
  assert.ok(result.summary);
  console.log("Context Pack resumable organization core checks passed.");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
