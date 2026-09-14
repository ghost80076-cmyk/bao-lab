(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof Storage === "undefined" || typeof GameState === "undefined") return;

  const DB_NAME = "bao-lab-story-library";
  const DB_VERSION = 1;
  const STORES = {
    stories: "stories",
    chapters: "chapters",
    messages: "messages"
  };

  let db = null;
  let initPromise = null;
  let currentStoryId = "";
  let currentChapterId = "";
  let pendingNewStory = false;
  let lastError = null;

  const clone = value => Storage.clone(value);
  const scrub = value => Storage.scrubSecrets(clone(value));
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const nowISO = () => new Date().toISOString();
  const esc = value => App.escapeHTML(String(value ?? ""));
  const localDate = value => {
    try { return new Date(value).toLocaleString("zh-TW"); }
    catch { return String(value || ""); }
  };

  const request = req => new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB request failed."));
  });

  const transaction = (storeNames, mode, action) => new Promise((resolve, reject) => {
    if (!db) { reject(new Error("故事資料庫尚未就緒。")); return; }
    const names = Array.isArray(storeNames) ? storeNames : [storeNames];
    const tx = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map(name => [name, tx.objectStore(name)]));
    try { action(stores, tx); }
    catch (error) { reject(error); return; }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });

  const get = async (storeName, id) => {
    const tx = db.transaction(storeName, "readonly");
    return await request(tx.objectStore(storeName).get(id));
  };

  const getAll = async (storeName, indexName = "", value) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const source = indexName ? store.index(indexName) : store;
    const result = await request(value === undefined ? source.getAll() : source.getAll(value));
    return Array.isArray(result) ? result : [];
  };

  const put = (storeName, value) => transaction(storeName, "readwrite", stores => stores[storeName].put(value));

  const openDatabase = () => new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("此瀏覽器未提供 IndexedDB，故事庫功能無法啟用。"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      const storyStore = database.objectStoreNames.contains(STORES.stories)
        ? req.transaction.objectStore(STORES.stories)
        : database.createObjectStore(STORES.stories, { keyPath: "id" });
      if (!storyStore.indexNames.contains("updatedAt")) storyStore.createIndex("updatedAt", "updatedAt", { unique: false });
      if (!storyStore.indexNames.contains("characterId")) storyStore.createIndex("characterId", "characterId", { unique: false });

      const chapterStore = database.objectStoreNames.contains(STORES.chapters)
        ? req.transaction.objectStore(STORES.chapters)
        : database.createObjectStore(STORES.chapters, { keyPath: "id" });
      if (!chapterStore.indexNames.contains("storyId")) chapterStore.createIndex("storyId", "storyId", { unique: false });
      if (!chapterStore.indexNames.contains("updatedAt")) chapterStore.createIndex("updatedAt", "updatedAt", { unique: false });

      const messageStore = database.objectStoreNames.contains(STORES.messages)
        ? req.transaction.objectStore(STORES.messages)
        : database.createObjectStore(STORES.messages, { keyPath: "id" });
      if (!messageStore.indexNames.contains("storyId")) messageStore.createIndex("storyId", "storyId", { unique: false });
      if (!messageStore.indexNames.contains("chapterId")) messageStore.createIndex("chapterId", "chapterId", { unique: false });
      if (!messageStore.indexNames.contains("seq")) messageStore.createIndex("seq", "seq", { unique: false });
    };
    req.onsuccess = () => {
      const database = req.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    req.onerror = () => reject(req.error || new Error("無法開啟故事資料庫。"));
    req.onblocked = () => console.warn("BAO/LAB story library upgrade is blocked by another tab.");
  });

  const normalizeMessage = (input, seq, storyId, chapterId) => ({
    id: `${chapterId}:${String(seq).padStart(8, "0")}`,
    storyId,
    chapterId,
    seq,
    role: input?.role === "user" ? "user" : "assistant",
    content: String(input?.content || ""),
    createdAt: String(input?.createdAt || nowISO())
  });

  const buildStoryTitle = characterName => `${characterName || "故事"} · ${new Date().toLocaleDateString("zh-TW")}`;

  const createStoryRecord = (storyId, title = "") => {
    const createdAt = nowISO();
    const character = scrub(Storage.characterSnapshot?.() || App.activeCharacter || null);
    return {
      id: storyId,
      schema: "bao-lab-story-library",
      version: 1,
      title: String(title || buildStoryTitle(App.activeCharacter?.name)),
      characterId: String(App.activeCharacter?.id || ""),
      characterName: String(App.activeCharacter?.name || ""),
      character,
      createdAt,
      updatedAt: createdAt,
      activeChapterId: "",
      chapterCount: 0,
      messageCount: 0,
      latestPreview: "",
      archived: false
    };
  };

  const createChapterRecord = (storyId, chapterId, number, title = "") => {
    const timestamp = nowISO();
    return {
      id: chapterId,
      schema: "bao-lab-story-chapter",
      version: 1,
      storyId,
      number,
      title: String(title || `第 ${number} 篇`),
      createdAt: timestamp,
      updatedAt: timestamp,
      messageCount: 0,
      summary: "",
      summarizedUntil: 0,
      usage: {},
      lastStoryPromptTokens: 0,
      contextPack: null,
      contextPackId: "",
      config: {},
      preferences: {},
      state: {}
    };
  };

  const listStories = async () => {
    const available = await ready();
    if (!available) return [];
    return (await getAll(STORES.stories)).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  };

  const listChapters = async storyId => {
    const available = await ready();
    if (!available) return [];
    return (await getAll(STORES.chapters, "storyId", String(storyId || "")))
      .sort((a, b) => Number(a.number || 0) - Number(b.number || 0));
  };

  const listMessages = async chapterId => {
    const available = await ready();
    if (!available) return [];
    return (await getAll(STORES.messages, "chapterId", String(chapterId || "")))
      .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  };

  const recalcStory = async (story, activeChapterId, latestMessages = null) => {
    const chapters = await listChapters(story.id);
    const messageCount = chapters.reduce((sum, chapter) => sum + Number(chapter.messageCount || 0), 0);
    let previewMessages = latestMessages;
    if (!previewMessages && activeChapterId) previewMessages = await listMessages(activeChapterId);
    const latest = Array.isArray(previewMessages) && previewMessages.length ? previewMessages[previewMessages.length - 1] : null;
    return Object.assign({}, story, {
      updatedAt: nowISO(),
      activeChapterId: activeChapterId || story.activeChapterId || "",
      chapterCount: chapters.length,
      messageCount,
      latestPreview: String(latest?.content || "").replace(/\s+/g, " ").slice(0, 120)
    });
  };

  const syncMessages = async (storyId, chapter, messages) => {
    const normalized = (Array.isArray(messages) ? messages : []).map((message, seq) => normalizeMessage(message, seq, storyId, chapter.id));
    const previousCount = Number(chapter.messageCount || 0);

    if (normalized.length < previousCount) {
      const existing = await listMessages(chapter.id);
      await transaction(STORES.messages, "readwrite", stores => {
        existing.forEach(item => stores[STORES.messages].delete(item.id));
        normalized.forEach(item => stores[STORES.messages].put(item));
      });
      return normalized;
    }

    if (normalized.length > previousCount) {
      await transaction(STORES.messages, "readwrite", stores => {
        normalized.slice(previousCount).forEach(item => stores[STORES.messages].put(item));
      });
    }
    return normalized;
  };

  const importSave = async (input, options = {}) => {
    if (!db) {
      const available = await ready();
      if (!available) throw lastError || new Error("故事資料庫無法使用。");
    }
    const save = Storage.sanitizeImportedStory(input);
    const storyId = String(options.storyId || uid("story"));
    const chapterId = String(options.chapterId || uid("chapter"));
    const timestamp = String(save.savedAt || nowISO());
    const story = {
      id: storyId,
      schema: "bao-lab-story-library",
      version: 1,
      title: String(options.title || save.label || `${save.characterName || save.characterId} · 匯入故事`),
      characterId: String(save.characterId || ""),
      characterName: String(save.characterName || ""),
      character: scrub(save.character || null),
      createdAt: timestamp,
      updatedAt: timestamp,
      activeChapterId: chapterId,
      chapterCount: 1,
      messageCount: Number(save.chat?.messages?.length || 0),
      latestPreview: String(save.chat?.messages?.at?.(-1)?.content || "").replace(/\s+/g, " ").slice(0, 120),
      archived: false,
      source: String(options.source || "import")
    };
    const state = scrub(save.state || {});
    state.libraryStoryId = storyId;
    state.libraryChapterId = chapterId;
    const chapter = {
      id: chapterId,
      schema: "bao-lab-story-chapter",
      version: 1,
      storyId,
      number: 1,
      title: String(options.chapterTitle || "第 1 篇"),
      createdAt: timestamp,
      updatedAt: timestamp,
      messageCount: story.messageCount,
      summary: String(save.chat?.summary || ""),
      summarizedUntil: Number(save.chat?.summarizedUntil || 0),
      usage: scrub(save.chat?.usage || {}),
      lastStoryPromptTokens: Number(save.chat?.lastStoryPromptTokens || 0),
      contextPack: scrub(save.contextPack || state.contextPack || null),
      contextPackId: String(save.contextPack?.id || state.contextPack?.id || ""),
      config: scrub(save.config || {}),
      preferences: scrub(save.preferences || {}),
      state
    };
    const messages = (save.chat?.messages || []).map((message, seq) => normalizeMessage(message, seq, storyId, chapterId));
    await transaction([STORES.stories, STORES.chapters, STORES.messages], "readwrite", stores => {
      stores[STORES.stories].put(story);
      stores[STORES.chapters].put(chapter);
      messages.forEach(message => stores[STORES.messages].put(message));
    });
    return { story, chapter };
  };

  const migrateAutosaveIfNeeded = async () => {
    const stories = await getAll(STORES.stories);
    if (stories.length) return false;
    await Storage.ready?.();
    const save = Storage.loadStory?.();
    if (!save) return false;
    await importSave(save, { title: save.label === "自動存檔" ? `${save.characterName || save.characterId} · 目前故事` : save.label, source: "legacy-autosave" });
    return true;
  };

  const init = () => {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      try {
        db = await openDatabase();
        await migrateAutosaveIfNeeded();
        return true;
      } catch (error) {
        lastError = error;
        console.warn("BAO/LAB story library unavailable:", error);
        return false;
      }
    })();
    return initPromise;
  };

  const ready = () => init();

  const activeIdsFromState = () => ({
    storyId: String(GameState.current?.libraryStoryId || currentStoryId || ""),
    chapterId: String(GameState.current?.libraryChapterId || currentChapterId || "")
  });

  const persistCurrent = async (options = {}) => {
    const available = await ready();
    if (!available || !App.activeCharacter || !GameState.current) return null;

    const messages = clone(Chat.messages || []);
    const forceNewStory = Boolean(options.forceNewStory);
    let { storyId, chapterId } = activeIdsFromState();
    let story = !forceNewStory && storyId ? await get(STORES.stories, storyId) : null;
    let chapter = !forceNewStory && chapterId ? await get(STORES.chapters, chapterId) : null;

    if (!story) {
      storyId = uid("story");
      story = createStoryRecord(storyId, options.title || "");
      chapterId = uid("chapter");
      chapter = createChapterRecord(storyId, chapterId, 1);
    } else if (!chapter || chapter.storyId !== story.id) {
      chapterId = story.activeChapterId || uid("chapter");
      chapter = await get(STORES.chapters, chapterId);
      if (!chapter) chapter = createChapterRecord(story.id, chapterId, Number(story.chapterCount || 0) + 1);
    }

    const oldMessageCount = Number(chapter.messageCount || 0);
    const incomingPackId = String(GameState.current?.contextPack?.id || "");
    const sequelDetected = oldMessageCount > 0 && messages.length < oldMessageCount;
    if (!forceNewStory && sequelDetected) {
      const chapterNumber = Number(story.chapterCount || 0) + 1;
      chapterId = uid("chapter");
      chapter = createChapterRecord(story.id, chapterId, chapterNumber);
    }

    currentStoryId = story.id;
    currentChapterId = chapter.id;
    GameState.current.libraryStoryId = story.id;
    GameState.current.libraryChapterId = chapter.id;

    const safeConfig = scrub(App.config || {});
    const safeState = scrub(GameState.current || {});
    safeState.config = safeConfig;
    const safePreferences = scrub(Storage.preferenceSnapshot?.() || {});
    const safeContextPack = scrub(GameState.current?.contextPack || null);

    const normalizedMessages = await syncMessages(story.id, chapter, messages);
    chapter = Object.assign({}, chapter, {
      updatedAt: nowISO(),
      messageCount: normalizedMessages.length,
      summary: String(Chat.summary || ""),
      summarizedUntil: Number(Chat.summarizedUntil || 0),
      usage: scrub(Chat.usage || {}),
      lastStoryPromptTokens: Number(Chat.lastStoryPromptTokens || 0),
      contextPack: safeContextPack,
      contextPackId: incomingPackId,
      config: safeConfig,
      preferences: safePreferences,
      state: safeState
    });
    await put(STORES.chapters, chapter);

    story = Object.assign({}, story, {
      characterId: String(App.activeCharacter.id || story.characterId || ""),
      characterName: String(App.activeCharacter.name || story.characterName || ""),
      character: scrub(Storage.characterSnapshot?.() || App.activeCharacter || story.character || null),
      activeChapterId: chapter.id
    });
    story = await recalcStory(story, chapter.id, normalizedMessages);
    await put(STORES.stories, story);
    refreshButtons();
    return { story: clone(story), chapter: clone(chapter) };
  };

  const composeStorySave = async (storyId, chapterId = "") => {
    const available = await ready();
    if (!available) return null;
    const story = await get(STORES.stories, String(storyId || ""));
    if (!story) return null;
    const targetChapterId = chapterId || story.activeChapterId;
    const chapter = await get(STORES.chapters, targetChapterId);
    if (!chapter) return null;
    const records = await listMessages(chapter.id);
    const state = scrub(chapter.state || {});
    state.libraryStoryId = story.id;
    state.libraryChapterId = chapter.id;
    const config = scrub(chapter.config || state.config || {});
    state.config = config;
    return Storage.sanitizeImportedStory({
      schema: Storage.storySchema,
      version: Storage.storyVersion,
      label: story.title,
      savedAt: chapter.updatedAt || story.updatedAt || nowISO(),
      characterId: story.characterId,
      characterName: story.characterName,
      character: scrub(story.character || null),
      config,
      preferences: scrub(chapter.preferences || {}),
      chat: {
        messages: records.map(item => ({ role: item.role, content: item.content })),
        summary: String(chapter.summary || ""),
        summarizedUntil: Number(chapter.summarizedUntil || 0),
        usage: scrub(chapter.usage || {}),
        lastStoryPromptTokens: Number(chapter.lastStoryPromptTokens || 0)
      },
      contextPack: scrub(chapter.contextPack || state.contextPack || null),
      state
    });
  };

  const resumeStory = async storyId => {
    const save = await composeStorySave(storyId);
    if (!save) { alert("找不到這個故事的可讀取篇章。"); return false; }
    if (!Storage.restoreStory(save)) { alert("無法讀取這個故事。"); return false; }
    currentStoryId = String(save.state?.libraryStoryId || "");
    currentChapterId = String(save.state?.libraryChapterId || "");
    if (!save.config?.demoMode) {
      const key = window.prompt("API Key 不會寫入故事庫。請重新貼上 API Key：", "");
      if (key === null) return false;
      App.config.api = Object.assign({}, App.config.api || {}, { key: key.trim() });
    }
    if (GameState.current) GameState.current.config = App.config;
    App.renderChatShell(false);
    App.showView("chat");
    Storage.saveStory();
    window.BAORefreshSaveUI?.();
    return true;
  };

  const renameStory = async (storyId, title) => {
    const story = await get(STORES.stories, storyId);
    if (!story) return false;
    story.title = String(title || story.title).trim() || story.title;
    story.updatedAt = nowISO();
    await put(STORES.stories, story);
    return true;
  };

  const deleteStory = async storyId => {
    const available = await ready();
    if (!available) return false;
    const chapters = await getAll(STORES.chapters, "storyId", storyId);
    const messages = await getAll(STORES.messages, "storyId", storyId);
    await transaction([STORES.stories, STORES.chapters, STORES.messages], "readwrite", stores => {
      stores[STORES.stories].delete(storyId);
      chapters.forEach(chapter => stores[STORES.chapters].delete(chapter.id));
      messages.forEach(message => stores[STORES.messages].delete(message.id));
    });
    if (currentStoryId === storyId) {
      currentStoryId = "";
      currentChapterId = "";
      if (GameState.current) {
        delete GameState.current.libraryStoryId;
        delete GameState.current.libraryChapterId;
      }
    }
    refreshButtons();
    return true;
  };

  const status = () => ({
    ready: Boolean(db),
    database: db ? DB_NAME : null,
    currentStoryId,
    currentChapterId,
    lastError: lastError ? String(lastError.message || lastError) : ""
  });

  const ensureStyles = () => {
    if (document.getElementById("bao-story-library-style")) return;
    const style = document.createElement("style");
    style.id = "bao-story-library-style";
    style.textContent = `
      .bao-library-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px}
      .bao-library-modal{width:min(980px,96vw);max-height:88vh;overflow:auto;background:#111;border:1px solid #333;border-radius:18px;padding:22px;color:#eee;box-shadow:0 24px 80px rgba(0,0,0,.5)}
      .bao-library-head{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:18px}.bao-library-head h2{margin:4px 0 8px}.bao-library-head p{margin:0;color:#aaa}
      .bao-library-grid{display:grid;gap:14px}.bao-library-card{border:1px solid #303030;border-radius:14px;padding:16px;background:#171717}.bao-library-card.current{border-color:#666}.bao-library-row{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.bao-library-meta{color:#aaa;font-size:13px;line-height:1.7}.bao-library-preview{margin-top:10px;color:#d5d5d5;line-height:1.6}.bao-library-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.bao-library-chapters{margin-top:12px;padding-top:12px;border-top:1px solid #292929;display:grid;gap:6px}.bao-library-chapter{display:flex;justify-content:space-between;gap:12px;color:#bbb;font-size:13px}.bao-library-empty{padding:28px;text-align:center;color:#999;border:1px dashed #333;border-radius:14px}
      @media(max-width:700px){.bao-library-row{display:block}.bao-library-actions button{flex:1}.bao-library-modal{padding:16px}}
    `;
    document.head.appendChild(style);
  };

  const closeManager = () => document.querySelector(".bao-library-backdrop")?.remove();

  const renderManager = async () => {
    const wrap = document.querySelector(".bao-library-backdrop");
    const host = wrap?.querySelector(".bao-library-main");
    if (!host) return;
    const available = await ready();
    if (!available) {
      host.innerHTML = `<div class="bao-library-empty">故事庫無法啟用：${esc(lastError?.message || "IndexedDB unavailable")}</div>`;
      return;
    }
    const stories = await listStories();
    const chaptersByStory = new Map();
    for (const story of stories) chaptersByStory.set(story.id, await listChapters(story.id));

    host.innerHTML = stories.length ? `<div class="bao-library-grid">${stories.map(story => {
      const chapters = chaptersByStory.get(story.id) || [];
      const isCurrent = story.id === currentStoryId || story.id === GameState.current?.libraryStoryId;
      return `<article class="bao-library-card${isCurrent ? " current" : ""}" data-story-card="${esc(story.id)}">
        <div class="bao-library-row"><div><div class="eyebrow">${isCurrent ? "CURRENT STORY" : "LOCAL STORY"}</div><h3>${esc(story.title)}</h3><div class="bao-library-meta">${esc(story.characterName || story.characterId)} · ${chapters.length} 篇 · ${Number(story.messageCount || 0).toLocaleString()} 則訊息<br>最後更新：${esc(localDate(story.updatedAt))}</div></div></div>
        ${story.latestPreview ? `<div class="bao-library-preview">${esc(story.latestPreview)}</div>` : ""}
        <div class="bao-library-actions"><button class="primary" type="button" data-open-story="${esc(story.id)}">繼續故事</button><button class="secondary" type="button" data-rename-story="${esc(story.id)}">重新命名</button><button class="text-button" type="button" data-delete-story="${esc(story.id)}">刪除</button></div>
        <div class="bao-library-chapters">${chapters.map(chapter => `<div class="bao-library-chapter"><span>${esc(chapter.title || `第 ${chapter.number} 篇`)}</span><span>${Number(chapter.messageCount || 0).toLocaleString()} 則 · ${esc(localDate(chapter.updatedAt))}${chapter.id === story.activeChapterId ? " · 目前" : ""}</span></div>`).join("") || '<span class="note">尚無篇章資料。</span>'}</div>
      </article>`;
    }).join("")}</div>` : '<div class="bao-library-empty">目前還沒有故事。建立新故事後會自動加入這裡。</div>';

    host.querySelectorAll("[data-open-story]").forEach(button => button.onclick = async () => {
      button.disabled = true;
      try { if (await resumeStory(button.dataset.openStory)) closeManager(); }
      finally { button.disabled = false; }
    });
    host.querySelectorAll("[data-rename-story]").forEach(button => button.onclick = async () => {
      const story = stories.find(item => item.id === button.dataset.renameStory);
      if (!story) return;
      const title = prompt("故事名稱：", story.title || "");
      if (title === null) return;
      await renameStory(story.id, title);
      await renderManager();
    });
    host.querySelectorAll("[data-delete-story]").forEach(button => button.onclick = async () => {
      const story = stories.find(item => item.id === button.dataset.deleteStory);
      if (!story || !confirm(`確定刪除「${story.title}」？這會刪除它的所有篇章與訊息，無法復原。`)) return;
      await deleteStory(story.id);
      await renderManager();
    });
  };

  const openManager = async () => {
    ensureStyles();
    closeManager();
    const wrap = document.createElement("div");
    wrap.className = "bao-library-backdrop";
    wrap.innerHTML = `<section class="bao-library-modal"><div class="bao-library-head"><div><div class="eyebrow">LOCAL-FIRST STORY LIBRARY</div><h2>故事庫</h2><p>故事、篇章與訊息分開保存於這台裝置的 IndexedDB。</p></div><button class="story-tools-close" type="button" data-close-library>關閉</button></div><div class="bao-library-main"><div class="bao-library-empty">讀取中…</div></div></section>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", event => { if (event.target === wrap) closeManager(); });
    wrap.querySelector("[data-close-library]").onclick = closeManager;
    await renderManager();
  };

  const refreshButtons = async () => {
    const nav = document.querySelector(".topbar nav");
    if (nav && !nav.querySelector("[data-bao-story-library]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.baoStoryLibrary = "nav";
      button.textContent = "故事庫";
      button.onclick = openManager;
      nav.appendChild(button);
    }
    const row = document.getElementById("bao-player-settings");
    if (row && !row.querySelector("[data-bao-story-library]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.baoStoryLibrary = "chat";
      button.textContent = "▦ 故事庫";
      button.onclick = openManager;
      row.appendChild(button);
    }
  };

  const originalSaveStory = App.saveStory.bind(App);
  App.saveStory = function(notify = false) {
    const ok = originalSaveStory(notify);
    if (ok) {
      const forceNewStory = pendingNewStory;
      pendingNewStory = false;
      persistCurrent({ forceNewStory }).catch(error => {
        lastError = error;
        console.warn("BAO/LAB story library save failed:", error);
      });
    }
    return ok;
  };

  const originalStartStory = App.startStory.bind(App);
  App.startStory = function() {
    const previousState = GameState.current;
    pendingNewStory = true;
    const result = originalStartStory();
    if (GameState.current === previousState) pendingNewStory = false;
    return result;
  };

  const originalRestoreStory = Storage.restoreStory.bind(Storage);
  Storage.restoreStory = function(input) {
    const ok = originalRestoreStory(input);
    if (ok) {
      currentStoryId = String(GameState.current?.libraryStoryId || input?.state?.libraryStoryId || "");
      currentChapterId = String(GameState.current?.libraryChapterId || input?.state?.libraryChapterId || "");
    }
    return ok;
  };

  const originalRenderChatShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    originalRenderChatShell(fresh);
    setTimeout(refreshButtons, 0);
  };

  window.BAOStoryLibrary = {
    ready,
    status,
    listStories,
    listChapters,
    listMessages,
    persistCurrent,
    importSave,
    composeStorySave,
    resumeStory,
    renameStory,
    deleteStory,
    open: openManager
  };

  init().then(refreshButtons);
  setTimeout(refreshButtons, 260);
})();
