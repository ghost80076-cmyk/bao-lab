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
      const parent = String(path[path.length - 1] || "").toLowerCase();
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
    const chatMessages = window.Chat?.ensureMessageIds ? Chat.ensureMessageIds() : (Chat.messages || []);
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
        messages: this.scrubSecrets(this.clone(chatMessages)),
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
    clean.version = Math.max(1, Number(clean.version || 1));
    clean.config = clean.config || {};
    clean.config.api = Object.assign({}, clean.config.api || {}, { key: "" });
    clean.state = clean.state && typeof clean.state === "object" ? clean.state : {};
    clean.state.config = clean.config;
    clean.chat.messages = Array.isArray(clean.chat.messages) ? clean.chat.messages : [];
    if (window.Chat?.ensureMessageIds) clean.chat.messages = Chat.ensureMessageIds(clean.chat.messages);
    return clean;
  },

  _legacyAutosave() {
    const save = this.get(this.storyKey, null);
    try { return save ? this.sanitizeImportedStory(save) : null; }
    catch { return null; }
  },

  _legacySlots() {
    const slots = this.get(this.slotsKey, []);
    if (!Array.isArray(slots)) return [];
    return slots.map(item => {
      try {
        const clean = this.sanitizeImportedStory(item);
        clean.id = String(item.id || clean.id || ("slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)));
        clean.label = String(item.label || clean.label || "未命名存檔");
        clean.savedAt = String(item.savedAt || clean.savedAt || new Date().toISOString());
        return clean;
      } catch { return null; }
    }).filter(Boolean).sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt))).slice(0, 20);
  },

  _hydrateLegacyCache() {
    this._cache.autosave = this._legacyAutosave();
    this._cache.slots = this._legacySlots();
  },

  _legacyStoryKeysExist() {
    try {
      return localStorage.getItem(this.prefix + this.storyKey) !== null || localStorage.getItem(this.prefix + this.slotsKey) !== null;
    } catch { return false; }
  },

  _persistLegacySnapshot(markFallback = false) {
    if (this._cache.autosave) this.set(this.storyKey, this._cache.autosave);
    else this.remove(this.storyKey);
    this.set(this.slotsKey, this._cache.slots);
    if (markFallback) {
      try { localStorage.setItem(this.fallbackKey, "yes"); }
      catch {}
    }
  },

  _cleanupLegacyStoryStorage() {
    this.remove(this.storyKey);
    this.remove(this.slotsKey);
    try {
      localStorage.removeItem(this.fallbackKey);
      localStorage.setItem(this.migrationKey, new Date().toISOString());
    } catch {}
  },

  _openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(this.dbStore)
          ? request.transaction.objectStore(this.dbStore)
          : db.createObjectStore(this.dbStore, { keyPath: "id" });
        if (!store.indexNames.contains("kind")) store.createIndex("kind", "kind", { unique: false });
        if (!store.indexNames.contains("savedAt")) store.createIndex("savedAt", "savedAt", { unique: false });
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => reject(request.error || new Error("IndexedDB 無法開啟。"));
      request.onblocked = () => console.warn("BAO/LAB IndexedDB upgrade is blocked by another tab.");
    });
  },

  _request(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
    });
  },

  _transaction(mode, action) {
    if (!this._db) return Promise.reject(new Error("IndexedDB 尚未就緒。"));
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this.dbStore, mode);
      const store = tx.objectStore(this.dbStore);
      try { action(store, tx); }
      catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
    });
  },

  async _getAllRecords() {
    if (!this._db) return [];
    const tx = this._db.transaction(this.dbStore, "readonly");
    const store = tx.objectStore(this.dbStore);
    const result = await this._request(store.getAll());
    return Array.isArray(result) ? result : [];
  },

  _record(kind, payload) {
    const save = this.clone(payload);
    return {
      id: kind === "autosave" ? this.autosaveRecordId : String(save.id),
      kind,
      savedAt: String(save.savedAt || new Date().toISOString()),
      characterId: String(save.characterId || ""),
      characterName: String(save.characterName || ""),
      label: String(save.label || ""),
      payload: save
    };
  },

  _payloadFromRecord(record) {
    if (!record || typeof record !== "object" || !record.payload) return null;
    try {
      const clean = this.sanitizeImportedStory(record.payload);
      if (record.kind === "slot") {
        clean.id = String(record.payload.id || record.id || "");
        clean.label = String(record.payload.label || record.label || clean.label || "未命名存檔");
        clean.savedAt = String(record.payload.savedAt || record.savedAt || clean.savedAt || new Date().toISOString());
      }
      return clean;
    } catch { return null; }
  },

  _newerSave(a, b) {
    if (!a) return b || null;
    if (!b) return a;
    return String(b.savedAt || "").localeCompare(String(a.savedAt || "")) > 0 ? b : a;
  },

  _mergeSlots(primary, secondary) {
    const byId = new Map();
    [...(Array.isArray(primary) ? primary : []), ...(Array.isArray(secondary) ? secondary : [])].forEach(item => {
      if (!item) return;
      const id = String(item.id || ("slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7)));
      const next = Object.assign({}, item, { id });
      const previous = byId.get(id);
      byId.set(id, previous ? this._newerSave(previous, next) : next);
    });
    return [...byId.values()].sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || ""))).slice(0, 20);
  },

  async _replaceDatabaseStories(autosave, slots) {
    const existing = await this._getAllRecords();
    await this._transaction("readwrite", store => {
      existing.forEach(record => {
        if (record?.kind === "autosave" || record?.kind === "slot") store.delete(record.id);
      });
      if (autosave) store.put(this._record("autosave", autosave));
      (slots || []).forEach(slot => store.put(this._record("slot", slot)));
    });
  },

  async _migrateLegacyToIndexedDB() {
    const existingRecords = await this._getAllRecords();
    const existingAutosaveRecord = existingRecords.find(record => record?.kind === "autosave" || record?.id === this.autosaveRecordId);
    const existingAutosave = this._payloadFromRecord(existingAutosaveRecord);
    const existingSlots = existingRecords
      .filter(record => record?.kind === "slot")
      .map(record => this._payloadFromRecord(record))
      .filter(Boolean);

    const legacyAutosave = this._legacyAutosave();
    const legacySlots = this._legacySlots();
    let fallbackActive = false;
    try { fallbackActive = localStorage.getItem(this.fallbackKey) === "yes"; }
    catch {}

    const targetAutosave = fallbackActive
      ? legacyAutosave
      : this._newerSave(existingAutosave, legacyAutosave);
    const targetSlots = fallbackActive
      ? legacySlots
      : this._mergeSlots(existingSlots, legacySlots);

    await this._replaceDatabaseStories(targetAutosave, targetSlots);
  },

  async _loadIndexedDBCache() {
    const records = await this._getAllRecords();
    const autosaveRecord = records.find(record => record?.kind === "autosave" || record?.id === this.autosaveRecordId);
    this._cache.autosave = this._payloadFromRecord(autosaveRecord);
    this._cache.slots = records
      .filter(record => record?.kind === "slot")
      .map(record => this._payloadFromRecord(record))
      .filter(Boolean)
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
      .slice(0, 20);
  },

  _applyOperation(operation) {
    if (!operation || !operation.type) return;
    if (operation.type === "saveStory") {
      this._cache.autosave = this.clone(operation.payload);
      return;
    }
    if (operation.type === "clearStory") {
      this._cache.autosave = null;
      return;
    }
    if (operation.type === "saveSlot") {
      const payload = this.clone(operation.payload);
      this._cache.slots = [payload, ...this._cache.slots.filter(item => item.id !== payload.id)]
        .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
        .slice(0, 20);
      return;
    }
    if (operation.type === "deleteSlot") {
      this._cache.slots = this._cache.slots.filter(item => item.id !== operation.id);
    }
  },

  async _persistOperationIndexedDB(operation) {
    if (operation.type === "saveStory") {
      await this._transaction("readwrite", store => store.put(this._record("autosave", operation.payload)));
      return;
    }
    if (operation.type === "clearStory") {
      await this._transaction("readwrite", store => store.delete(this.autosaveRecordId));
      return;
    }
    if (operation.type === "saveSlot" || operation.type === "deleteSlot") {
      const existing = await this._getAllRecords();
      await this._transaction("readwrite", store => {
        existing.filter(record => record?.kind === "slot").forEach(record => store.delete(record.id));
        this._cache.slots.forEach(slot => store.put(this._record("slot", slot)));
      });
    }
  },

  _degradeToLocalStorage(error) {
    this._lastError = error || new Error("IndexedDB write failed.");
    this._mode = "localStorage";
    this._persistLegacySnapshot(true);
    try { this._db?.close?.(); }
    catch {}
    this._db = null;
    console.warn("BAO/LAB IndexedDB unavailable; using localStorage fallback:", this._lastError);
  },

  _queueIndexedDBOperation(operation) {
    const run = async () => {
      if (this._mode !== "indexedDB") return;
      try {
        await this._persistOperationIndexedDB(operation);
      } catch (error) {
        this._degradeToLocalStorage(error);
      }
    };
    this._writeQueue = this._writeQueue.then(run, run);
    return this._writeQueue;
  },

  _commitOperation(operation) {
    this._applyOperation(operation);
    if (this._mode === "indexedDB") {
      this._queueIndexedDBOperation(operation);
      return;
    }
    if (this._mode === "initializing" || this._mode === "booting") {
      this._pendingOperations.push(this.clone(operation));
      this._persistLegacySnapshot(false);
      return;
    }
    this._persistLegacySnapshot(this._mode === "localStorage" && Boolean(this._lastError));
  },

  init() {
    if (this._initPromise) return this._initPromise;
    this._hydrateLegacyCache();

    if (typeof indexedDB === "undefined") {
      this._mode = "localStorage";
      this._ready = true;
      this._initPromise = Promise.resolve(this._mode);
      return this._initPromise;
    }

    this._mode = "initializing";
    this._initPromise = (async () => {
      try {
        this._db = await this._openDatabase();
        await this._migrateLegacyToIndexedDB();
        await this._loadIndexedDBCache();
        this._mode = "indexedDB";

        const pending = this._pendingOperations.splice(0);
        for (const operation of pending) {
          this._applyOperation(operation);
          await this._persistOperationIndexedDB(operation);
        }

        this._cleanupLegacyStoryStorage();
        this._ready = true;
        setTimeout(() => window.BAORefreshSaveUI?.(), 0);
        return this._mode;
      } catch (error) {
        this._ready = true;
        this._degradeToLocalStorage(error);
        return this._mode;
      }
    })();
    return this._initPromise;
  },

  ready() { return this.init(); },
  async flush() {
    await this.init();
    await this._writeQueue;
    return this._mode;
  },
  status() {
    return {
      mode: this._mode,
      ready: this._ready,
      database: this._mode === "indexedDB" ? this.dbName : null,
      store: this._mode === "indexedDB" ? this.dbStore : null,
      legacyStoryDataPresent: this._legacyStoryKeysExist(),
      lastError: this._lastError ? String(this._lastError.message || this._lastError) : ""
    };
  },

  saveStory() {
    const payload = this.buildStoryPayload("自動存檔");
    if (!payload) return false;
    this._commitOperation({ type: "saveStory", payload });
    return true;
  },

  loadStory() {
    let save = this._cache.autosave;
    if (!save && !this._ready) save = this._legacyAutosave();
    if (!save) return null;
    try { return this.sanitizeImportedStory(save); }
    catch { return null; }
  },
  hasStory() { return Boolean(this.loadStory()); },
  clearStory() { this._commitOperation({ type: "clearStory" }); },

  listSlots() {
    const slots = this._cache.slots.length || this._ready ? this._cache.slots : this._legacySlots();
    return Array.isArray(slots) ? this.clone(slots) : [];
  },

  saveSlot(label = "") {
    const currentSlots = this.listSlots();
    const payload = this.buildStoryPayload(label || "存檔 " + (currentSlots.length + 1));
    if (!payload) return null;
    payload.id = "slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    this._commitOperation({ type: "saveSlot", payload });
    return this.clone(payload);
  },

  importSlot(save) {
    const clean = this.sanitizeImportedStory(save);
    clean.id = "slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    clean.savedAt = new Date().toISOString();
    clean.label = clean.label || "匯入存檔 · " + (clean.characterName || clean.characterId);
    this._commitOperation({ type: "saveSlot", payload: clean });
    return this.clone(clean);
  },

  deleteSlot(id) {
    this._commitOperation({ type: "deleteSlot", id: String(id || "") });
  },

  getSlot(id) {
    const save = this.listSlots().find(item => item.id === id) || null;
    if (!save) return null;
    try { return this.sanitizeImportedStory(save); }
    catch { return null; }
  },

  exportSave(save) {
    if (!save) return false;
    const safe = this.scrubSecrets(this.clone(save));
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const name = String(safe.characterName || "story").replace(/[\\/:*?"<>|]/g, "-");
    anchor.href = url;
    anchor.download = "BAO-LAB-完整故事-" + name + "-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    return true;
  },

  exportCurrentStory(label = "") {
    const payload = this.buildStoryPayload(label || "完整故事備份");
    return payload ? this.exportSave(payload) : false;
  },

  async importFile(file) {
    const text = await file.text();
    return this.sanitizeImportedStory(JSON.parse(text));
  },

  applyPreferences(preferences = {}) {
    if (!preferences || typeof preferences !== "object") return;
    if (preferences.player) {
      localStorage.setItem("bao-lab:player-settings", JSON.stringify(preferences.player));
      window.BAOPlayerSettings?.set?.(preferences.player);
    }
    if (preferences.narrative) {
      localStorage.setItem("bao-lab:narrative-settings-v1", JSON.stringify(preferences.narrative));
      window.BAONarrativeSettings?.set?.(preferences.narrative);
    }
    if (Array.isArray(preferences.memorySlots)) {
      localStorage.setItem("bao-lab:player-memory-slots", JSON.stringify(preferences.memorySlots));
      window.BAOMemoryWorkbench?.writeSlots?.(preferences.memorySlots);
    }
  },

  restoreStory(input) {
    if (!input || !window.App || !window.Chat || !window.GameState) return false;
    let save;
    try { save = this.sanitizeImportedStory(input); }
    catch { return false; }

    let character = App.characters.find(item => item.id === save.characterId);
    if (!character && save.character) {
      character = window.CharacterEngine?.normalize ? CharacterEngine.normalize(save.character) : this.clone(save.character);
      if (character?.id && !App.characters.some(item => item.id === character.id)) App.characters.push(character);
    }
    if (!character) return false;

    App.activeCharacter = character;
    App.config = this.clone(save.config || {});
    App.config.api = Object.assign({}, App.config.api || {}, { key: "" });
    const restoredMessages = this.clone(save.chat?.messages || []);
    Chat.messages = Chat.ensureMessageIds ? Chat.ensureMessageIds(restoredMessages) : restoredMessages;
    Chat.summary = String(save.chat?.summary || "");
    Chat.summarizedUntil = Number(save.chat?.summarizedUntil || 0);
    Chat.usage = Object.assign({ prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0 }, this.clone(save.chat?.usage || {}));
    Chat.lastStoryPromptTokens = Number(save.chat?.lastStoryPromptTokens || 0);
    GameState.current = this.clone(save.state || {});
    GameState.current.config = App.config;
    if (save.contextPack && !GameState.current.contextPack) GameState.current.contextPack = this.clone(save.contextPack);
    this.applyPreferences(save.preferences || {});
    window.BAOCharacterStatus?.ensureState?.(character);
    window.BAOWorldModules?.ensureState?.(character);
    return true;
  }
};

Storage.init();
