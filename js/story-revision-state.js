(() => {
  if (!window.App || !window.Chat || !window.Storage || !window.API || window.BAOStoryRevisionState) return;

  const clone = value => Storage.clone(value);
  const cleanState = value => {
    const state = Storage.scrubSecrets(clone(value || {}));
    if (state && typeof state === "object") delete state.config;
    return state;
  };
  const captureSnapshot = () => ({
    state: cleanState(window.GameState?.current || {}),
    summary: String(Chat.summary || ""),
    summarizedUntil: Number(Chat.summarizedUntil || 0),
    capturedAt: new Date().toISOString()
  });
  const applySnapshot = snapshot => {
    if (!snapshot?.state || !window.GameState) return false;
    GameState.current = clone(snapshot.state);
    GameState.current.config = App.config;
    Chat.summary = String(snapshot.summary || "");
    Chat.summarizedUntil = Math.max(0, Math.min(Number(snapshot.summarizedUntil || 0), Chat.messages.length));
    window.BAOCharacterStatus?.ensureState?.(App.activeCharacter);
    window.BAOWorldModules?.ensureState?.(App.activeCharacter);
    return true;
  };
  const latestAssistant = () => {
    for (let index = Chat.messages.length - 1; index >= 0; index -= 1) {
      if (Chat.messages[index]?.role === "assistant") return { message: Chat.messages[index], index };
    }
    return { message: null, index: -1 };
  };
  const playerBefore = index => {
    for (let cursor = Number(index) - 1; cursor >= 0; cursor -= 1) {
      if (Chat.messages[cursor]?.role === "user") return Chat.messages[cursor];
    }
    return null;
  };
  const activeVariant = message => {
    if (!Array.isArray(message?.variants) || !message.variants.length) return null;
    const index = Math.max(0, Math.min(Number(message.activeVariant || 0), message.variants.length - 1));
    return message.variants[index] || null;
  };
  const signatureOf = message => message?.id ? `${message.id}\n${String(message.content || "")}` : "";
  const baseFromPayload = payload => payload?.state ? {
    state: cleanState(payload.state),
    summary: String(payload.chat?.summary || ""),
    summarizedUntil: Number(payload.chat?.summarizedUntil || 0),
    capturedAt: String(payload.savedAt || new Date().toISOString())
  } : null;

  const patchLibrary = () => {
    const Library = window.BAOStoryLibrary;
    if (!Library || Library.__revisionStatePatched) return;

    const originalMessageRecords = Library.messageRecords.bind(Library);
    Library.messageRecords = function(payload, refs) {
      const records = originalMessageRecords(payload, refs);
      const messages = Array.isArray(payload?.chat?.messages) ? payload.chat.messages : [];
      records.forEach((record, index) => {
        record.messagePayload = Storage.scrubSecrets(this.clone(messages[index] || {}));
      });
      return records;
    };

    Library.revisionBaseFor = async function(messageId, source = {}) {
      if (!messageId || !await this.open()) return null;
      await this.flush();
      const refs = this.refs();
      const storyId = String(source.storyId || refs.storyId || "");
      const chapterId = String(source.chapterId || refs.chapterId || "");
      if (!storyId || !chapterId) return null;
      const records = await this.allRecords();
      const messages = records
        .filter(record => record.kind === "message" && record.storyId === storyId && record.chapterId === chapterId)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
      const targetIndex = messages.findIndex(record => record.messageId === messageId && record.role === "assistant");
      if (targetIndex < 0) return null;
      const embedded = messages[targetIndex]?.messagePayload?.revisionBase;
      if (embedded?.state) return this.clone(embedded);
      const previous = messages.slice(0, targetIndex).reverse().find(record => record.role === "assistant" && record.messageId);
      if (!previous) return null;
      const checkpoint = records.find(record => record.kind === "checkpoint" && record.storyId === storyId && record.chapterId === chapterId && record.messageId === previous.messageId);
      return checkpoint?.payload ? baseFromPayload(checkpoint.payload) : null;
    };

    const originalReconstruct = Library.reconstruct.bind(Library);
    Library.reconstruct = async function(storyId, chapterId = "") {
      const payload = await originalReconstruct(storyId, chapterId);
      if (!payload?._library?.chapterId) return payload;
      const records = await this.allRecords();
      const messages = records
        .filter(record => record.kind === "message" && record.storyId === storyId && record.chapterId === payload._library.chapterId)
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .map(record => record.messagePayload ? this.clone(record.messagePayload) : ({ ...(record.messageId ? { id: record.messageId } : {}), role: record.role, content: record.content }));
      payload.chat = payload.chat || {};
      payload.chat.messages = messages;
      return Storage.sanitizeImportedStory(payload);
    };

    const originalCreateBranch = Library.createBranch.bind(Library);
    Library.createBranch = async function(messageId, label = "") {
      const payload = await originalCreateBranch(messageId, label);
      const lib = payload?._library || {};
      if (!lib.storyId || !lib.chapterId || !lib.parentChapterId) return payload;
      const records = await this.allRecords();
      const sourceMessages = records
        .filter(record => record.kind === "message" && record.storyId === lib.storyId && record.chapterId === lib.parentChapterId && Number(record.seq) <= Number(lib.branchPointSeq))
        .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
        .map(record => record.messagePayload ? this.clone(record.messagePayload) : ({ ...(record.messageId ? { id: record.messageId } : {}), role: record.role, content: record.content }));
      if (!sourceMessages.length) return payload;
      payload.chat = payload.chat || {};
      payload.chat.messages = sourceMessages;
      payload.savedAt = new Date().toISOString();
      await this.persist(payload);
      return Storage.sanitizeImportedStory(payload);
    };

    Library.__revisionStatePatched = true;
  };

  patchLibrary();

  const originalAdd = Chat.add.bind(Chat);
  Chat.add = function(role, content) {
    const revisionBase = role === "assistant" ? captureSnapshot() : null;
    const message = originalAdd(role, content);
    if (role === "assistant" && message && !message.revisionBase && revisionBase?.state) message.revisionBase = revisionBase;
    return message;
  };

  const resolveBase = async message => {
    if (message?.revisionBase?.state) return clone(message.revisionBase);
    const Library = window.BAOStoryLibrary;
    if (!Library?.revisionBaseFor || !message?.id) return null;
    const found = await Library.revisionBaseFor(message.id);
    if (found?.state) {
      message.revisionBase = clone(found);
      return found;
    }
    return null;
  };

  const rebuildStoryToolMessages = messages => {
    const list = (Array.isArray(messages) ? messages : []).map(item => ({ ...item }));
    const systemIndex = list.findIndex(item => item?.role === "system");
    if (systemIndex < 0) return list;
    const previous = String(list[systemIndex].content || "");
    const marker = "【本次任務】";
    const taskIndex = previous.indexOf(marker);
    const base = App.buildSystemPrompt();
    list[systemIndex].content = taskIndex >= 0 ? `${base}\n\n${previous.slice(taskIndex)}` : base;
    return list;
  };

  const originalApiSend = API.send.bind(API);
  API.send = async function(config, messages) {
    if (!config?.__storyTool) return originalApiSend(config, messages);
    const { message } = latestAssistant();
    if (!message) return originalApiSend(config, messages);
    const base = await resolveBase(message);
    if (!base) return originalApiSend(config, messages);
    const current = captureSnapshot();
    applySnapshot(base);
    try {
      return await originalApiSend(config, rebuildStoryToolMessages(messages));
    } finally {
      applySnapshot(current);
    }
  };

  let revisionQueue = Promise.resolve();
  let lastSavedSignature = signatureOf(latestAssistant().message);
  const enqueue = task => {
    const run = () => Promise.resolve().then(task);
    revisionQueue = revisionQueue.then(run, run);
    return revisionQueue;
  };

  const refreshDerivedUI = () => {
    const memory = document.getElementById("usage-memory");
    if (memory && App.config?.memory) memory.textContent = Chat.memoryStatus(App.config.memory.maxRounds);
    if (App.config?.displayMode === "ui") {
      const panel = document.querySelector(".ui-tab.active")?.dataset.panel || "npc";
      App.renderUIPanel?.(panel);
    }
  };

  const reconcile = async (messageId, expectedContent) => {
    const index = Chat.messages.findIndex(item => item?.id === messageId);
    const message = index >= 0 ? Chat.messages[index] : null;
    if (!message || message.role !== "assistant" || String(message.content || "") !== expectedContent) return false;
    const variant = activeVariant(message);
    if (variant?.derivedSnapshot?.state) {
      applySnapshot(variant.derivedSnapshot);
      refreshDerivedUI();
      return true;
    }
    const base = await resolveBase(message);
    const player = playerBefore(index);
    if (!base || !player) {
      console.warn("BAO/LAB could not find a safe revision base for", messageId);
      return false;
    }
    applySnapshot(base);
    if (window.WorldStateEngine?.update) await WorldStateEngine.update(App.config, player.content, expectedContent);
    if (String(message.content || "") !== expectedContent) return false;
    await Chat.afterTurn?.(App.config);
    const selected = activeVariant(message);
    if (selected && String(selected.content || "") === expectedContent) selected.derivedSnapshot = captureSnapshot();
    originalAppSave(false);
    refreshDerivedUI();
    return true;
  };

  const originalAppSave = App.saveStory.bind(App);
  App.saveStory = function(...args) {
    const { message } = latestAssistant();
    const nextSignature = signatureOf(message);
    const revised = Boolean(message?.id && lastSavedSignature && nextSignature && nextSignature !== lastSavedSignature && lastSavedSignature.startsWith(`${message.id}\n`));
    let cached = null;
    if (revised) {
      cached = activeVariant(message)?.derivedSnapshot || null;
      if (cached?.state) applySnapshot(cached);
      else if (message.revisionBase?.state) applySnapshot(message.revisionBase);
    }
    const result = originalAppSave(...args);
    if (nextSignature) lastSavedSignature = nextSignature;
    if (revised) {
      const messageId = message.id;
      const expectedContent = String(message.content || "");
      enqueue(() => reconcile(messageId, expectedContent));
    }
    return result;
  };

  const originalSendMessage = App.sendMessage?.bind(App);
  if (originalSendMessage) {
    App.sendMessage = async function(...args) {
      await revisionQueue;
      return originalSendMessage(...args);
    };
  }

  window.BAOStoryRevisionState = {
    version: 1,
    captureSnapshot,
    applySnapshot,
    reconcile,
    whenIdle: () => revisionQueue,
    patchLibrary
  };
})();
