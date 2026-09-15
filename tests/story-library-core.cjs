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
  constructor() { this.result = undefined; this.error = null; this.onsuccess = null; this.onerror = null; this.onupgradeneeded = null; }
}

class FakeNames {
  constructor(set) { this.set = set; }
  contains(name) { return this.set.has(name); }
}

class FakeStore {
  constructor(db) { this.db = db; this.indexNames = new FakeNames(db.indexes); }
  createIndex(name) { this.db.indexes.add(name); return {}; }
  getAll() {
    const request = new FakeRequest();
    setTimeout(() => { request.result = [...this.db.records.values()].map(value => structuredClone(value)); request.onsuccess?.(); }, 0);
    return request;
  }
  put(value) { this.db.records.set(value.id, structuredClone(value)); return new FakeRequest(); }
  delete(id) { this.db.records.delete(id); return new FakeRequest(); }
}

class FakeTransaction {
  constructor(db) {
    this.db = db; this.oncomplete = null; this.onerror = null; this.onabort = null; this.error = null;
    setTimeout(() => this.oncomplete?.(), 5);
  }
  objectStore() { return new FakeStore(this.db); }
}

class FakeDB {
  constructor() {
    this.records = new Map(); this.indexes = new Set(); this.created = false; this.onversionchange = null;
    this.objectStoreNames = { contains: () => this.created };
  }
  createObjectStore() { this.created = true; return new FakeStore(this); }
  transaction() { return new FakeTransaction(this); }
  close() {}
}

class FakeIndexedDB {
  constructor() { this.db = new FakeDB(); }
  open() {
    const request = new FakeRequest();
    request.transaction = new FakeTransaction(this.db);
    setTimeout(() => {
      request.result = this.db;
      if (!this.db.created) request.onupgradeneeded?.();
      request.onsuccess?.();
    }, 0);
    return request;
  }
}

global.window = global;
global.localStorage = new MemoryLocalStorage();
global.indexedDB = new FakeIndexedDB();
global.crypto = { randomUUID: (() => { let n = 0; return () => "uuid-" + (++n); })() };

global.App = {
  activeCharacter: { id: "hero", name: "林塵封" },
  startStory() { return true; }
};

global.Storage = {
  _payload: null,
  scrubSecrets(value) {
    const clone = structuredClone(value);
    if (clone?.config?.api) clone.config.api.key = "";
    return clone;
  },
  validateStory(save) { return Boolean(save?.characterId && save?.config && save?.chat && Array.isArray(save.chat.messages)); },
  sanitizeImportedStory(save) {
    const clean = structuredClone(save);
    clean.config.api = Object.assign({}, clean.config.api || {}, { key: "" });
    return clean;
  },
  buildStoryPayload() { return structuredClone(this._payload); },
  saveStory() { return Boolean(this._payload); },
  loadStory() { return this._payload ? structuredClone(this._payload) : null; },
  restoreStory(input) { return !input?.invalid; },
  saveSlot() { return { id: "slot-1" }; }
};

global.BAOStoryTools = {
  startSequel() {
    Storage.saveSlot("backup");
    Storage._payload = makePayload([
      { role: "user", content: "續篇開始" },
      { role: "assistant", content: "新的章節。" }
    ], "續篇摘要");
    Storage.saveStory();
  }
};

function makePayload(messages, summary = "") {
  return {
    schema: "bao-lab-story",
    version: 4,
    savedAt: new Date().toISOString(),
    characterId: "hero",
    characterName: "林塵封",
    character: { id: "hero", name: "林塵封" },
    config: { api: { key: "SECRET", model: "test" }, persona: { name: "玩家" } },
    preferences: {},
    chat: { messages, summary, summarizedUntil: 0, usage: {}, lastStoryPromptTokens: 0 },
    contextPack: null,
    state: { time: "夜晚", location: "舊城" }
  };
}

const code = fs.readFileSync(path.join(__dirname, "..", "js", "story-library.js"), "utf8");
vm.runInThisContext(code, { filename: "js/story-library.js" });

(async () => {
  await BAOStoryLibrary.open();
  BAOStoryLibrary.install();

  Storage._payload = makePayload([
    { id: "msg-first-user", role: "user", content: "第一句" },
    { id: "msg-first-assistant", role: "assistant", content: "第一章回覆" }
  ], "第一章摘要");

  App.startStory();
  const built = Storage.buildStoryPayload();
  Storage._payload = built;
  assert.equal(Storage.saveStory(), true);
  await BAOStoryLibrary.flush();

  const firstRefs = BAOStoryLibrary.refs();
  assert.ok(firstRefs.storyId);
  assert.ok(firstRefs.chapterId);
  assert.equal(await BAOStoryLibrary.flush(), true);

  const refsBeforeInvalidRestore = BAOStoryLibrary.refs();
  assert.equal(Storage.restoreStory({ invalid: true, _library: { storyId: "broken-story", chapterId: "broken-chapter" } }), false);
  assert.deepEqual(BAOStoryLibrary.refs(), refsBeforeInvalidRestore);

  let stories = await BAOStoryLibrary.listStories();
  assert.equal(stories.length, 1);
  assert.equal(stories[0].chapterCount, 1);
  assert.equal(stories[0].characterName, "林塵封");

  const renamedStory = await BAOStoryLibrary.renameStory(firstRefs.storyId, "舊城夜談");
  assert.equal(renamedStory.title, "舊城夜談");
  const renamedChapter = await BAOStoryLibrary.renameChapter(firstRefs.storyId, firstRefs.chapterId, "序章");
  assert.equal(renamedChapter.label, "序章");
  assert.equal(BAOStoryLibrary.refs().chapterLabel, "序章");
  assert.equal(Storage.saveStory(), true);
  await BAOStoryLibrary.flush();
  stories = await BAOStoryLibrary.listStories();
  assert.equal(stories[0].title, "舊城夜談");

  const restored = await BAOStoryLibrary.reconstruct(firstRefs.storyId, firstRefs.chapterId);
  assert.equal(restored.chat.messages.length, 2);
  assert.equal(restored.chat.messages[1].content, "第一章回覆");
  assert.deepEqual(restored.chat.messages.map(message => message.id), ["msg-first-user", "msg-first-assistant"]);
  assert.equal(restored.config.api.key, "");
  assert.equal(restored._library.storyId, firstRefs.storyId);

  Storage._payload = makePayload([
    { id: "msg-first-user", role: "user", content: "第一句" },
    { id: "msg-first-assistant", role: "assistant", content: "第一章回覆" },
    { id: "msg-source-user", role: "user", content: "沿主線前進" },
    { id: "msg-source-assistant", role: "assistant", content: "主線來到清晨" }
  ], "主線最新摘要");
  Storage._payload.state = { time: "清晨", location: "城門", canon: { facts: ["城門已開"] } };
  Storage._payload.chat.usage = { promptTokens: 42, completionTokens: 18 };
  assert.equal(Storage.saveStory(), true);
  await BAOStoryLibrary.flush();

  const branch = await BAOStoryLibrary.createBranch("msg-first-assistant", "拒絕合作線");
  const branchRefs = BAOStoryLibrary.refs();
  assert.equal(branchRefs.parentChapterId, firstRefs.chapterId);
  assert.equal(branchRefs.branchPointMessageId, "msg-first-assistant");
  assert.equal(branch.chat.messages.length, 2);
  assert.equal(branch.state.time, "夜晚");
  assert.deepEqual(branch.chat.usage, {});
  assert.equal(branch.config.api.key, "");

  Storage._payload = structuredClone(branch);
  Storage._payload.state.location = "只存在於分支的碼頭";
  Storage._payload.chat.messages.push(
    { id: "msg-branch-user", role: "user", content: "走另一條路" },
    { id: "msg-branch-assistant", role: "assistant", content: "分支抵達碼頭" }
  );
  assert.equal(Storage.saveStory(), true);
  await BAOStoryLibrary.flush();

  const sourceAfterBranch = await BAOStoryLibrary.reconstruct(firstRefs.storyId, firstRefs.chapterId);
  assert.equal(sourceAfterBranch.chat.messages.length, 4);
  assert.equal(sourceAfterBranch.state.location, "城門");
  const branchAfterSave = await BAOStoryLibrary.reconstruct(firstRefs.storyId, branchRefs.chapterId);
  assert.equal(branchAfterSave.chat.messages.length, 4);
  assert.equal(branchAfterSave.state.location, "只存在於分支的碼頭");

  assert.equal(Storage.restoreStory(sourceAfterBranch), true);
  assert.equal(BAOStoryLibrary.refs().chapterId, firstRefs.chapterId);
  assert.deepEqual(await BAOStoryLibrary.deleteBranch(firstRefs.storyId, branchRefs.chapterId), { deleted: 1 });
  assert.equal((await BAOStoryLibrary.listChapters(firstRefs.storyId)).length, 1);
  Storage._payload = sourceAfterBranch;

  BAOStoryTools.startSequel({ playerConfirmed: true });
  await BAOStoryLibrary.flush();

  const secondRefs = BAOStoryLibrary.refs();
  assert.equal(secondRefs.storyId, firstRefs.storyId);
  assert.notEqual(secondRefs.chapterId, firstRefs.chapterId);

  const chapters = await BAOStoryLibrary.listChapters(firstRefs.storyId);
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].label, "序章");
  assert.equal(chapters[1].label, "續篇");
  assert.equal(await BAOStoryLibrary.deleteChapter(firstRefs.storyId, secondRefs.chapterId), false);
  assert.equal(await BAOStoryLibrary.deleteChapter(firstRefs.storyId, firstRefs.chapterId), true);
  const chaptersAfterDelete = await BAOStoryLibrary.listChapters(firstRefs.storyId);
  assert.equal(chaptersAfterDelete.length, 1);
  assert.equal(chaptersAfterDelete[0].chapterId, secondRefs.chapterId);

  const sequel = await BAOStoryLibrary.reconstruct(firstRefs.storyId, secondRefs.chapterId);
  assert.equal(sequel.chat.messages[0].content, "續篇開始");
  assert.equal(sequel.chat.summary, "續篇摘要");

  App.startStory();
  const thirdRefs = BAOStoryLibrary.refs();
  assert.notEqual(thirdRefs.storyId, firstRefs.storyId);
  assert.equal(await BAOStoryLibrary.deleteStory(firstRefs.storyId), true);
  stories = await BAOStoryLibrary.listStories();
  assert.equal(stories.some(story => story.storyId === firstRefs.storyId), false);

  assert.equal(code.includes("if (!restored) return false"), true);
  assert.equal(code.includes("return Boolean(database)"), true);
  console.log("story library core test passed");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
