const Storage = {
  prefix: "bao-lab:",
  set(key, value) { localStorage.setItem(this.prefix + key, JSON.stringify(value)); },
  get(key, fallback = null) { try { const raw = localStorage.getItem(this.prefix + key); return raw ? JSON.parse(raw) : fallback; } catch { return fallback; } },
  remove(key) { localStorage.removeItem(this.prefix + key); },

  storyKey: "story:autosave",
  slotsKey: "story:slots",

  buildStoryPayload(label = "") {
    if (!window.App?.activeCharacter || !window.GameState?.current) return null;
    const safeConfig = structuredClone(App.config || {});
    if (safeConfig.api) safeConfig.api.key = "";
    const state = structuredClone(GameState.current);
    if (state?.config?.api) state.config.api.key = "";
    return {
      version: 2,
      label,
      savedAt: new Date().toISOString(),
      characterId: App.activeCharacter.id,
      characterName: App.activeCharacter.name,
      config: safeConfig,
      chat: {
        messages: structuredClone(Chat.messages || []),
        summary: Chat.summary || "",
        summarizedUntil: Chat.summarizedUntil || 0,
        usage: structuredClone(Chat.usage || {})
      },
      state
    };
  },

  saveStory() {
    const payload = this.buildStoryPayload("自動存檔");
    if (!payload) return false;
    this.set(this.storyKey, payload);
    return true;
  },

  loadStory() { return this.get(this.storyKey, null); },
  hasStory() { return Boolean(this.loadStory()); },
  clearStory() { this.remove(this.storyKey); },

  listSlots() {
    const slots = this.get(this.slotsKey, []);
    return Array.isArray(slots) ? slots : [];
  },

  saveSlot(label = "") {
    const slots = this.listSlots();
    const payload = this.buildStoryPayload(label || `存檔 ${slots.length + 1}`);
    if (!payload) return null;
    payload.id = `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    slots.unshift(payload);
    this.set(this.slotsKey, slots.slice(0, 20));
    return payload;
  },

  deleteSlot(id) {
    const slots = this.listSlots().filter(x => x.id !== id);
    this.set(this.slotsKey, slots);
  },

  getSlot(id) { return this.listSlots().find(x => x.id === id) || null; },

  exportSave(save) {
    if (!save) return false;
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const name = (save.characterName || "story").replace(/[\\/:*?\"<>|]/g, "-");
    a.href = url;
    a.download = `BAO-LAB-${name}-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  },

  async importFile(file) {
    const text = await file.text();
    const save = JSON.parse(text);
    if (!save || !save.characterId || !save.config || !save.chat) throw new Error("這不是有效的 BAO/LAB 存檔。");
    if (save.config?.api) save.config.api.key = "";
    if (save.state?.config?.api) save.state.config.api.key = "";
    return save;
  },

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