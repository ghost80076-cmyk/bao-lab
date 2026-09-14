const Storage = {
  prefix: "bao-lab:",
  storyKey: "story:autosave",
  slotsKey: "story:slots",
  storyVersion: 4,
  storySchema: "bao-lab-story",

  dbName: "bao-lab",
  dbVersion: 1,
  dbStore: "stories",
  autosaveRecordId: "__autosave__",
  migrationKey: "bao-lab:story-idb-migrated-v1",
  fallbackKey: "bao-lab:story-idb-fallback-v1",

  _db: null,
  _mode: "booting",
  _ready: false,
  _initPromise: null,
  _writeQueue: Promise.resolve(),
  _pendingOperations: [],
  _cache: { autosave: null, slots: [] },
  _lastError: null,

  set(key, value) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn("BAO/LAB localStorage write failed:", error);
      return false;
    }
  },
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  remove(key) {
    try { localStorage.removeItem(this.prefix + key); }
    catch {}
  },

  clone(value) {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value == null ? null : value)); }
  },

  scrubSecrets(value, path = []) {
    if (Array.isArray(value)) return value.map((item, index) => this.scrubSecrets(item, path.concat(String(index))));
    if (!value || typeof value !== "object") return value;
    const blocked = new Set(["apikey", "authorization", "accesstoken", "refreshtoken", "clientsecret"]);
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
      const parent = String(path[path.length - 1] || "").toLowerCase().replace(/[^a-z]/g, "");
      if (blocked.has(normalized) || (normalized === "key" && parent.endsWith("api"))) return;
      out[key] = this.scrubSecrets(item, path.concat(key));
    });
    return out;
  },

  localJSON(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value == null ? fallback : value;
    } catch {
      return fallback;
    }
  },

  preferenceSnapshot() {
    const player = window.BAOPlayerSettings?.get?.() || this.localJSON("bao-lab:player-settings", {});
    const narrative = window.BAONarrativeSettings?.get?.() || this.localJSON("bao-lab:narrative-settings-v1", {});
    const memorySlots = window.BAOMemoryWorkbench?.readSlots?.() || this.localJSON("bao-lab:player-memory-slots", []);
    return this.scrubSecrets({ player, narrative, memorySlots });
  },

  characterSnapshot() {
    if (!window.App?.activeCharacter) return null;
    const raw = this.clone(App.activeCharacter);
    return this.scrubSecrets(window.CharacterEngine?.normalize ? CharacterEngine.normalize(raw) : raw);
  },

  buildStoryPayload(label = "") {
    if (!window.App?.activeCharacter || !window.GameState?.current) return null;
    const safeConfig = this.scrubSecrets(this.clone(App.config || {}));
    const state = this.scrubSecrets(this.clone(GameState.current || {}));
    if (state && typeof state === "object") state.config = safeConfig;
    return {
      schema: this.storySchema,
      version: this.storyVersion,
      label,
      savedAt: new Date().toISOString(),
      characterId: App.activeCharacter.id,
      characterName: App.activeCharacter.name,
      character: this.characterSnapshot(),
      config: safeConfig,
      preferences: this.preferenceSnapshot(),
      chat: {
        messages: this.scrubSecrets(this.clone(Chat.messages || [])),
        summary: String(Chat.summary || ""),
        summarizedUntil: Number(Chat.summarizedUntil || 0),
        usage: this.scrubSecrets(this.clone(Chat.usage || {})),
        lastStoryPromptTokens: Number(Chat.lastStoryPromptTokens || 0)
      },
      contextPack: this.scrubSecrets(this.clone(GameState.current?.contextPack || null)),
      state
    };
  },

  validateStory(save) {
    return Boolean(save && typeof save === "object" && save.characterId && save.config && save.chat && Array.isArray(save.chat.messages || []));
  },

  sanitizeImportedStory(save) {
    if (!this.validateStory(save)) throw new Error("這不是有效的 BAO/LAB 故事存檔。");
    const clean = this.scrubSecrets(this.clone(save));
    clean.schema = clean.schema || this.storySchema;
    clean.version = Number(clean.version || 1);
    clean.savedAt = clean.savedAt || new Date().toISOString();
    return clean;
  },

  _legacyAutosave() {
    const raw = this.localJSON(this.prefix + this.storyKey, null);
    try { return raw ? this.sanitizeImportedStory(raw) : null; }
    catch { return null; }
  },
  _legacySlots() {
    const raw = this.localJSON(this.prefix + this.slotsKey, []);
    if (!Array.isArray(raw)) return [];
    return raw.map(item => {
      try { return this.sanitizeImportedStory(item); }
      catch { return null; }
    }).filter(Boolean);
  },
  _hydrateLegacyCache() {
    this._cache.autosave = this._legacyAutosave();
    this._cache.slots = this._legacySlots().slice(0, 20);
  },
  _persistLegacySnapshot() {
    try {
      if (this._cache.autosave) localStorage.setItem(this.prefix + this.storyKey, JSON.stringify(this._cache.autosave));
      else localStorage.removeItem(this.prefix + this.storyKey);
      localStorage.setItem(this.prefix + this.slotsKey, JSON.stringify(this._cache.slots.slice(0, 20)));
      return true;
    } catch (error) {
      console.warn("BAO/LAB story localStorage fallback write failed:", error);
      return false;
    }
  },
  _cleanupLegacyStoryStorage() {
    try {
      localStorage.removeItem(this.prefix + this.storyKey);
      localStorage.removeItem(this.prefix + this.slotsKey);
    } catch {}
  },

  _request(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  },
  _openDatabase() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error("IndexedDB unavailable")); return; }
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = event => {
        const db = event.target.result;
        const store = db.objectStoreNames.contains(this.dbStore)
          ? event.target.transaction.objectStore(this.dbStore)
          : db.createObjectStore(this.dbStore, { keyPath: "id" });
        if (!store.indexNames.contains("kind")) store.createIndex("kind", "kind", { unique: false });
        if (!store.indexNames.contains("savedAt")) store.createIndex("savedAt", "savedAt", { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade blocked"));
    });
  },
  _transaction(mode, worker) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.dbStore, mode);
      const store = tx.objectStore(this.dbStore);
      let output;
      try { output = worker(store, tx); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(output);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed"));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
    });
  },
  async _getAllRecords() {
    if (!this._db) return [];
    return this._request(this._db.transaction(this.dbStore, "readonly").objectStore(this.dbStore).getAll());
  },
  _record(kind, payload) {
    return {
      id: kind === "autosave" ? this.autosaveRecordId : payload.id,
      kind,
      savedAt: payload.savedAt || new Date().toISOString(),
      characterId: payload.characterId || "",
      characterName: payload.characterName || "",
      label: payload.label || "",
      payload: this.scrubSecrets(this.clone(payload))
    };
  },
  _payloadFromRecord(record) {
    if (!record?.payload) return null;
    try { return this.sanitizeImportedStory(record.payload); }
    catch { return null; }
  },
  async _replaceDatabaseStories(autosave, slots) {
    await this._transaction("readwrite", store => {
      store.clear();
      if (autosave) store.put(this._record("autosave", autosave));
      slots.slice(0, 20).forEach(slot => store.put(this._record("slot", slot)));
    });
  },
  async _loadIndexedDBCache() {
    const records = await this._getAllRecords();
    const autosaveRecord = records.find(item => item.kind === "autosave" || item.id === this.autosaveRecordId);
    const slots = records.filter(item => item.kind === "slot").map(item => this._payloadFromRecord(item)).filter(Boolean);
    this._cache.autosave = this._payloadFromRecord(autosaveRecord);
    this._cache.slots = slots.sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, 20);
    return this._cache;
  },

  _newerStory(a, b) {
    if (!a) return b || null;
    if (!b) return a || null;
    return String(a.savedAt || "").localeCompare(String(b.savedAt || "")) >= 0 ? a : b;
  },
  _mergeSlots(a = [], b = []) {
    const byId = new Map();
    [...a, ...b].forEach(slot => {
      if (!slot?.id) return;
      const prev = byId.get(slot.id);
      byId.set(slot.id, this._newerStory(prev, slot));
    });
    return [...byId.values()].sort((x, y) => String(y.savedAt || "").localeCompare(String(x.savedAt || ""))).slice(0, 20);
  },

  _applyOperation(operation) {
    if (!operation) return;
    if (operation.type === "autosave:set") this._cache.autosave = operation.payload;
    else if (operation.type === "autosave:clear") this._cache.autosave = null;
    else if (operation.type === "slot:set") {
      this._cache.slots = [operation.payload, ...this._cache.slots.filter(item => item.id !== operation.payload.id)]
        .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, 20);
    } else if (operation.type === "slot:delete") this._cache.slots = this._cache.slots.filter(item => item.id !== operation.id);
  },
  async _persistOperationIndexedDB(operation) {
    if (!this._db || !operation) return;
    await this._transaction("readwrite", store => {
      if (operation.type === "autosave:set") store.put(this._record("autosave", operation.payload));
      else if (operation.type === "autosave:clear") store.delete(this.autosaveRecordId);
      else if (operation.type === "slot:set") store.put(this._record("slot", operation.payload));
      else if (operation.type === "slot:delete") store.delete(operation.id);
    });
  },
  async _degradeToLocalStorage(error) {
    this._lastError = error || new Error("IndexedDB write failed");
    console.warn("BAO/LAB IndexedDB unavailable, falling back to localStorage:", this._lastError);
    this._mode = "localStorage";
    const persisted = this._persistLegacySnapshot();
    if (persisted) {
      try { localStorage.setItem(this.fallbackKey, "1"); }
      catch {}
    }
    try { this._db?.close?.(); }
    catch {}
    this._db = null;
  },
  _queueIndexedDBOperation(operation) {
    this._writeQueue = this._writeQueue.then(async () => {
      if (this._mode !== "indexedDB") return;
      try { await this._persistOperationIndexedDB(operation); }
      catch (error) { await this._degradeToLocalStorage(error); }
    });
    return this._writeQueue;
  },
  _commitOperation(operation) {
    this._applyOperation(operation);
    if (this._mode === "localStorage") return this._persistLegacySnapshot();
    if (this._mode === "indexedDB") { this._queueIndexedDBOperation(operation); return true; }
    this._pendingOperations.push(operation);
    this._persistLegacySnapshot();
    return true;
  },

  async init() {
    if (this._initPromise) return this._initPromise;
    this._hydrateLegacyCache();
    this._mode = "initializing";
    this._initPromise = (async () => {
      if (!window.indexedDB) { this._mode = "localStorage"; this._ready = true; return this.status(); }
      try {
        const fallbackAuthoritative = (() => { try { return localStorage.getItem(this.fallbackKey) === "1"; } catch { return false; } })();
        const legacyAutosave = this._cache.autosave;
        const legacySlots = [...this._cache.slots];
        this._db = await this._openDatabase();
        await this._loadIndexedDBCache();
        const dbAutosave = this._cache.autosave;
        const dbSlots = [...this._cache.slots];
        const targetAutosave = fallbackAuthoritative ? legacyAutosave : this._newerStory(legacyAutosave, dbAutosave);
        const targetSlots = fallbackAuthoritative ? legacySlots : this._mergeSlots(legacySlots, dbSlots);
        await this._replaceDatabaseStories(targetAutosave, targetSlots);
        this._cache.autosave = targetAutosave;
        this._cache.slots = targetSlots;
        this._mode = "indexedDB";
        for (const op of this._pendingOperations) {
          this._applyOperation(op);
          await this._persistOperationIndexedDB(op);
        }
        this._pendingOperations = [];
        this._cleanupLegacyStoryStorage();
        try {
          localStorage.setItem(this.migrationKey, "1");
          localStorage.removeItem(this.fallbackKey);
        } catch {}
      } catch (error) {
        this._lastError = error;
        this._mode = "localStorage";
        this._hydrateLegacyCache();
      }
      this._ready = true;
      Promise.resolve().then(() => window.BAORefreshSaveUI?.());
      return this.status();
    })();
    return this._initPromise;
  },
  ready() { return this._initPromise || this.init(); },
  async flush() { await this.ready(); await this._writeQueue; return this.status(); },
  status() { return { mode: this._mode, ready: this._ready, lastError: this._lastError ? String(this._lastError.message || this._lastError) : "" }; },

  saveStory() {
    const story = this.buildStoryPayload("autosave");
    if (!story) return false;
    return this._commitOperation({ type: "autosave:set", payload: story });
  },
  loadStory() { return this._cache.autosave ? this.clone(this._cache.autosave) : null; },
  hasStory() { return Boolean(this._cache.autosave); },
  clearStory() { return this._commitOperation({ type: "autosave:clear" }); },

  listSlots() {
    return this._cache.slots.map(item => ({ id: item.id, label: item.label, savedAt: item.savedAt, characterId: item.characterId, characterName: item.characterName }));
  },
  saveSlot(label = "") {
    const story = this.buildStoryPayload(String(label || "").trim() || "手動存檔");
    if (!story) return null;
    story.id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this._commitOperation({ type: "slot:set", payload: story });
    return this.clone(story);
  },
  importSlot(save) {
    const story = this.sanitizeImportedStory(save);
    story.id = story.id || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    story.label = story.label || `匯入 · ${story.characterName || story.characterId}`;
    story.savedAt = new Date().toISOString();
    this._commitOperation({ type: "slot:set", payload: story });
    return this.clone(story);
  },
  deleteSlot(id) {
    if (!id) return false;
    return this._commitOperation({ type: "slot:delete", id });
  },
  getSlot(id) {
    const story = this._cache.slots.find(item => item.id === id);
    return story ? this.clone(story) : null;
  },

  restoreStory(save) {
    try {
      const clean = this.sanitizeImportedStory(save);
      const character = clean.character || window.App?.characters?.find?.(item => item.id === clean.characterId) || null;
      if (!character) return false;
      App.activeCharacter = window.CharacterEngine?.normalize ? CharacterEngine.normalize(this.clone(character)) : this.clone(character);
      App.config = this.clone(clean.config || {});
      Chat.messages = this.clone(clean.chat?.messages || []);
      Chat.summary = String(clean.chat?.summary || "");
      Chat.summarizedUntil = Number(clean.chat?.summarizedUntil || 0);
      Chat.usage = this.clone(clean.chat?.usage || { prompt: 0, completion: 0, cached: 0, total: 0 });
      Chat.lastStoryPromptTokens = Number(clean.chat?.lastStoryPromptTokens || 0);
      GameState.current = this.clone(clean.state || {});
      if (GameState.current) {
        GameState.current.config = App.config;
        if (clean.contextPack !== undefined) GameState.current.contextPack = this.clone(clean.contextPack);
      }
      window.BAOPlayerSettings?.restore?.(clean.preferences?.player);
      window.BAONarrativeSettings?.restore?.(clean.preferences?.narrative);
      window.BAOMemoryWorkbench?.writeSlots?.(clean.preferences?.memorySlots);
      return true;
    } catch (error) {
      console.warn("BAO/LAB restore failed:", error);
      return false;
    }
  },

  exportSave(save) {
    if (!save) return false;
    const safe = this.scrubSecrets(this.clone(save));
    const name = `${(safe.characterName || safe.characterId || "bao-story").replace(/[\\/:*?\"<>|]/g, "-")}-${new Date(safe.savedAt || Date.now()).toISOString().slice(0, 10)}.bao.json`;
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  },
  async importFile(file) {
    const text = await file.text();
    return this.sanitizeImportedStory(JSON.parse(text));
  }
};

Storage.init();
