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

class FakeIndexNames {
  constructor(set) { this.set = set; }
  contains(name) { return this.set.has(name); }
}

class FakeStore {
  constructor(map, indexSet) {
    this.map = map;
    this.indexNames = new FakeIndexNames(indexSet);
  }
  createIndex(name) { this.indexNames.set.add(name); return {}; }
  getAll() {
    const request = new FakeRequest();
    setTimeout(() => {
      request.result = [...this.map.values()].map(value => structuredClone(value));
      request.onsuccess?.();
    }, 0);
    return request;
  }
  put(value) {
    this.map.set(value.id, structuredClone(value));
    const request = new FakeRequest();
    setTimeout(() => {
      request.result = value.id;
      request.onsuccess?.();
    }, 0);
    return request;
  }
  delete(id) {
    this.map.delete(id);
    const request = new FakeRequest();
    setTimeout(() => {
      request.result = undefined;
      request.onsuccess?.();
    }, 0);
    return request;
  }
}

class FakeTransaction {
  constructor(db) {
    this.db = db;
    this.oncomplete = null;
    this.onerror = null;
    this.onabort = null;
    this.error = null;
    setTimeout(() => this.oncomplete?.(), 5);
  }
  objectStore() { return new FakeStore(this.db.records, this.db.indexes); }
}

class FakeDB {
  constructor() {
    this.records = new Map();
    this.indexes = new Set();
    this.created = false;
    this.objectStoreNames = { contains: name => this.created && name === "stories" };
    this.onversionchange = null;
  }
  createObjectStore() {
    this.created = true;
    return new FakeStore(this.records, this.indexes);
  }
  transaction() { return new FakeTransaction(this); }
  close() {}
}

class FakeIndexedDB {
  constructor() { this.dbs = new Map(); }
  open(name) {
    const request = new FakeRequest();
    setTimeout(() => {
      let db = this.dbs.get(name);
      const isNew = !db;
      if (!db) {
        db = new FakeDB();
        this.dbs.set(name, db);
      }
      request.result = db;
      if (isNew) {
        request.transaction = new FakeTransaction(db);
        request.onupgradeneeded?.();
      }
      setTimeout(() => request.onsuccess?.(), 0);
    }, 0);
    return request;
  }
}

const localStorage = new MemoryLocalStorage();
const indexedDB = new FakeIndexedDB();
const validSave = (label, savedAt = "2026-09-14T00:00:00.000Z") => ({
  schema: "bao-lab-story",
  version: 4,
  label,
  savedAt,
  characterId: "hero",
  characterName: "Hero",
  character: { id: "hero", name: "Hero" },
  config: { api: { model: "m", baseUrl: "x", key: "SECRET" }, memory: {} },
  preferences: {},
  chat: {
    messages: [{ role: "user", content: "hi" }],
    summary: "",
    summarizedUntil: 0,
    usage: {},
    lastStoryPromptTokens: 0
  },
  state: {},
  contextPack: null
});

const legacyAuto = validSave("legacy-auto");
const legacySlot = { ...validSave("legacy-slot", "2026-09-14T01:00:00.000Z"), id: "slot-1" };
localStorage.setItem("bao-lab:story:autosave", JSON.stringify(legacyAuto));
localStorage.setItem("bao-lab:story:slots", JSON.stringify([legacySlot]));

function makeContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    structuredClone,
    Promise,
    Date,
    Math,
    JSON,
    Blob,
    URL,
    localStorage,
    indexedDB,
    document: {
      createElement() { return { click() {}, remove() {} }; },
      body: { appendChild() {} }
    },
    App: {
      activeCharacter: { id: "hero", name: "Hero" },
      characters: [{ id: "hero", name: "Hero" }],
      config: { api: { model: "m", baseUrl: "x", key: "SECRET" }, memory: {} }
    },
    Chat: {
      messages: [{ role: "user", content: "new" }],
      summary: "",
      summarizedUntil: 0,
      usage: {},
      lastStoryPromptTokens: 0
    },
    GameState: { current: { config: {} } },
    CharacterEngine: null,
    BAOPlayerSettings: null,
    BAONarrativeSettings: null,
    BAOMemoryWorkbench: null,
    BAOCharacterStatus: null,
    BAOWorldModules: null
  };
  context.window = context;
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, "..", "js", "storage.js"), "utf8");
  vm.runInContext(source + "\nwindow.__Storage = Storage;", context);
  return context;
}

(async () => {
  let context = makeContext();
  const Storage = context.__Storage;

  assert.equal(Storage.hasStory(), true, "legacy autosave is available during startup");
  const queuedDuringMigration = Storage.saveSlot("queued-during-migration");
  assert.ok(queuedDuringMigration?.id, "writes are accepted while IndexedDB initializes");
  await Storage.ready();
  assert.equal(Storage.status().mode, "indexedDB");
  assert.equal(Storage.loadStory().label, "legacy-auto");
  assert.equal(Storage.listSlots().length, 2);
  assert.ok(Storage.listSlots().some(item => item.id === queuedDuringMigration.id), "pending slot survives migration");
  assert.ok(Storage.listSlots().some(item => item.id === "slot-1"));
  assert.equal(localStorage.getItem("bao-lab:story:autosave"), null, "legacy autosave removed after migration");
  assert.equal(localStorage.getItem("bao-lab:story:slots"), null, "legacy slots removed after migration");
  assert.ok(localStorage.getItem("bao-lab:story-idb-migrated-v1"));

  assert.equal(Storage.saveStory(), true);
  const newSlot = Storage.saveSlot("new-slot");
  assert.ok(newSlot.id);
  await Storage.flush();
  assert.equal(localStorage.getItem("bao-lab:story:autosave"), null, "new IDB autosave does not return to localStorage");
  assert.equal(Storage.listSlots().length, 3);

  context = makeContext();
  const Reloaded = context.__Storage;
  await Reloaded.ready();
  assert.equal(Reloaded.status().mode, "indexedDB");
  assert.equal(Reloaded.loadStory().chat.messages[0].content, "new");
  assert.equal(Reloaded.listSlots().length, 3, "slots and migration-time writes survive reload from IDB");
  assert.equal(JSON.stringify(Reloaded.loadStory()).includes("SECRET"), false, "API key is not persisted");

  Reloaded.deleteSlot("slot-1");
  await Reloaded.flush();
  assert.equal(Reloaded.listSlots().some(item => item.id === "slot-1"), false);
  Reloaded.clearStory();
  await Reloaded.flush();
  assert.equal(Reloaded.hasStory(), false);

  console.log("indexeddb storage migration test passed");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
