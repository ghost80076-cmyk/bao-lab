const CharacterEngine = {
  storageKey: "bao-lab:custom-characters",

  normalize(raw = {}) {
    const meta = raw.meta || {};
    const content = raw.content || {};
    const gameplay = raw.gameplay || {};
    const presentation = raw.presentation || {};
    const initial = gameplay.initial_state || raw.initial_state || {};

    const id = String(raw.id || meta.id || `custom-${Date.now()}`).trim();
    const name = String(raw.name || meta.name || "未命名角色").trim();
    const rating = raw.rating || meta.rating || "general";
    const audience = raw.audience || meta.audience || [];
    const categories = raw.categories || meta.categories || [];
    const tags = raw.tags || meta.tags || [];

    return {
      id,
      name,
      avatar: raw.avatar || meta.avatar || "https://picsum.photos/seed/bao-character/800/1000",
      rating,
      gender: raw.gender || meta.gender || "",
      audience: Array.isArray(audience) ? audience : [audience].filter(Boolean),
      categories: Array.isArray(categories) ? categories : [categories].filter(Boolean),
      tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
      description: raw.description || meta.description || "",
      quote: raw.quote || content.quote || "",
      greeting: raw.greeting || content.greeting || "",
      system_prompt: raw.system_prompt || content.system_prompt || "",
      lore: content.lore || raw.lore || "",
      creator_notes: content.creator_notes || raw.creator_notes || "",
      supported_modes: raw.supported_modes || gameplay.supported_modes || { immersive: true, world: false },
      supported_display: raw.supported_display || presentation.supported_display || { text: true, ui: false },
      ui: raw.ui || presentation.ui || { type: "basic", panels: ["npc", "status", "events", "memory"] },
      initial_state: {
        time: initial.time || "未設定",
        location: initial.location || "未設定",
        events: Array.isArray(initial.events) ? initial.events : [],
        npcs: Array.isArray(initial.npcs) ? initial.npcs : []
      },
      schema_version: raw.schema_version || "1.0",
      source: raw.source || "custom"
    };
  },

  validate(raw = {}) {
    const errors = [];
    const c = this.normalize(raw);
    if (!c.id) errors.push("缺少 id");
    if (!c.name) errors.push("缺少 name");
    if (!c.system_prompt) errors.push("缺少 system_prompt / content.system_prompt");
    if (!c.greeting) errors.push("缺少 greeting / content.greeting");
    if (!["general", "adult"].includes(c.rating)) errors.push("rating 必須是 general 或 adult");
    return { ok: errors.length === 0, errors, character: c };
  },

  loadCustom() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.map(x => this.normalize(x)) : [];
    } catch { return []; }
  },

  saveCustom(character) {
    const list = this.loadCustom().filter(x => x.id !== character.id);
    list.unshift(this.normalize(character));
    localStorage.setItem(this.storageKey, JSON.stringify(list.slice(0, 100)));
    return character;
  },

  removeCustom(id) {
    const list = this.loadCustom().filter(x => x.id !== id);
    localStorage.setItem(this.storageKey, JSON.stringify(list));
  },

  async importFile(file) {
    const text = await file.text();
    const raw = JSON.parse(text);
    const result = this.validate(raw);
    if (!result.ok) throw new Error(result.errors.join("；"));
    result.character.source = "local-import";
    this.saveCustom(result.character);
    return result.character;
  }
};
