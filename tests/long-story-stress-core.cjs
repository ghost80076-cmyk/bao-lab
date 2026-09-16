const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class MemoryLocalStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

class FakeRequest {
  constructor() {
    this.result = undefined;
    this.error = null;
    this.onsuccess = null;
    this.onerror = null;
    this.onupgradeneeded = null;
    this.onblocked = null;
    this.transaction = null;
  }
}

class FakeNames {
  constructor(set) { this.set = set; }
  contains(name) { return this.set.has(name); }
}

class FakeStore {
  constructor(db) {
    this.db = db;
    this.indexNames = new FakeNames(db.indexes);
  }
  createIndex(name) { this.db.indexes.add(name); return {}; }
  getAll() {
    const request = new FakeRequest();
    setTimeout(() => {
      request.result = [...this.db.records.values()].map(value => structuredClone(value));
      request.onsuccess?.();
    }, 0);
    return request;
  }
  put(value) {
    this.db.records.set(value.id, structuredClone(value));
    return new FakeRequest();
  }
  delete(id) {
    this.db.records.delete(id);
    return new FakeRequest();
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    setTimeout(() => this.oncomplete?.(), 2);
  }
  objectStore() { return new FakeStore(this.db); }
}

class FakeDB {
  constructor() {
    this.records = new Map();
    this.indexes = new Set();
    this.created = false;
    this.onversionchange = null;
    this.objectStoreNames = { contains: () => this.created };
  }
  createObjectStore() { this.created = true; return new FakeStore(this); }
  transaction() { return new FakeTransaction(this); }
  close() {}
}

class FakeIndexedDB {
  constructor() { this.databases = new Map(); }
  open(name) {
    const request = new FakeRequest();
    let db = this.databases.get(name);
    const isNew = !db;
    if (!db) {
      db = new FakeDB();
      this.databases.set(name, db);
    }
    request.transaction = new FakeTransaction(db);
    setTimeout(() => {
      request.result = db;
      if (isNew) request.onupgradeneeded?.();
      setTimeout(() => request.onsuccess?.(), 0);
    }, 0);
    return request;
  }
}

const startedAt = Date.now();
global.window = global;
global.localStorage = new MemoryLocalStorage();
global.indexedDB = new FakeIndexedDB();
global.addEventListener = () => {};
global.document = {
  querySelector() { return null; },
  querySelectorAll() { return []; },
  getElementById() { return null; },
  createElement() {
    return {
      append() {}, appendChild() {}, remove() {}, click() {},
      style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } }
    };
  },
  head: { appendChild() {} },
  body: { appendChild() {} }
};
global.alert = () => {};
global.confirm = () => true;
global.API = { send: async () => ({ text: "{}", usage: {} }) };
global.CharacterEngine = null;
global.BAOPlayerSettings = null;
global.BAONarrativeSettings = null;
global.BAOMemoryWorkbench = null;
global.BAOCharacterStatus = null;
global.BAOWorldModules = null;
global.BAOHelperData = { memoryRules: "只記錄明確事實。", memoryText: value => String(value || "") };

const character = {
  id: "stress-hero",
  name: "壓測角色",
  system_prompt: "保持世界一致性。",
  greeting: "開始。",
  initial_state: { time: "第 0 天", location: "起點", events: [], npcs: [], modules: {} }
};

global.App = {
  activeCharacter: character,
  characters: [character],
  config: {
    demoMode: false,
    narrativeMode: "world",
    displayMode: "ui",
    persona: { name: "壓測玩家" },
    api: { key: "LONG-STORY-SECRET", model: "synthetic-model", baseUrl: "https://example.invalid", protocol: "openai" },
    memory: {
      mode: "smart",
      maxRounds: 20,
      maxContext: 64000,
      summaryInterval: 4,
      summaryChunkChars: 24000,
      summaryApi: { key: "LONG-MEMORY-SECRET", model: "memory-model" }
    },
    cost: { stateApi: { key: "LONG-STATE-SECRET", model: "state-model" } }
  },
  escapeHTML: value => String(value ?? ""),
  escapeAttr: value => String(value ?? ""),
  buildSystemPrompt() { return "BASE"; },
  renderChatShell() {},
  showView() {},
  startStory() { return true; },
  saveStory() { return Storage.saveStory(); }
};

const run = file => vm.runInThisContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), { filename: file });
run("js/state.js");
run("js/chat.js");
run("js/storage.js");
run("js/story-tools.js");
run("js/story-library.js");

const detail = index => {
  const marker = String(index).padStart(4, "0");
  return `第 ${marker} 輪；場景細節 ${"石板路、風聲、遠處燈火與人物動作。".repeat(7)}；唯一標記 ROUND-${marker}`;
};

const appendRounds = (from, to) => {
  for (let round = from; round <= to; round += 1) {
    Chat.add("user", `玩家輸入 ${detail(round)}`);
    Chat.add("assistant", `角色回覆 ${detail(round)} 因果延續 CAUSE-${round - 1}->${round}`);
  }
};

const checkpoint = async round => {
  GameState.current.time = `第 ${Math.ceil(round / 100)} 天`;
  GameState.current.location = `區域-${round}`;
  GameState.current.events = [`抵達區域-${round}`, `完成第 ${round} 輪`];
  Chat.summary = `截至第 ${round} 輪的長期摘要；保留承諾、人物關係與未完成事件。`;
  Chat.summarizedUntil = Math.max(0, Chat.messages.length - 40);
  assert.equal(Storage.saveStory(), true);
  await Storage.flush();
  await BAOStoryLibrary.flush();
};

(async () => {
  await Storage.ready();
  await BAOStoryLibrary.open();
  BAOStoryLibrary.install();
  GameState.create(character, App.config);
  App.startStory();

  appendRounds(1, 300);
  await checkpoint(300);
  const refs = BAOStoryLibrary.refs();
  assert.ok(refs.storyId && refs.chapterId, "story library refs are established");

  appendRounds(301, 1000);
  await checkpoint(1000);
  const branchPointId = Chat.messages[1999].id;
  assert.ok(branchPointId, "1,000-round checkpoint has a stable assistant message id");

  appendRounds(1001, 3000);
  await checkpoint(3000);

  assert.equal(Chat.messages.length, 6000, "3,000 rounds retain all 6,000 messages in the active story");
  const uniqueIds = new Set(Chat.messages.map(message => message.id));
  assert.equal(uniqueIds.size, 6000, "all long-story message ids stay unique");
  assert.match(Chat.messages[0].content, /ROUND-0001/);
  assert.match(Chat.messages[1999].content, /ROUND-1000/);
  assert.match(Chat.messages[5999].content, /ROUND-3000/);

  const autosave = Storage.loadStory();
  assert.equal(autosave.chat.messages.length, 6000, "IndexedDB autosave keeps the entire long story");
  assert.equal(autosave.state.location, "區域-3000");
  const autosaveJSON = JSON.stringify(autosave);
  assert.equal(autosaveJSON.includes("LONG-STORY-SECRET"), false, "main API key never enters long-story persistence");
  assert.equal(autosaveJSON.includes("LONG-MEMORY-SECRET"), false, "memory API key never enters long-story persistence");
  assert.equal(autosaveJSON.includes("LONG-STATE-SECRET"), false, "state API key never enters long-story persistence");

  const root = await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId);
  assert.equal(root.chat.messages.length, 6000, "Story Library reconstructs all 3,000 rounds");
  assert.equal(root.chat.messages[0].id, Chat.messages[0].id);
  assert.equal(root.chat.messages[1999].id, branchPointId);
  assert.equal(root.chat.messages[5999].id, Chat.messages[5999].id);
  assert.equal(root.state.location, "區域-3000");
  assert.equal(root.config.api.key, "");

  const plan = BAOStoryTools.organizationPlan(Chat.messages, { maxTokens: 4000 });
  assert.ok(plan.chunkCount > 40, "3,000 rounds are divided into many bounded Context Pack chunks");
  assert.ok(plan.mergeCalls > 1, "large Context Pack plans include hierarchical merge calls");
  assert.equal(plan.chunks.flat().length, 6000, "Context Pack chunking does not drop long-story messages");
  assert.equal(plan.totalCalls, plan.chunkCount + plan.mergeCalls);
  assert.ok(plan.chunks.every(chunk => chunk.reduce((sum, item) => sum + BAOStoryTools.tokenEstimate(item.content) + 8, 0) <= 4000));

  Chat.lastStoryPromptTokens = 50000;
  const context = await Chat.context(App.config);
  assert.equal(context[0].role, "system", "smart memory keeps the long-term summary in context");
  assert.match(context[0].content, /長期記憶摘要/);
  assert.ok(context.length < 80, "smart memory prevents thousands of rounds from flooding one model request");
  assert.ok(Chat.contextGuard.recentRounds < App.config.memory.maxRounds, "context pressure reduces recent raw rounds");

  const branch = await BAOStoryLibrary.createBranch(branchPointId, "第 1000 輪分支");
  const branchRefs = BAOStoryLibrary.refs();
  assert.equal(branch.chat.messages.length, 2000, "branch reconstructs exactly the first 1,000 rounds");
  assert.equal(branch.chat.messages.at(-1).id, branchPointId);
  assert.equal(branch.state.location, "區域-1000", "branch restores the state captured at the old checkpoint");
  assert.equal(branch.config.api.key, "");
  assert.equal(branchRefs.parentChapterId, refs.chapterId);

  const rootAfterBranch = await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId);
  const branchAfterCreate = await BAOStoryLibrary.reconstruct(refs.storyId, branchRefs.chapterId);
  assert.equal(rootAfterBranch.chat.messages.length, 6000, "creating a deep branch does not mutate the 3,000-round root");
  assert.equal(rootAfterBranch.state.location, "區域-3000");
  assert.equal(branchAfterCreate.chat.messages.length, 2000);
  assert.equal(branchAfterCreate.state.location, "區域-1000");

  const records = await BAOStoryLibrary.allRecords();
  const libraryJSON = JSON.stringify(records);
  assert.equal(libraryJSON.includes("LONG-STORY-SECRET"), false, "Story Library records contain no main API key");
  assert.equal(libraryJSON.includes("LONG-MEMORY-SECRET"), false, "Story Library records contain no memory API key");
  assert.equal(libraryJSON.includes("LONG-STATE-SECRET"), false, "Story Library records contain no state API key");

  const payloadBytes = Buffer.byteLength(JSON.stringify(root), "utf8");
  assert.ok(payloadBytes > 1_000_000, "stress payload is large enough to exercise multi-megabyte story persistence");

  console.log(JSON.stringify({
    test: "long-story-stress",
    rounds: 3000,
    messages: Chat.messages.length,
    payloadBytes,
    contextChunks: plan.chunkCount,
    mergeCalls: plan.mergeCalls,
    storyLibraryRecords: records.length,
    rootMessages: rootAfterBranch.chat.messages.length,
    branchMessages: branchAfterCreate.chat.messages.length,
    elapsedMs: Date.now() - startedAt
  }));
})().catch(error => {
  console.error(error);
  process.exit(1);
});
