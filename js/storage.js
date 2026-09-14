const Storage = {
  prefix: "bao-lab:",
  storyKey: "story:autosave",
  slotsKey: "story:slots",
  storyVersion: 4,
  storySchema: "bao-lab-story",

  set(key, value) { localStorage.setItem(this.prefix + key, JSON.stringify(value)); },
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  remove(key) { localStorage.removeItem(this.prefix + key); },

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
      if (blocked.has(normalized) || (normalized === "key" && parent === "api")) return;
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
    clean.version = Math.max(1, Number(clean.version || 1));
    clean.config = clean.config || {};
    clean.config.api = Object.assign({}, clean.config.api || {}, { key: "" });
    clean.state = clean.state && typeof clean.state === "object" ? clean.state : {};
    clean.state.config = clean.config;
    clean.chat.messages = Array.isArray(clean.chat.messages) ? clean.chat.messages : [];
    return clean;
  },

  saveStory() {
    const payload = this.buildStoryPayload("自動存檔");
    if (!payload) return false;
    this.set(this.storyKey, payload);
    return true;
  },

  loadStory() {
    const save = this.get(this.storyKey, null);
    if (!save) return null;
    try { return this.sanitizeImportedStory(save); }
    catch { return null; }
  },
  hasStory() { return Boolean(this.loadStory()); },
  clearStory() { this.remove(this.storyKey); },

  listSlots() {
    const slots = this.get(this.slotsKey, []);
    return Array.isArray(slots) ? slots : [];
  },

  saveSlot(label = "") {
    const slots = this.listSlots();
    const payload = this.buildStoryPayload(label || "存檔 " + (slots.length + 1));
    if (!payload) return null;
    payload.id = "slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    slots.unshift(payload);
    this.set(this.slotsKey, slots.slice(0, 20));
    return payload;
  },

  importSlot(save) {
    const clean = this.sanitizeImportedStory(save);
    clean.id = "slot-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    clean.savedAt = new Date().toISOString();
    clean.label = clean.label || "匯入存檔 · " + (clean.characterName || clean.characterId);
    const slots = this.listSlots();
    slots.unshift(clean);
    this.set(this.slotsKey, slots.slice(0, 20));
    return clean;
  },

  deleteSlot(id) {
    this.set(this.slotsKey, this.listSlots().filter(item => item.id !== id));
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
    Chat.messages = this.clone(save.chat?.messages || []);
    Chat.summary = String(save.chat?.summary || "");
    Chat.summarizedUntil = Number(save.chat?.summarizedUntil || 0);
    Chat.usage = this.clone(save.chat?.usage || { prompt: 0, completion: 0, cached: 0, total: 0 });
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
