const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

global.window = global;
global.document = { querySelectorAll() { return []; } };
global.confirm = () => true;
global.GameState = { current: {} };
let messageSequence = 0;
global.Chat = {
  messages: [
    { role: "user", content: "我去找艾琳，詢問北塔的封印。" },
    { role: "assistant", content: "艾琳承認她昨夜見過守塔人。" }
  ],
  ensureMessageIds() {
    this.messages = this.messages.map(message => ({ ...message, id: message.id || `msg-test-${++messageSequence}` }));
    return this.messages;
  }
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
global.addEventListener = () => {};
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js/chat.js'), 'utf8') + '\nObject.assign(Chat, globalThis.Chat); globalThis.Chat = Chat;');
run("js/episodic-memory-core.js");
run("js/canon-workbench.js");

const normalized = BAOCanonWorkbench.normalizeCanon({ notebooks: [
  { title: "世界硬規則", category: "world", content: "月蝕會關閉城門。", locations: "北塔、城門", factions: ["守塔人"] },
  { title: "衝突證據", category: "conflicts", content: "日期不一致。" }
] });
assert.equal(normalized.version, 3);
assert.equal(normalized.notebooks[0].tier, "core");
assert.equal(normalized.notebooks[1].tier, "ui");
assert.deepEqual(normalized.notebooks[0].locations, ["北塔", "城門"]);
assert.deepEqual(normalized.notebooks[0].factions, ["守塔人"]);
assert.ok(BAOCanonWorkbench.searchTerms("我去找艾琳").includes("艾琳"));

GameState.current.canon = BAOCanonWorkbench.normalizeCanon({ notebooks: [
  { title: "月蝕規則", category: "world", tier: "core", certainty: "confirmed", content: "月蝕會關閉城門。" },
  { title: "艾琳動向", category: "current", tier: "relevant", certainty: "confirmed", content: "她正在值夜。", characters: ["艾琳"], locations: ["北塔"] },
  { title: "內部證據", category: "conflicts", tier: "ui", certainty: "uncertain", content: "日期有衝突。" },
  { title: "角色秘密", category: "knowledge", tier: "relevant", certainty: "confirmed", content: "秘密口令是星河。" },
  { title: "全域知情檔", category: "knowledge", tier: "core", certainty: "confirmed", content: "秘密寶物埋在枯井。" },
  { title: "艾琳限定資訊", category: "current", tier: "core", certainty: "confirmed", knowledge_scope: "actors", known_by: ["艾琳"], content: "只有艾琳得知黑曜密令。" }
] });
const prompt = App.buildSystemPrompt();
assert.match(prompt, /Canon Core · 玩家已確認/);
assert.match(prompt, /月蝕會關閉城門/);
assert.match(prompt, /本輪相關 Canon/);
assert.match(prompt, /她正在值夜/);
assert.doesNotMatch(prompt, /日期有衝突/);
assert.doesNotMatch(prompt, /秘密口令是星河|秘密寶物埋在枯井/, "unscoped actor secrets must never be added globally");
assert.doesNotMatch(prompt, /黑曜密令/, "no known cast must not receive scoped Canon");
App.config.narrativeMode = "immersive";
App.activeCharacter.name = "艾琳";
assert.match(App.buildSystemPrompt(), /黑曜密令/, "only known character receives private Canon");
GameState.current.npcs = [{ name: "守衛", presence: "present" }];
assert.doesNotMatch(App.buildSystemPrompt(), /黑曜密令/, "multi-NPC prompt cannot mix one character's secrets");
GameState.current.npcs = [{ name: "守衛", presence: "away" }];
assert.match(App.buildSystemPrompt(), /黑曜密令/, "absent NPC must not block known speaker");
GameState.current.npcs = [];
App.activeCharacter.name = "陌生人";
assert.doesNotMatch(App.buildSystemPrompt(), /黑曜密令/, "unrelated speaker has no access");
assert.deepEqual(BAOCanonWorkbench.normalizeCanon(GameState.current.canon).notebooks.at(-1).known_by, ["艾琳"]);

const referencedMessages = Chat.ensureMessageIds();
assert.equal(BAOCanonWorkbench.processedStart({ lastProcessedMessageId: referencedMessages[0].id, lastProcessedMessageCount: 0 }, referencedMessages), 1);
assert.equal(BAOCanonWorkbench.processedStart({ lastProcessedMessageId: "missing", lastProcessedMessageCount: 1 }, referencedMessages), 1);
const oversizedChunks = BAOCanonWorkbench.chunkMessages([{ id: "msg-oversized", role: "assistant", content: "很長的回覆。".repeat(200) }], 0, 100);
assert.ok(oversizedChunks.length > 1);
assert.equal(oversizedChunks.every(chunk => chunk.includes("msg-oversized")), true);

(async () => {
  delete GameState.current.canon;
  await BAOCanonWorkbench.run("full");
  assert.equal(API.calls.length, 2, "one extraction call plus one merge call expected");
  assert.equal(API.calls.every(call => call.config.__memoryTask === true), true);
  assert.equal(API.calls.every(call => call.config.__responseSchema?.properties?.notebooks), true, "Canon requests must carry their own Gemini schema");
  assert.equal(GameState.current.canon, undefined, "AI output must not become official Canon before player confirmation");
  assert.equal(GameState.current.canonDraft.notebooks[0].title, "艾琳與北塔");
  assert.equal(GameState.current.canonDraft.lastProcessedMessageCount, Chat.messages.length);
  assert.equal(GameState.current.canonDraft.lastProcessedMessageId, Chat.messages.at(-1).id);
  const processedId = GameState.current.canonDraft.lastProcessedMessageId;
  const processedCount = GameState.current.canonDraft.lastProcessedMessageCount;
  Chat.messages.push({ id: "msg-after-draft", role: "user", content: "草稿建立後的新訊息" });
  const editedDraft = BAOCanonWorkbench.readEditor({ querySelectorAll() { return []; } });
  assert.equal(editedDraft.lastProcessedMessageId, processedId, "confirming an older draft must not consume newer messages");
  assert.equal(editedDraft.lastProcessedMessageCount, processedCount);

  API.calls = [];
  GameState.current = {};
  Chat.messages = Array.from({ length: 5 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `${index}-${"長篇證據".repeat(5000)}` }));
  assert.equal(BAOCanonWorkbench.estimate("full").chunks, 5);
  assert.equal(BAOCanonWorkbench.estimate("full").calls, 7, "five extracts, one intermediate merge and one final merge expected");
  await BAOCanonWorkbench.run("full");
  assert.equal(API.calls.length, 7);
  assert.ok(API.calls.some(call => call.messages[1].content.includes("階層式合併的中間層")));
  assert.match(API.calls[0].messages[1].content, /msg-test-/);
  const priorDraft = GameState.current.canonDraft;
  const send = API.send;
  for (const finishReason of ['MAX_TOKENS', 'length', 'content_filter']) {
    API.send = async (...args) => ({ ...await send.apply(API, args), finishReason });
    await assert.rejects(BAOCanonWorkbench.run('full'), /截斷|阻擋/);
    assert.equal(GameState.current.canonDraft, priorDraft, 'even valid JSON with an incomplete finish must not replace the existing draft');
  }
  console.log("canon workbench core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
