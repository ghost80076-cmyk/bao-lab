const Storage = {
  prefix: "bao-lab:",
  set(key, value) { localStorage.setItem(this.prefix + key, JSON.stringify(value)); },
  get(key, fallback = null) {
    try { const raw = localStorage.getItem(this.prefix + key); return raw ? JSON.parse(raw) : fallback; }
    catch { return fallback; }
  },
  remove(key) { localStorage.removeItem(this.prefix + key); },

  storyKey: "story:autosave",

  saveStory() {
    if (!window.App?.activeCharacter || !window.GameState?.current) return false;
    const api = App.config?.api || {};
    const safeConfig = structuredClone(App.config || {});
    if (safeConfig.api) safeConfig.api.key = ""; // API Key is never persisted.
    const payload = {
      version: 1,
      savedAt: new Date().toISOString(),
      characterId: App.activeCharacter.id,
      config: safeConfig,
      chat: {
        messages: structuredClone(Chat.messages || []),
        summary: Chat.summary || "",
        summarizedUntil: Chat.summarizedUntil || 0,
        usage: structuredClone(Chat.usage || {})
      },
      state: structuredClone(GameState.current)
    };
    if (payload.state?.config?.api) payload.state.config.api.key = "";
    this.set(this.storyKey, payload);
    return true;
  },

  loadStory() { return this.get(this.storyKey, null); },
  hasStory() { return Boolean(this.loadStory()); },
  clearStory() { this.remove(this.storyKey); },

  restoreStory(save) {
    if (!save || !window.App || !window.Chat || !window.GameState) return false;
    const character = App.characters.find(c => c.id === save.characterId);
    if (!character) return false;
    App.activeCharacter = character;
    App.config = structuredClone(save.config || {});
    Chat.messages = structuredClone(save.chat?.messages || []);
    Chat.summary = save.chat?.summary || "";
    Chat.summarizedUntil = Number(save.chat?.summarizedUntil || 0);
    Chat.usage = structuredClone(save.chat?.usage || { prompt:0, completion:0, cached:0, total:0 });
    GameState.current = structuredClone(save.state || {});
    if (GameState.current) GameState.current.config = App.config;
    return true;
  }
};
