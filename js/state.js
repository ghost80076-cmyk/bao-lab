const GameState = {
  current: null,

  create(character, config) {
    const base = structuredClone(character.initial_state || {});
    this.current = {
      time: base.time || "未設定",
      location: base.location || "未設定",
      events: Array.isArray(base.events) && base.events.length ? base.events : ["故事剛剛開始。"],
      npcs: Array.isArray(base.npcs) ? base.npcs : [],
      memory: [],
      // Manually entered world and NPC notes belong to this story, not every story in the browser.
      memorySlots: [],
      config
    };
    return this.current;
  },

  addEvent(text) {
    if (!this.current || !text) return;
    this.current.events.unshift(String(text));
    this.current.events = this.current.events.slice(0, 20);
  },

  addMemory(text) {
    if (!this.current || !text) return;
    this.current.memory.unshift(String(text));
    this.current.memory = this.current.memory.slice(0, 50);
  },

  applyUpdate(update = {}) {
    if (!this.current || !update || typeof update !== "object") return;
    if (typeof update.time === "string" && update.time.trim()) this.current.time = update.time.trim();
    if (typeof update.location === "string" && update.location.trim()) this.current.location = update.location.trim();
    if (Array.isArray(update.events)) update.events.filter(Boolean).slice(0, 8).reverse().forEach(x => this.addEvent(x));
    if (Array.isArray(update.npcs)) update.npcs.forEach(n => this.upsertNPC(n));
  },

  upsertNPC(npc = {}) {
    if (!this.current || !npc?.name) return;
    const name = String(npc.name).trim();
    if (!name) return;
    const list = this.current.npcs || (this.current.npcs = []);
    const found = list.find(n => String(n.name).trim() === name);
    const clean = {};
    ["name", "role", "mood", "location", "relationship", "personality", "notes"].forEach(k => {
      if (npc[k] !== undefined && npc[k] !== null && String(npc[k]).trim() !== "") clean[k] = npc[k];
    });
    if (found) Object.assign(found, clean);
    else list.push({ name, role: "NPC", mood: "未知", location: "未知", relationship: "未設定", ...clean });
    this.current.npcs = list.slice(0, 50);
  }
};
