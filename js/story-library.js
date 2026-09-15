(() => {
  const StoryLibrary = {
    dbName: "bao-lab-story-library",
    dbVersion: 1,
    storeName: "records",
    activeStoryKey: "bao-lab:library:active-story-id",
    activeChapterKey: "bao-lab:library:active-chapter-id",
    storyCreatedKey: "bao-lab:library:active-story-created-at",
    chapterCreatedKey: "bao-lab:library:active-chapter-created-at",
    chapterLabelKey: "bao-lab:library:active-chapter-label",
    branchParentKey: "bao-lab:library:active-branch-parent",
    branchPointMessageKey: "bao-lab:library:active-branch-point-message",
    branchPointSeqKey: "bao-lab:library:active-branch-point-seq",
    branchPointPreviewKey: "bao-lab:library:active-branch-point-preview",
    _db: null,
    _ready: null,
    _writeQueue: Promise.resolve(),
    _pendingNextChapter: false,
    _installed: false,

    clone(value) {
      try { return structuredClone(value); }
      catch { return JSON.parse(JSON.stringify(value == null ? null : value)); }
    },

    id(prefix) {
      if (globalThis.crypto?.randomUUID) return prefix + "-" + crypto.randomUUID();
      return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    },

    localGet(key) {
      try { return localStorage.getItem(key) || ""; }
      catch { return ""; }
    },

    localSet(key, value) {
      try { localStorage.setItem(key, String(value || "")); }
      catch {}
    },

    localRemove(key) {
      try { localStorage.removeItem(key); }
      catch {}
    },

    clearRefs() {
      [this.activeStoryKey, this.activeChapterKey, this.storyCreatedKey, this.chapterCreatedKey, this.chapterLabelKey,
        this.branchParentKey, this.branchPointMessageKey, this.branchPointSeqKey, this.branchPointPreviewKey]
        .forEach(key => this.localRemove(key));
    },

    clearBranchRefs() {
      [this.branchParentKey, this.branchPointMessageKey, this.branchPointSeqKey, this.branchPointPreviewKey]
        .forEach(key => this.localRemove(key));
    },

    refs() {
      return {
        storyId: this.localGet(this.activeStoryKey),
        chapterId: this.localGet(this.activeChapterKey),
        storyCreatedAt: this.localGet(this.storyCreatedKey),
        chapterCreatedAt: this.localGet(this.chapterCreatedKey),
        chapterLabel: this.localGet(this.chapterLabelKey),
        parentChapterId: this.localGet(this.branchParentKey),
        branchPointMessageId: this.localGet(this.branchPointMessageKey),
        branchPointSeq: Number(this.localGet(this.branchPointSeqKey) || -1),
        branchPointPreview: this.localGet(this.branchPointPreviewKey)
      };
    },

    beginStory(label = "") {
      const now = new Date().toISOString();
      const storyId = this.id("story");
      const chapterId = this.id("chapter");
      this.localSet(this.activeStoryKey, storyId);
      this.localSet(this.activeChapterKey, chapterId);
      this.localSet(this.storyCreatedKey, now);
      this.localSet(this.chapterCreatedKey, now);
      this.localSet(this.chapterLabelKey, label || "第一章");
      this.clearBranchRefs();
      return { storyId, chapterId, storyCreatedAt: now, chapterCreatedAt: now, chapterLabel: label || "第一章" };
    },

    beginChapter(label = "") {
      let refs = this.refs();
      if (!refs.storyId) return this.beginStory(label || "第一章");
      const now = new Date().toISOString();
      const chapterId = this.id("chapter");
      this.localSet(this.activeChapterKey, chapterId);
      this.localSet(this.chapterCreatedKey, now);
      this.localSet(this.chapterLabelKey, label || "續篇");
      this.clearBranchRefs();
      return this.refs();
    },

    beginBranch(input = {}) {
      const refs = this.refs();
      if (!refs.storyId || !refs.chapterId) throw new Error("目前沒有可建立分支的故事。");
      const now = new Date().toISOString();
      const branch = {
        storyId: refs.storyId,
        storyCreatedAt: refs.storyCreatedAt || now,
        chapterId: this.id("branch"),
        chapterCreatedAt: now,
        chapterLabel: String(input.label || "新故事分支").trim().slice(0, 100) || "新故事分支",
        parentChapterId: refs.chapterId,
        branchPointMessageId: String(input.messageId || ""),
        branchPointSeq: Number(input.seq),
        branchPointPreview: String(input.preview || "").slice(0, 160)
      };
      this.localSet(this.activeChapterKey, branch.chapterId);
      this.localSet(this.chapterCreatedKey, branch.chapterCreatedAt);
      this.localSet(this.chapterLabelKey, branch.chapterLabel);
      this.localSet(this.branchParentKey, branch.parentChapterId);
      this.localSet(this.branchPointMessageKey, branch.branchPointMessageId);
      this.localSet(this.branchPointSeqKey, branch.branchPointSeq);
      this.localSet(this.branchPointPreviewKey, branch.branchPointPreview);
      return branch;
    },

    adoptRefs(input = {}) {
      const lib = input?._library || {};
      if (!lib.storyId || !lib.chapterId) return false;
      this.localSet(this.activeStoryKey, lib.storyId);
      this.localSet(this.activeChapterKey, lib.chapterId);
      this.localSet(this.storyCreatedKey, lib.storyCreatedAt || input.savedAt || new Date().toISOString());
      this.localSet(this.chapterCreatedKey, lib.chapterCreatedAt || input.savedAt || new Date().toISOString());
      this.localSet(this.chapterLabelKey, lib.chapterLabel || "章節");
      this.clearBranchRefs();
      if (lib.parentChapterId) this.localSet(this.branchParentKey, lib.parentChapterId);
      if (lib.branchPointMessageId) this.localSet(this.branchPointMessageKey, lib.branchPointMessageId);
      if (Number.isFinite(Number(lib.branchPointSeq)) && Number(lib.branchPointSeq) >= 0) this.localSet(this.branchPointSeqKey, Number(lib.branchPointSeq));
      if (lib.branchPointPreview) this.localSet(this.branchPointPreviewKey, lib.branchPointPreview);
      return true;
    },

    ensureRefs(payload = null) {
      let refs = this.refs();
      if (!refs.storyId || !refs.chapterId) refs = this.beginStory("第一章");
      if (!refs.storyCreatedAt) {
        refs.storyCreatedAt = payload?.savedAt || new Date().toISOString();
        this.localSet(this.storyCreatedKey, refs.storyCreatedAt);
      }
      if (!refs.chapterCreatedAt) {
        refs.chapterCreatedAt = payload?.savedAt || new Date().toISOString();
        this.localSet(this.chapterCreatedKey, refs.chapterCreatedAt);
      }
      if (!refs.chapterLabel) {
        refs.chapterLabel = "第一章";
        this.localSet(this.chapterLabelKey, refs.chapterLabel);
      }
      return refs;
    },

    open() {
      if (this._ready) return this._ready;
      if (typeof indexedDB === "undefined") {
        this._ready = Promise.resolve(null);
        return this._ready;
      }
      this._ready = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, this.dbVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          const store = db.objectStoreNames.contains(this.storeName)
            ? request.transaction.objectStore(this.storeName)
            : db.createObjectStore(this.storeName, { keyPath: "id" });
          if (!store.indexNames.contains("kind")) store.createIndex("kind", "kind", { unique: false });
          if (!store.indexNames.contains("storyId")) store.createIndex("storyId", "storyId", { unique: false });
          if (!store.indexNames.contains("chapterId")) store.createIndex("chapterId", "chapterId", { unique: false });
          if (!store.indexNames.contains("updatedAt")) store.createIndex("updatedAt", "updatedAt", { unique: false });
        };
        request.onsuccess = () => {
          this._db = request.result;
          this._db.onversionchange = () => this._db?.close?.();
          resolve(this._db);
        };
        request.onerror = () => reject(request.error || new Error("Story Library IndexedDB 無法開啟。"));
      }).catch(error => {
        console.warn("BAO/LAB Story Library unavailable:", error);
        return null;
      });
      return this._ready;
    },

    request(request) {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Story Library request failed."));
      });
    },

    transaction(mode, action) {
      if (!this._db) return Promise.reject(new Error("Story Library 尚未就緒。"));
      return new Promise((resolve, reject) => {
        const tx = this._db.transaction(this.storeName, mode);
        const store = tx.objectStore(this.storeName);
        try { action(store, tx); }
        catch (error) { reject(error); return; }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("Story Library transaction failed."));
        tx.onabort = () => reject(tx.error || new Error("Story Library transaction aborted."));
      });
    },

    async allRecords() {
      if (!await this.open()) return [];
      const tx = this._db.transaction(this.storeName, "readonly");
      return this.request(tx.objectStore(this.storeName).getAll());
    },

    storyRecord(payload, refs, previous = null) {
      const messages = payload.chat?.messages || [];
      const last = messages[messages.length - 1]?.content || "";
      return {
        id: "story:" + refs.storyId,
        kind: "story",
        storyId: refs.storyId,
        characterId: payload.characterId,
        characterName: payload.characterName,
        title: previous?.title || payload.characterName || "未命名故事",
        createdAt: refs.storyCreatedAt,
        updatedAt: payload.savedAt,
        activeChapterId: refs.chapterId,
        lastMessagePreview: String(last).slice(0, 160)
      };
    },

    chapterRecord(payload, refs, previous = null) {
      return {
        id: "chapter:" + refs.storyId + ":" + refs.chapterId,
        kind: "chapter",
        storyId: refs.storyId,
        chapterId: refs.chapterId,
        label: refs.chapterLabel || "章節",
        createdAt: refs.chapterCreatedAt,
        updatedAt: payload.savedAt,
        messageCount: Array.isArray(payload.chat?.messages) ? payload.chat.messages.length : 0,
        summary: String(payload.chat?.summary || ""),
        contextPack: Storage.scrubSecrets(this.clone(payload.contextPack || null)),
        parentChapterId: refs.parentChapterId || previous?.parentChapterId || "",
        branchPointMessageId: refs.branchPointMessageId || previous?.branchPointMessageId || "",
        branchPointSeq: Number.isFinite(Number(refs.branchPointSeq)) && Number(refs.branchPointSeq) >= 0 ? Number(refs.branchPointSeq) : Number(previous?.branchPointSeq ?? -1),
        branchPointPreview: refs.branchPointPreview || previous?.branchPointPreview || ""
      };
    },

    snapshotRecord(payload, refs) {
      const safe = Storage.scrubSecrets(this.clone(payload));
      delete safe.chat?.messages;
      return {
        id: "snapshot:" + refs.storyId + ":" + refs.chapterId,
        kind: "snapshot",
        storyId: refs.storyId,
        chapterId: refs.chapterId,
        updatedAt: payload.savedAt,
        payload: safe
      };
    },

    messageRecords(payload, refs) {
      const messages = Array.isArray(payload.chat?.messages) ? payload.chat.messages : [];
      return messages.map((message, index) => ({
        id: "message:" + refs.storyId + ":" + refs.chapterId + ":" + String(index).padStart(8, "0"),
        kind: "message",
        storyId: refs.storyId,
        chapterId: refs.chapterId,
        seq: index,
        messageId: String(message.id || ""),
        role: message.role,
        content: String(message.content || ""),
        createdAt: message.createdAt || payload.savedAt,
        updatedAt: payload.savedAt
      }));
    },

    checkpointRecord(payload, refs) {
      const messages = Array.isArray(payload.chat?.messages) ? payload.chat.messages : [];
      let seq = -1;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (messages[index]?.role === "assistant") { seq = index; break; }
      }
      if (seq < 0 || !messages[seq]?.id) return null;
      const safe = Storage.scrubSecrets(this.clone(payload));
      delete safe.chat?.messages;
      return {
        id: "checkpoint:" + refs.storyId + ":" + refs.chapterId + ":" + messages[seq].id,
        kind: "checkpoint",
        storyId: refs.storyId,
        chapterId: refs.chapterId,
        messageId: String(messages[seq].id),
        seq,
        updatedAt: payload.savedAt,
        payload: safe
      };
    },

    async persist(payload) {
      if (!payload || !Storage.validateStory(payload) || !await this.open()) return false;
      const refs = this.ensureRefs(payload);
      const records = await this.allRecords();
      const staleMessages = records.filter(record => record.kind === "message" && record.storyId === refs.storyId && record.chapterId === refs.chapterId);
      const messageIds = new Set((payload.chat?.messages || []).map(message => String(message?.id || "")).filter(Boolean));
      const staleCheckpoints = records.filter(record => record.kind === "checkpoint" && record.storyId === refs.storyId && record.chapterId === refs.chapterId && !messageIds.has(String(record.messageId || "")));
      const previousStory = records.find(record => record.kind === "story" && record.storyId === refs.storyId);
      const previousChapter = records.find(record => record.kind === "chapter" && record.storyId === refs.storyId && record.chapterId === refs.chapterId);
      const story = this.storyRecord(payload, refs, previousStory);
      const chapter = this.chapterRecord(payload, refs, previousChapter);
      const snapshot = this.snapshotRecord(payload, refs);
      const messages = this.messageRecords(payload, refs);
      const checkpoint = this.checkpointRecord(payload, refs);
      await this.transaction("readwrite", store => {
        staleMessages.forEach(record => store.delete(record.id));
        staleCheckpoints.forEach(record => store.delete(record.id));
        store.put(story);
        store.put(chapter);
        store.put(snapshot);
        messages.forEach(record => store.put(record));
        if (checkpoint) store.put(checkpoint);
      });
      return true;
    },

    queuePersist(payload) {
      const safe = Storage.scrubSecrets(this.clone(payload));
      const run = () => this.persist(safe).catch(error => {
        console.warn("BAO/LAB Story Library write failed:", error);
        return false;
      });
      this._writeQueue = this._writeQueue.then(run, run);
      return this._writeQueue;
    },

    async flush() {
      const database = await this.open();
      await this._writeQueue;
      return Boolean(database);
    },

    async listStories() {
      const records = await this.allRecords();
      const chapters = records.filter(record => record.kind === "chapter");
      return records
        .filter(record => record.kind === "story")
        .map(story => Object.assign({}, story, {
          chapterCount: chapters.filter(chapter => chapter.storyId === story.storyId).length
        }))
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    },

    async listChapters(storyId) {
      return (await this.allRecords())
        .filter(record => record.kind === "chapter" && record.storyId === storyId)
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
    },

    async renameStory(storyId, title) {
      const nextTitle = String(title || "").trim().slice(0, 100);
      if (!nextTitle || !await this.open()) return false;
      const record = (await this.allRecords()).find(item => item.kind === "story" && item.storyId === storyId);
      if (!record) return false;
      record.title = nextTitle;
      record.updatedAt = new Date().toISOString();
      await this.transaction("readwrite", store => store.put(record));
      return this.clone(record);
    },

    async renameChapter(storyId, chapterId, label) {
      const nextLabel = String(label || "").trim().slice(0, 100);
      if (!nextLabel || !await this.open()) return false;
      const record = (await this.allRecords()).find(item => item.kind === "chapter" && item.storyId === storyId && item.chapterId === chapterId);
      if (!record) return false;
      record.label = nextLabel;
      record.updatedAt = new Date().toISOString();
      await this.transaction("readwrite", store => store.put(record));
      const refs = this.refs();
      if (refs.storyId === storyId && refs.chapterId === chapterId) this.localSet(this.chapterLabelKey, nextLabel);
      return this.clone(record);
    },

    async createBranch(messageId, label = "") {
      if (!messageId || !await this.open()) throw new Error("找不到分支起點。");
      Storage.saveStory();
      await this.flush();
      const sourceRefs = this.refs();
      const records = await this.allRecords();
      const sourceMessages = records
        .filter(record => record.kind === "message" && record.storyId === sourceRefs.storyId && record.chapterId === sourceRefs.chapterId)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
      const point = sourceMessages.find(record => record.messageId === messageId && record.role === "assistant");
      if (!point) throw new Error("只能從已保存的 AI 回覆建立分支。");
      const checkpoint = records.find(record => record.kind === "checkpoint" && record.storyId === sourceRefs.storyId && record.chapterId === sourceRefs.chapterId && record.messageId === messageId);
      if (!checkpoint?.payload) throw new Error("這則舊回覆建立於分支功能完成之前，沒有當時的狀態檢查點。請從較新的回覆建立分支。");

      const payload = this.clone(checkpoint.payload);
      payload.savedAt = new Date().toISOString();
      payload.chat = payload.chat || {};
      payload.chat.messages = sourceMessages
        .filter(record => Number(record.seq) <= Number(point.seq))
        .map(record => ({ ...(record.messageId ? { id: record.messageId } : {}), role: record.role, content: record.content }));
      payload.chat.summarizedUntil = Math.min(Number(payload.chat.summarizedUntil || 0), payload.chat.messages.length);
      const refs = this.beginBranch({ label, messageId, seq: point.seq, preview: point.content });
      payload.label = refs.chapterLabel;
      payload._library = { ...refs };
      await this.persist(payload);
      return Storage.sanitizeImportedStory(payload);
    },

    async branchDescendants(storyId, chapterId) {
      const chapters = await this.listChapters(storyId);
      const found = new Set([chapterId]);
      let changed = true;
      while (changed) {
        changed = false;
        chapters.forEach(chapter => {
          if (chapter.parentChapterId && found.has(chapter.parentChapterId) && !found.has(chapter.chapterId)) {
            found.add(chapter.chapterId);
            changed = true;
          }
        });
      }
      found.delete(chapterId);
      return chapters.filter(chapter => found.has(chapter.chapterId));
    },

    async deleteBranch(storyId, chapterId) {
      if (!await this.open()) return false;
      const refs = this.refs();
      if (refs.storyId === storyId && refs.chapterId === chapterId) return false;
      const records = await this.allRecords();
      const target = records.find(record => record.kind === "chapter" && record.storyId === storyId && record.chapterId === chapterId);
      if (!target?.parentChapterId) return false;
      const descendants = await this.branchDescendants(storyId, chapterId);
      const ids = new Set([chapterId, ...descendants.map(item => item.chapterId)]);
      const doomed = records.filter(record => record.storyId === storyId && ids.has(record.chapterId));
      await this.transaction("readwrite", store => doomed.forEach(record => store.delete(record.id)));
      return { deleted: ids.size };
    },

    async deleteChapter(storyId, chapterId) {
      if (!await this.open()) return false;
      const refs = this.refs();
      if (refs.storyId === storyId && refs.chapterId === chapterId) return false;
      const records = await this.allRecords();
      const target = records.find(item => item.kind === "chapter" && item.storyId === storyId && item.chapterId === chapterId);
      if (!target) return false;
      if (records.some(item => item.kind === "chapter" && item.storyId === storyId && item.parentChapterId === chapterId)) return false;
      const chapterRecords = records.filter(item => item.storyId === storyId && item.chapterId === chapterId);
      await this.transaction("readwrite", store => chapterRecords.forEach(item => store.delete(item.id)));
      const remaining = records
        .filter(item => item.kind === "chapter" && item.storyId === storyId && item.chapterId !== chapterId)
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      if (!remaining.length) return this.deleteStory(storyId);
      const story = records.find(item => item.kind === "story" && item.storyId === storyId);
      if (story && story.activeChapterId === chapterId) {
        story.activeChapterId = remaining[remaining.length - 1].chapterId;
        story.updatedAt = new Date().toISOString();
        await this.transaction("readwrite", store => store.put(story));
      }
      return true;
    },

    async reconstruct(storyId, chapterId = "") {
      const records = await this.allRecords();
      const chapters = records.filter(record => record.kind === "chapter" && record.storyId === storyId)
        .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));
      const target = chapterId ? chapters.find(item => item.chapterId === chapterId) : chapters[chapters.length - 1];
      if (!target) return null;
      const snapshot = records.find(record => record.kind === "snapshot" && record.storyId === storyId && record.chapterId === target.chapterId);
      if (!snapshot?.payload) return null;
      const messages = records.filter(record => record.kind === "message" && record.storyId === storyId && record.chapterId === target.chapterId)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .map(record => ({ ...(record.messageId ? { id: record.messageId } : {}), role: record.role, content: record.content }));
      const payload = this.clone(snapshot.payload);
      payload.chat = payload.chat || {};
      payload.chat.messages = messages;
      payload._library = {
        storyId,
        chapterId: target.chapterId,
        storyCreatedAt: records.find(record => record.kind === "story" && record.storyId === storyId)?.createdAt || target.createdAt,
        chapterCreatedAt: target.createdAt,
        chapterLabel: target.label,
        parentChapterId: target.parentChapterId || "",
        branchPointMessageId: target.branchPointMessageId || "",
        branchPointSeq: Number(target.branchPointSeq ?? -1),
        branchPointPreview: target.branchPointPreview || ""
      };
      return Storage.sanitizeImportedStory(payload);
    },

    async deleteStory(storyId) {
      if (!await this.open()) return false;
      const records = (await this.allRecords()).filter(record => record.storyId === storyId);
      if (!records.length) return false;
      await this.transaction("readwrite", store => records.forEach(record => store.delete(record.id)));
      if (this.refs().storyId === storyId) this.clearRefs();
      return true;
    },

    install() {
      if (this._installed || !window.Storage || !window.App) return false;
      this._installed = true;

      const originalBuild = Storage.buildStoryPayload.bind(Storage);
      Storage.buildStoryPayload = (...args) => {
        const payload = originalBuild(...args);
        if (!payload) return payload;
        const refs = this.ensureRefs(payload);
        payload._library = {
          storyId: refs.storyId,
          chapterId: refs.chapterId,
          storyCreatedAt: refs.storyCreatedAt,
          chapterCreatedAt: refs.chapterCreatedAt,
          chapterLabel: refs.chapterLabel,
          parentChapterId: refs.parentChapterId || "",
          branchPointMessageId: refs.branchPointMessageId || "",
          branchPointSeq: Number(refs.branchPointSeq ?? -1),
          branchPointPreview: refs.branchPointPreview || ""
        };
        return payload;
      };

      const originalSaveStory = Storage.saveStory.bind(Storage);
      Storage.saveStory = (...args) => {
        if (this._pendingNextChapter) {
          this._pendingNextChapter = false;
          this.beginChapter("續篇");
        }
        const ok = originalSaveStory(...args);
        if (ok) {
          const payload = Storage.loadStory();
          if (payload) this.queuePersist(payload);
        }
        return ok;
      };

      const originalRestore = Storage.restoreStory.bind(Storage);
      Storage.restoreStory = input => {
        const restored = originalRestore(input);
        if (!restored) return false;
        if (!this.adoptRefs(input)) this.beginStory("第一章");
        return true;
      };

      const originalStart = App.startStory?.bind(App);
      if (originalStart) {
        App.startStory = (...args) => {
          this.beginStory("第一章");
          return originalStart(...args);
        };
      }

      if (window.BAOStoryTools?.startSequel) {
        const originalSequel = window.BAOStoryTools.startSequel.bind(window.BAOStoryTools);
        window.BAOStoryTools.startSequel = input => {
          const originalSaveSlot = Storage.saveSlot.bind(Storage);
          Storage.saveSlot = (...args) => {
            const result = originalSaveSlot(...args);
            if (result) this._pendingNextChapter = true;
            return result;
          };
          try { return originalSequel(input); }
          finally { Storage.saveSlot = originalSaveSlot; }
        };
      }

      const current = Storage.loadStory();
      if (current) {
        this.adoptRefs(current) || this.ensureRefs(current);
        this.queuePersist(current);
      }
      return true;
    }
  };

  window.BAOStoryLibrary = StoryLibrary;
  StoryLibrary.open().finally(() => StoryLibrary.install());
})();
