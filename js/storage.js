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
  fallbackCompleteMarker: "complete-v3",
  fallbackRevisionKey: "bao-lab:story-idb-fallback-revision-v1",
  revisionRecordId: "__story_revision__",
  fallbackSnapshotKey: "bao-lab:story-fallback-snapshot-v1",
  storyLockName: "bao-lab:story-storage-v1",

  _db: null,
  _mode: "booting",
  _ready: false,
  _initPromise: null,
  _writeQueue: Promise.resolve(),
  _pendingOperations: [],
  _cache: { autosave: null, slots: [] },
  _lastError: null,
  _lastRestoreError: null,
  _fallbackSnapshotComplete: false,
  _expectedRevision: null,
  _legacyMigrationSnapshot: null,
  _startupOperations: [],
  _fallbackWriterId: "tab-" + Date.now() + "-" + Math.random().toString(36).slice(2),

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
        usageByKind: this.scrubSecrets(this.clone(Chat.usageByKind || {})),
        usageLedger: this.scrubSecrets(this.clone(Chat.usageLedger || [])),
        memoryHealth: this.scrubSecrets(this.clone(Chat.memoryHealth || {})),
        lastStoryPromptTokens: Number(Chat.lastStoryPromptTokens || 0)
      },
      contextPack: this.scrubSecrets(this.clone(GameState.current?.contextPack || null)),
      state
    };
  },

  validateStory(save) {
    return Boolean(save && typeof save === "object" && save.characterId && save.config && save.chat && Array.isArray(save.chat.messages || []));
  },

  importedPayloadKind(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return "unknown";
    if (this.validateStory(value)) return "story";
    if (
      (value.schema_version && value.meta && value.content) ||
      (value.meta && value.content && (value.meta.id || value.id)) ||
      (/^chara_card_v[23]$/.test(String(value.spec || "")) && value.data)
    ) return "character";
    if (value.draft && (value.capability_audit || value.worldbook || value.source_format)) return "creator-report";
    return "unknown";
  },

  sanitizeImportedStory(save) {
    if (!this.validateStory(save)) {
      const kind = this.importedPayloadKind(save);
      const error = new Error(
        kind === "character"
          ? "這份檔案看起來是角色卡，不是完整故事備份。請到「作品 → 本機角色與匯入（進階）→ 匯入角色卡（JSON／PNG）」上傳。"
          : kind === "creator-report"
            ? "這是 YoruBay Creator 的遷移分析報告，還不是可匯入檔案。請先讓 Creator 完成「產生夜灣角色卡 JSON」與檔案準備，再到角色卡匯入入口上傳。"
            : "這不是有效的夜灣故事存檔。完整故事備份請在這裡匯入；角色卡請到「作品 → 本機角色與匯入」。",
      );
      error.code = kind === "character"
        ? "YORUBAY_CHARACTER_CARD_IN_STORY_IMPORT"
        : kind === "creator-report"
          ? "YORUBAY_CREATOR_REPORT_IN_STORY_IMPORT"
          : "YORUBAY_INVALID_STORY_IMPORT";
      throw error;
    }
    const clean = this.scrubSecrets(this.clone(save));
    clean.schema = clean.schema || this.storySchema;
    clean.version = Math.max(1, Number(clean.version || 1));
    clean.config = clean.config || {};
    clean.config.api = Object.assign({}, clean.config.api || {}, { key: "" });
    clean.state = clean.state && typeof clean.state === "object" ? clean.state : {};
    clean.state.config = clean.config;
    const savedAt = Number.isNaN(Date.parse(clean.savedAt)) ? new Date().toISOString() : clean.savedAt;
    clean.chat.messages = (Array.isArray(clean.chat.messages) ? clean.chat.messages : [])
      .map(message => ({ ...message, createdAt: message?.createdAt || savedAt }));
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

  _readFallbackSnapshot() {
    const raw = localStorage.getItem(this.fallbackSnapshotKey);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (value?.schema !== "bao-lab-fallback" || value.version !== 1 ||
        !Array.isArray(value.slots) || value.slots.length > 20 ||
        (value.revision !== null && (!Number.isSafeInteger(value.revision) || value.revision < 0)) ||
        (value.autosave !== null && !this.validateStory(value.autosave)) ||
        value.slots.some(slot => !slot?.id || !this.validateStory(slot))) {
      throw new Error("本地備援快照無效，已保留原資料，請匯出故事備份。");
    }
    return { ...value, autosave: value.autosave ? this.sanitizeImportedStory(value.autosave) : null,
      slots: value.slots.map(slot => this.sanitizeImportedStory(slot)) };
  },

  _withStoryLock(action) {
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request(this.storyLockName, { mode: "exclusive" }, action);
    }
    // Single-key commits still prevent torn snapshots without Web Locks.
    return Promise.resolve().then(action);
  },

  _hydrateLegacyCache() {
    this._cache.autosave = this._legacyAutosave();
    this._cache.slots = this._legacySlots();
    try {
      const snapshot = this._readFallbackSnapshot();
      if (snapshot) {
        this._cache = this.clone({ autosave: snapshot.autosave, slots: snapshot.slots });
        this._expectedRevision = snapshot.revision;
        this._fallbackSnapshotComplete = snapshot.revision !== null;
        return;
      }
      const revision = this.localJSON(this.fallbackRevisionKey, null);
      this._fallbackSnapshotComplete = localStorage.getItem(this.fallbackKey) === this.fallbackCompleteMarker && Number.isSafeInteger(revision) && revision >= 0;
      this._expectedRevision = this._fallbackSnapshotComplete ? revision : null;
    }
    catch (error) { this._fallbackSnapshotComplete = false; this._lastError = error; }
  },

  _legacySnapshotSignature() {
    return JSON.stringify([this.prefix + this.storyKey, this.prefix + this.slotsKey, this.fallbackKey, this.fallbackRevisionKey, this.fallbackSnapshotKey]
      .map(key => localStorage.getItem(key)));
  },

  _legacyStoryKeysExist() {
    try {
      return localStorage.getItem(this.fallbackSnapshotKey) !== null || localStorage.getItem(this.prefix + this.storyKey) !== null || localStorage.getItem(this.prefix + this.slotsKey) !== null;
    } catch { return false; }
  },

  _persistFallbackSnapshot(operations = [], baseCache = this._cache) {
    // Caller holds the cross-tab lock. Rebase only the requested operations on
    // the latest shared snapshot, then atomically replace this one key.
    const previous = this._readFallbackSnapshot();
    const sourceRevision = this._fallbackSnapshotComplete && Number.isSafeInteger(this._expectedRevision) && this._expectedRevision >= 0 ? this._expectedRevision : null;
    // A startup snapshot from this writer can be completed once IDB is loaded.
    // A snapshot touched by another writer must stay conservative.
    const promoteOwnStartup = previous?.owner === this._fallbackWriterId && previous.revision === null && sourceRevision !== null;
    let cache = this.clone(previous && !promoteOwnStartup ? { autosave: previous.autosave, slots: previous.slots } : baseCache);
    if (previous && !promoteOwnStartup && !operations.length) {
      // Snapshot-only recovery cannot prove deletions against another writer.
      cache = { autosave: this._newerSave(cache.autosave, baseCache.autosave),
        slots: this._mergeSlots(cache.slots, baseCache.slots) };
    }
    operations.forEach(operation => this._applyOperation(operation, cache));
    const revision = previous && !promoteOwnStartup && previous.revision !== sourceRevision ? null : sourceRevision;
    const snapshot = { schema: "bao-lab-fallback", version: 1, revision,
      owner: !previous || previous.owner === this._fallbackWriterId ? this._fallbackWriterId : null,
      autosave: cache.autosave, slots: cache.slots };
    localStorage.setItem(this.fallbackSnapshotKey, JSON.stringify(snapshot));
    return true;
  },

  _queueFallbackOperation(operation, baseCache) {
    const run = () => this._withStoryLock(() => {
      if (this._mode === "indexedDB" && this._ready) return;
      try { this._persistFallbackSnapshot(operation ? [operation] : [], baseCache); }
      catch (error) { this._lastError = error; console.warn("BAO/LAB fallback write failed:", error); }
    });
    this._writeQueue = this._writeQueue.then(run, run);
    return this._writeQueue;
  },

  _cleanupLegacyStoryStorage() {
    // Never leave an authoritative marker pointing at keys we just removed.
    // If invalidation is blocked, retain the complete backup alongside IDB.
    try {
      if (this._legacyMigrationSnapshot !== null && this._legacySnapshotSignature() !== this._legacyMigrationSnapshot) return false;
      localStorage.removeItem(this.fallbackKey);
      if (localStorage.getItem(this.fallbackKey) !== null) return false;
    } catch { return false; }
    this.remove(this.storyKey);
    this.remove(this.slotsKey);
    try { localStorage.removeItem(this.fallbackRevisionKey); localStorage.removeItem(this.fallbackSnapshotKey); }
    catch {}
    try {
      localStorage.setItem(this.migrationKey, new Date().toISOString());
    } catch {}
    return true;
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
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
      tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
      const abort = error => {
        // Reject with the action error and roll back any requests already queued.
        reject(error);
        try { tx.abort(); }
        catch {}
      };
      try {
        if (mode === "readwrite") {
          const request = store.get(this.revisionRecordId);
          request.onsuccess = () => {
            try {
              const revision = this._databaseRevision(request.result ? [request.result] : []);
              if (revision >= Number.MAX_SAFE_INTEGER) throw new Error("存檔版本已超出安全範圍。");
              store.put({ id: this.revisionRecordId, kind: "storage-meta", revision: revision + 1 });
            } catch (error) { abort(error); }
          };
        }
        action(store, tx, abort);
      }
      catch (error) { abort(error); }
    });
  },

  _databaseRevision(records) {
    const record = records.find(item => item?.id === this.revisionRecordId);
    if (!record) return 0;
    if (!Number.isSafeInteger(record.revision) || record.revision < 0) throw new Error("存檔版本資料無效。");
    return record.revision;
  },

  _advanceExpectedRevision() {
    // Count only this tab's commits. Reading the latest shared revision after
    // each write would hide intervening commits from another tab.
    if (Number.isSafeInteger(this._expectedRevision)) this._expectedRevision++;
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

  async _replaceDatabaseStories(autosave, slots, resolveStories = null) {
    await this._transaction("readwrite", (store, tx, abort) => {
      const request = store.getAll();
      request.onsuccess = () => {
        try {
          const existing = request.result;
          const target = resolveStories ? resolveStories(existing) : { autosave, slots };
          existing.forEach(record => {
            if (record?.kind === "autosave" || record?.kind === "slot") store.delete(record.id);
          });
          if (target.autosave) store.put(this._record("autosave", target.autosave));
          (target.slots || []).forEach(slot => store.put(this._record("slot", slot)));
        } catch (error) { abort(error); }
      };
    });
  },

  async _migrateLegacyToIndexedDB() {
    const snapshot = this._readFallbackSnapshot();
    const legacyAutosave = snapshot ? snapshot.autosave : this._legacyAutosave();
    const legacySlots = snapshot ? snapshot.slots : this._legacySlots();
    let fallbackMarker = null;
    let fallbackActive = false;
    try {
      fallbackMarker = localStorage.getItem(this.fallbackKey);
      fallbackActive = snapshot ? snapshot.revision !== null : fallbackMarker === this.fallbackCompleteMarker;
    }
    catch {}
    const fallbackRevision = snapshot ? snapshot.revision : this.localJSON(this.fallbackRevisionKey, null);

    // Retire the marker before IDB can advance past the fallback snapshot. If
    // it cannot be retired, do not allow a stale marker to undo later IDB saves.
    if (fallbackMarker !== null) {
      localStorage.removeItem(this.fallbackKey);
      if (localStorage.getItem(this.fallbackKey) !== null) throw new Error("無法撤銷本地備援標記，已保留原存檔。");
    }
    this._legacyMigrationSnapshot = this._legacySnapshotSignature();
    if (!snapshot && !legacyAutosave && !legacySlots.length && fallbackMarker === null) return;
    await this._replaceDatabaseStories(null, null, existingRecords => {
      const existingAutosave = this._payloadFromRecord(existingRecords.find(record => record?.kind === "autosave" || record?.id === this.autosaveRecordId));
      const existingSlots = existingRecords.filter(record => record?.kind === "slot")
        .map(record => this._payloadFromRecord(record)).filter(Boolean);
      const authoritative = fallbackActive && Number.isSafeInteger(fallbackRevision) && fallbackRevision >= 0 && fallbackRevision === this._databaseRevision(existingRecords);
      return {
        autosave: authoritative ? legacyAutosave : this._newerSave(existingAutosave, legacyAutosave),
        slots: authoritative ? legacySlots : this._mergeSlots(existingSlots, legacySlots)
      };
    });
  },

  async _loadIndexedDBCache() {
    const records = await this._getAllRecords();
    this._expectedRevision = this._databaseRevision(records);
    const autosaveRecord = records.find(record => record?.kind === "autosave" || record?.id === this.autosaveRecordId);
    this._cache.autosave = this._payloadFromRecord(autosaveRecord);
    this._cache.slots = records
      .filter(record => record?.kind === "slot")
      .map(record => this._payloadFromRecord(record))
      .filter(Boolean)
      .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
      .slice(0, 20);
  },

  _applyOperation(operation, cache = this._cache) {
    if (!operation || !operation.type) return;
    if (operation.type === "saveStory") {
      cache.autosave = this.clone(operation.payload);
      return;
    }
    if (operation.type === "clearStory") {
      cache.autosave = null;
      return;
    }
    if (operation.type === "saveSlot") {
      const payload = this.clone(operation.payload);
      cache.slots = [payload, ...cache.slots.filter(item => item.id !== payload.id)]
        .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
        .slice(0, 20);
      return;
    }
    if (operation.type === "deleteSlot") {
      cache.slots = cache.slots.filter(item => item.id !== operation.id);
    }
  },

  async _persistOperationIndexedDB(operation) {
    if (operation.type === "saveStory") {
      await this._transaction("readwrite", store => store.put(this._record("autosave", operation.payload)));
      this._advanceExpectedRevision();
      return;
    }
    if (operation.type === "clearStory") {
      await this._transaction("readwrite", store => store.delete(this.autosaveRecordId));
      this._advanceExpectedRevision();
      return;
    }
    if (operation.type === "saveSlot" || operation.type === "deleteSlot") {
      const id = operation.type === "saveSlot" ? String(operation.payload.id) : operation.id;
      if (id === this.autosaveRecordId || id === this.revisionRecordId) return;
      await this._transaction("readwrite", (store, tx, abort) => {
        // A tab's cache may omit remote additions or still contain remote
        // deletions. Persist only this operation, never the whole cached list.
        if (operation.type === "saveSlot") store.put(this._record("slot", operation.payload));
        else store.delete(id);
        // Read after the mutation in this same transaction so concurrent tabs
        // share one capacity decision and cannot overwrite each other's slots.
        const request = store.getAll();
        request.onsuccess = () => {
          try {
            request.result.filter(record => record?.kind === "slot")
              .sort((a, b) => String(b.savedAt || "").localeCompare(String(a.savedAt || "")))
              .slice(20).forEach(record => store.delete(record.id));
          } catch (error) { abort(error); }
        };
      });
      this._advanceExpectedRevision();
    }
  },

  _degradeToLocalStorage(error, persist = true) {
    this._fallbackSnapshotComplete = this._mode === "indexedDB" || this._fallbackSnapshotComplete;
    this._lastError = error || new Error("IndexedDB write failed.");
    this._mode = "localStorage";
    if (persist) this._queueFallbackOperation(null, { autosave: this._cache.autosave, slots: this._cache.slots });
    try { this._db?.close?.(); }
    catch {}
    this._db = null;
    console.warn("BAO/LAB IndexedDB unavailable; using localStorage fallback:", this._lastError);
  },

  _queueIndexedDBOperation(operation, baseCache) {
    const run = () => this._withStoryLock(async () => {
      try {
        if (this._mode === "indexedDB") {
          try { await this._persistOperationIndexedDB(operation); return; }
          catch (error) { this._degradeToLocalStorage(error, false); }
        }
        this._persistFallbackSnapshot([operation], baseCache);
      } catch (error) { this._lastError = error; console.warn("BAO/LAB fallback write failed:", error); }
    });
    this._writeQueue = this._writeQueue.then(run, run);
    return this._writeQueue;
  },

  _commitOperation(operation) {
    const baseCache = { autosave: this._cache.autosave, slots: this._cache.slots };
    this._applyOperation(operation);
    if (this._mode === "indexedDB") {
      this._queueIndexedDBOperation(operation, baseCache);
      return;
    }
    if (this._mode === "initializing" || this._mode === "booting") {
      this._pendingOperations.push(this.clone(operation));
      this._startupOperations.push(this.clone(operation));
    }
    this._queueFallbackOperation(this.clone(operation), baseCache);
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
        return await this._withStoryLock(async () => {
          try {
            await this._migrateLegacyToIndexedDB();
            await this._loadIndexedDBCache();
            this._fallbackSnapshotComplete = true;

            // Loading IDB replaced the startup cache. Restore every queued change
            // before the first awaited write, so a failure retains the latest state.
            // Keep new writes in this queue until replay finishes; they already
            // update the cache synchronously and must never be applied twice.
            let pending = this._pendingOperations.splice(0);
            pending.forEach(operation => this._applyOperation(operation));
            while (pending.length) {
              for (const operation of pending) await this._persistOperationIndexedDB(operation);
              pending = this._pendingOperations.splice(0);
            }
            this._mode = "indexedDB";

            this._cleanupLegacyStoryStorage();
            this._ready = true;
            setTimeout(() => window.BAORefreshSaveUI?.(), 0);
            this._startupOperations.length = 0;
            return this._mode;
          } catch (error) {
            this._pendingOperations.length = 0;
            this._ready = true;
            this._degradeToLocalStorage(error, false);
            try { this._persistFallbackSnapshot(this._startupOperations, this._cache); }
            catch (backupError) { this._lastError = backupError; }
            this._startupOperations.length = 0;
            return this._mode;
          }
        });
      } catch (error) {
        this._pendingOperations.length = 0;
        this._ready = true;
        this._degradeToLocalStorage(error);
        this._startupOperations.length = 0;
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
      lastError: this._lastError ? String(this._lastError.message || this._lastError) : "",
      lastRestoreError: this._lastRestoreError ? String(this._lastRestoreError.message || this._lastRestoreError) : ""
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

  _preparePreferenceRestore(preferences = {}) {
    if (!preferences || typeof preferences !== "object") return [];
    const definitions = [
      { name: "player", key: "bao-lab:player-settings", api: window.BAOPlayerSettings, get: "get", set: "set", fallback: {} },
      { name: "narrative", key: "bao-lab:narrative-settings-v1", api: window.BAONarrativeSettings, get: "get", set: "set", fallback: {} },
      { name: "memorySlots", key: "bao-lab:player-memory-slots", api: window.BAOMemoryWorkbench, get: "readSlots", set: "writeSlots", fallback: [] }
    ];
    return definitions.filter(item => item.name === "memorySlots" ? Array.isArray(preferences[item.name]) : Boolean(preferences[item.name])).map(item => {
      const raw = localStorage.getItem(item.key);
      let previous;
      try { previous = raw === null ? item.fallback : JSON.parse(raw); }
      catch { previous = item.fallback; }
      const apply = typeof item.api?.[item.set] === "function" ? value => item.api[item.set](value) : null;
      if (apply && typeof item.api?.[item.get] === "function") previous = item.api[item.get]();
      const undo = typeof item.api?.restoreRuntime === "function" ? value => item.api.restoreRuntime(value) : apply;
      return { ...item, undo, raw, previous: this.clone(previous), next: this.clone(preferences[item.name]), apply, written: false, called: false };
    });
  },

  applyPreferences(preferences = {}, plan = this._preparePreferenceRestore(preferences)) {
    // Finish all raw writes before invoking setters with UI/runtime side effects.
    for (const entry of plan) {
      localStorage.setItem(entry.key, JSON.stringify(entry.next));
      entry.written = true;
    }
    for (const entry of plan) {
      if (!entry.apply) continue;
      entry.called = true;
      entry.apply(this.clone(entry.next));
    }
    return plan;
  },

  restoreStory(input) {
    this._lastRestoreError = null;
    if (!input || !window.App || !window.Chat || !window.GameState) {
      this._lastRestoreError = new Error("故事還原資料或執行環境不完整。");
      return false;
    }
    let previous = null;
    let plan = [];
    const restoreProperties = (snapshots, attempt) => snapshots.forEach(({ target, fields }) => {
      for (const [key, descriptor] of fields) {
        attempt(() => {
          if (descriptor) Object.defineProperty(target, key, descriptor);
          else delete target[key];
        });
      }
    });
    try {
      const save = this.sanitizeImportedStory(input);
      const characters = Array.isArray(App.characters) ? App.characters.slice() : [];
      let character = characters.find(item => item.id === save.characterId);
      if (save.character && (!character || character.catalog_only)) {
        const snapshot = window.CharacterEngine?.normalize ? CharacterEngine.normalize(this.clone(save.character)) : this.clone(save.character);
        if (snapshot?.id) {
          snapshot.source = character?.source || snapshot.source || "story-snapshot";
          snapshot.catalog_only = false;
          if (character?.catalog_file) snapshot.catalog_file = character.catalog_file;
          character = snapshot;
        }
      }
      if (!character || character.catalog_only) throw new Error("找不到完整角色設定，故事尚未還原。");
      character = this.clone(character);

      // Preserve this saved story's opening and companion lore while preparing
      // a detached candidate. No catalog entry is changed until commit.
      if (character.story_startup && save.character) {
        const openingSnapshot = window.CharacterEngine?.normalize ? CharacterEngine.normalize(this.clone(save.character)) : this.clone(save.character);
        if (openingSnapshot.id === character.id &&
            (character.initial_state?.worldbookLibrary || openingSnapshot.initial_state?.worldbookLibrary)) {
          const initial = { ...character.initial_state };
          if (openingSnapshot.initial_state?.worldbookLibrary) initial.worldbookLibrary = openingSnapshot.initial_state.worldbookLibrary;
          else delete initial.worldbookLibrary;
          character = { ...character, lore: openingSnapshot.lore, initial_state: initial };
        }
        if (openingSnapshot.id === character.id && openingSnapshot.greeting) {
          character = { ...character, greeting: openingSnapshot.greeting,
            greeting_context: openingSnapshot.greeting_context, opening: openingSnapshot.opening };
        }
      }
      const index = characters.findIndex(item => item.id === character.id);
      if (index >= 0) characters[index] = character;
      else characters.push(character);
      const config = this.clone(save.config || {});
      config.api = Object.assign({}, config.api || {}, { key: "" });
      const restoredMessages = this.clone(save.chat?.messages || []);
      const messages = Chat.ensureMessageIds ? Chat.ensureMessageIds(restoredMessages) : restoredMessages;
      const summary = String(save.chat?.summary || "");
      const chat = {
        messages, summary,
        summarizedUntil: Number(save.chat?.summarizedUntil || 0),
        usage: Object.assign({ prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0 }, this.clone(save.chat?.usage || {})),
        usageByKind: this.clone(save.chat?.usageByKind || {}),
        usageLedger: Array.isArray(save.chat?.usageLedger) ? this.clone(save.chat.usageLedger).slice(-10000) : [],
        memoryHealth: Object.assign({
          phase: summary ? "success" : "idle", message: summary ? "已從存檔還原長期摘要。" : "尚未需要摘要",
          lastSuccessAt: "", lastFailureAt: "",
          lastModel: config.memory?.summaryApi?.model || config.memory?.summaryModel || config.api?.model || "", repaired: false
        }, this.clone(save.chat?.memoryHealth || {})),
        lastStoryPromptTokens: Number(save.chat?.lastStoryPromptTokens || 0)
      };
      const state = this.clone(save.state || {});
      state.config = config;
      if (save.contextPack && !state.contextPack) state.contextPack = this.clone(save.contextPack);
      plan = this._preparePreferenceRestore(save.preferences || {});
      previous = [[App, ["characters", "activeCharacter", "config"]], [Chat, Object.keys(chat)], [GameState, ["current"]]]
        .map(([target, keys]) => ({ target, fields: keys.map(key => [key, Object.getOwnPropertyDescriptor(target, key)]) }));
      App.characters = characters;
      App.activeCharacter = character;
      App.config = config;
      Object.assign(Chat, chat);
      GameState.current = state;
      this.applyPreferences(save.preferences || {}, plan);
      window.BAOCharacterStatus?.ensureState?.(character);
      window.BAOWorldModules?.ensureState?.(character);
      return true;
    } catch (error) {
      const recoveryErrors = [];
      const attempt = action => { try { action(); } catch (failure) { recoveryErrors.push(failure); } };
      // Memory setters can schedule a save for the current story. Undo them
      // against the discarded candidate before restoring the original state.
      for (const entry of [...plan].reverse()) {
        if (entry.called && entry.name === "memorySlots") attempt(() => entry.undo(this.clone(entry.previous)));
      }
      if (previous) restoreProperties(previous, attempt);
      for (const entry of [...plan].reverse()) {
        if (entry.called && entry.name !== "memorySlots") attempt(() => entry.undo(this.clone(entry.previous)));
      }
      // Runtime setters may normalize or write preferences too. Restore exact
      // prior raw values last, including keys that did not previously exist.
      for (const entry of [...plan].reverse()) {
        if (entry.written) attempt(() => entry.raw === null ? localStorage.removeItem(entry.key) : localStorage.setItem(entry.key, entry.raw));
      }
      this._lastRestoreError = recoveryErrors.length
        ? new AggregateError([error, ...recoveryErrors], "故事還原失敗，部分狀態或偏好無法完整復原。請保留分頁並匯出故事備份。")
        : error;
      console.warn("BAO/LAB story restore failed; keeping original story:", this._lastRestoreError);
      if (recoveryErrors.length) attempt(() => window.BAOFeedback?.notify?.(this._lastRestoreError.message, "error"));
      return false;
    }
  }
};

Storage.init();
