(() => {
  if (!window.App || !window.Chat || !window.Storage || !window.API || window.BAOStoryRevisionState) return;

  const clone = value => Storage.clone(value);
  // Applying a revision snapshot replaces the state object within the same
  // story. Track that lineage without treating external story restores as it.
  const lineages = new WeakMap();
  const storyToken = () => {
    const state = GameState.current;
    if (!state || typeof state !== 'object') return state;
    if (!lineages.has(state)) lineages.set(state, {});
    return lineages.get(state);
  };
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
    const token = storyToken();
    GameState.current = clone(snapshot.state);
    lineages.set(GameState.current, token);
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

  const revisionSnapshotWrapper = async (next, config, messages) => {
    if (!config?.__storyTool) return next(config, messages);
    const token = storyToken(), appConfig = App.config, character = App.activeCharacter;
    const { message } = latestAssistant();
    if (!message) return next(config, messages);
    const signature = signatureOf(message);
    const current = () => storyToken() === token && App.config === appConfig && App.activeCharacter === character
      && signatureOf(latestAssistant().message) === signature;
    const base = await resolveBase(message);
    if (!current()) throw Object.assign(new Error('故事已切換或修訂來源已變更。'), { code: 'BAO_ABORTED' });
    if (!base) return next(config, messages);
    const snapshot = captureSnapshot();
    applySnapshot(base);
    try {
      return await next(config, rebuildStoryToolMessages(messages));
    } finally {
      if (current()) applySnapshot(snapshot);
    }
  };
  if (typeof API.wrapSend === "function") {
    API.wrapSend("story-revision-state:snapshot", revisionSnapshotWrapper);
  } else {
    // Compatibility for an older cached API without named registration.
    const originalApiSend = API.send.bind(API);
    API.send = (config, messages) => revisionSnapshotWrapper(originalApiSend, config, messages);
  }

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

  const reconcile = async (messageId, expectedContent, token = storyToken()) => {
    const config = App.config, character = App.activeCharacter;
    const current = () => storyToken() === token && App.config === config && App.activeCharacter === character
      && Chat.messages.some(item => item.id === messageId && String(item.content || '') === expectedContent);
    if (!current()) return false;
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
    if (!current()) return false;
    const player = playerBefore(index);
    if (!base || !player) {
      console.warn("BAO/LAB could not find a safe revision base for", messageId);
      return false;
    }
    applySnapshot(base);
    if (window.WorldStateEngine?.update) await WorldStateEngine.update(App.config, player.content, expectedContent);
    if (!current()) return false;
    await Chat.afterTurn?.(App.config);
    if (!current()) return false;
    const selected = activeVariant(Chat.messages.find(item => item.id === messageId));
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
      const token = storyToken();
      enqueue(() => reconcile(messageId, expectedContent, token));
    }
    return result;
  };

  const originalSendMessage = App.sendMessage?.bind(App);
  if (originalSendMessage) {
    const revisionWaitWrapper = async function(next, ...args) {
      const token = storyToken(), config = this.config, character = this.activeCharacter;
      const input = document.getElementById('user-input'), text = input?.value;
      const signature = () => JSON.stringify(Chat.messages.map(m => [m.id, m.role, m.content, m.context_content || '']));
      const source = signature();
      await revisionQueue;
      if (storyToken() !== token || this.config !== config || this.activeCharacter !== character
        || signature() !== source || input?.value !== text) return;
      return next(...args);
    };
    if (typeof App.wrapSendMessage === 'function') App.wrapSendMessage('story-revision-state:wait', revisionWaitWrapper);
    else App.sendMessage = (...args) => revisionWaitWrapper.call(App, originalSendMessage, ...args);
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
