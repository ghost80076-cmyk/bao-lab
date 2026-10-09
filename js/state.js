const GameState = {
  current: null,

  npcIdentityKey(value) {
    return String(value ?? "").trim().toLocaleLowerCase();
  },

  normalizeNPCAliases(value) {
    const list = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
    return [...new Set(list.filter(alias => typeof alias === "string").map(alias => alias.trim()).filter(Boolean))].slice(0, 8);
  },

  validNPCId(value) {
    return /^npc-\d+$/.test(String(value || ""));
  },

  ensureNPCIds() {
    if (!this.current) return [];
    const list = Array.isArray(this.current.npcs) ? this.current.npcs : (this.current.npcs = []);
    const used = new Set();
    let next = Number.isFinite(Number(this.current.nextNPCSeq)) && Number(this.current.nextNPCSeq) > 0
      ? Math.floor(Number(this.current.nextNPCSeq)) : 1;
    list.forEach(npc => {
      const id = String(npc?.npc_id || "");
      if (this.validNPCId(id) && !used.has(id)) {
        used.add(id);
        next = Math.max(next, Number(id.slice(4)) + 1);
      } else if (npc && typeof npc === "object") {
        delete npc.npc_id;
      }
    });
    list.forEach(npc => {
      if (this.validNPCId(npc?.npc_id)) return;
      while (used.has(`npc-${next}`)) next += 1;
      npc.npc_id = `npc-${next++}`;
      used.add(npc.npc_id);
    });
    this.current.nextNPCSeq = next;
    return list;
  },

  normalizeNPCFirstSeen(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const time = String(value.time || "").trim().slice(0, 120);
    const location = String(value.location || "").trim().slice(0, 160);
    const turn = Number(value.turn);
    const result = {};
    if (time) result.time = time;
    if (location) result.location = location;
    if (Number.isFinite(turn) && turn >= 0) result.turn = Math.floor(turn);
    return Object.keys(result).length ? result : null;
  },

  establishNPCFirstSeen(npc) {
    if (!npc || npc.presence !== "present" || this.normalizeNPCFirstSeen(npc.first_seen)) return;
    const time = String(this.current?.time || "").trim();
    const location = String(npc.location || this.current?.location || "").trim();
    let turn = null;
    try {
      const value = typeof Chat !== "undefined" && typeof Chat.turnCount === "function" ? Number(Chat.turnCount()) : NaN;
      if (Number.isFinite(value) && value >= 0) turn = Math.floor(value);
    } catch {}
    const firstSeen = {};
    if (time && time !== "未設定") firstSeen.time = time.slice(0, 120);
    if (location && location !== "未設定" && location !== "未知") firstSeen.location = location.slice(0, 160);
    if (turn !== null) firstSeen.turn = turn;
    if (Object.keys(firstSeen).length) npc.first_seen = firstSeen;
  },

  create(character, config) {
    const base = structuredClone(character.initial_state || {});
    this.current = {
      time: base.time || "未設定",
      location: base.location || "未設定",
      events: Array.isArray(base.events) && base.events.length ? base.events : ["故事剛剛開始。"],
      npcs: Array.isArray(base.npcs) ? base.npcs : [],
      memory: [],
      ...((base.world_clock || base.worldClock) && typeof (base.world_clock || base.worldClock) === "object" && !Array.isArray(base.world_clock || base.worldClock)
        ? { worldClock: structuredClone(base.world_clock || base.worldClock) }
        : {}),
      // Manually entered world and NPC notes belong to this story, not every story in the browser.
      memorySlots: [],
      config
    };
    this.current.nextNPCSeq = 1;
    this.current.npcs.forEach(npc => { if (npc && typeof npc === "object") delete npc.npc_id; });
    this.ensureNPCIds();
    this.current.npcs.forEach(npc => {
      if (!npc || typeof npc !== "object") return;
      npc.aliases = this.normalizeNPCAliases(npc.aliases).filter(alias => this.npcIdentityKey(alias) !== this.npcIdentityKey(npc.name));
      if (!npc.aliases.length) delete npc.aliases;
      // A role card may define who is initially present, but it cannot forge
      // story-owned first-appearance metadata.
      delete npc.first_seen;
      this.establishNPCFirstSeen(npc);
    });
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
    const list = this.ensureNPCIds();
    const incomingAliases = this.normalizeNPCAliases(npc.aliases);
    const identity = this.npcIdentityKey(name);
    const aliasKeys = new Set(incomingAliases.map(alias => this.npcIdentityKey(alias)));
    const requestedId = this.validNPCId(npc.npc_id) ? String(npc.npc_id) : "";
    const found = list.find(item => {
      if (requestedId && item?.npc_id === requestedId) return true;
      const canonical = this.npcIdentityKey(item?.name);
      const knownAliases = this.normalizeNPCAliases(item?.aliases).map(alias => this.npcIdentityKey(alias));
      return canonical === identity || knownAliases.includes(identity) || aliasKeys.has(canonical) || knownAliases.some(alias => aliasKeys.has(alias));
    });
    const clean = {};
    ["name", "role", "mood", "location", "relationship", "personality", "notes", "outfit"].forEach(k => {
      if (npc[k] !== undefined && npc[k] !== null && String(npc[k]).trim() !== "") clean[k] = npc[k];
    });
    if ((!found?.appearance || npc.appearance_change === true) && npc.appearance !== undefined && npc.appearance !== null && String(npc.appearance).trim()) {
      clean.appearance = String(npc.appearance).trim();
    }
    if (["present", "away", "unknown"].includes(npc.presence)) clean.presence = npc.presence;
    let saved;
    if (found) {
      clean.name = found.name;
      const aliases = this.normalizeNPCAliases([
        ...(found.aliases || []),
        ...incomingAliases,
        ...(identity !== this.npcIdentityKey(found.name) ? [name] : [])
      ]).filter(alias => this.npcIdentityKey(alias) !== this.npcIdentityKey(found.name));
      Object.assign(found, clean);
      if (aliases.length) found.aliases = aliases;
      else delete found.aliases;
      saved = found;
    } else {
      const aliases = incomingAliases.filter(alias => this.npcIdentityKey(alias) !== identity);
      saved = { name, role: "NPC", mood: "未知", location: "未知", relationship: "未設定", ...clean };
      if (aliases.length) saved.aliases = aliases;
      while (list.some(item => item.npc_id === `npc-${this.current.nextNPCSeq}`)) this.current.nextNPCSeq += 1;
      saved.npc_id = `npc-${this.current.nextNPCSeq++}`;
      list.push(saved);
    }
    this.establishNPCFirstSeen(saved);
    this.current.npcs = list.slice(0, 50);
  }
};
