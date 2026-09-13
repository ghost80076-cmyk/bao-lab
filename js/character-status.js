(() => {
  if (typeof GameState === "undefined" || typeof WorldStateEngine === "undefined") return;

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  const normalizeField = raw => {
    const f = raw || {};
    const key = String(f.key || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!key) return null;
    const type = ["text", "number", "meter", "boolean", "tags"].includes(f.type) ? f.type : "text";
    const context = ["core", "relevant", "ui_only"].includes(f.context) ? f.context : "relevant";
    return {
      key,
      label: String(f.label || key).trim().slice(0, 40),
      type,
      context,
      track: f.track !== false,
      player_toggle: f.player_toggle !== false,
      player_rename: f.player_rename !== false,
      default: f.default ?? (type === "boolean" ? false : type === "tags" ? [] : ""),
      min: Number.isFinite(Number(f.min)) ? Number(f.min) : undefined,
      max: Number.isFinite(Number(f.max)) ? Number(f.max) : undefined,
      description: String(f.description || "").trim().slice(0, 240)
    };
  };

  const configFor = character => {
    const raw = character?.character_status || character?.gameplay?.character_status || {};
    const fields = (Array.isArray(raw.fields) ? raw.fields : []).map(normalizeField).filter(Boolean).slice(0, 20);
    return {
      enabled: raw.enabled !== false && fields.length > 0,
      allow_player_customize: raw.allow_player_customize !== false,
      fields
    };
  };

  const cleanValue = (field, value) => {
    if (value === undefined || value === null) return clone(field.default);
    if (field.type === "number" || field.type === "meter") {
      let n = Number(value);
      if (!Number.isFinite(n)) return clone(field.default);
      if (Number.isFinite(field.min)) n = Math.max(field.min, n);
      if (Number.isFinite(field.max)) n = Math.min(field.max, n);
      return n;
    }
    if (field.type === "boolean") return Boolean(value);
    if (field.type === "tags") return (Array.isArray(value) ? value : [value]).filter(Boolean).map(x => String(x).slice(0, 80)).slice(0, 12);
    return String(value).slice(0, 800);
  };

  const defaultStatus = cfg => Object.fromEntries(cfg.fields.map(f => [f.key, cleanValue(f, f.default)]));

  const ensureState = character => {
    if (!GameState.current) return;
    const c = character || window.App?.activeCharacter;
    const cfg = configFor(c);
    GameState.current.characterStatusDefinition = cfg;
    if (!GameState.current.characterStatuses || typeof GameState.current.characterStatuses !== "object" || Array.isArray(GameState.current.characterStatuses)) {
      GameState.current.characterStatuses = {};
    }
    if (!cfg.enabled) return;

    const initial = c?.initial_state?.character_statuses || c?.gameplay?.initial_state?.character_statuses || {};
    const names = [c?.name, ...(GameState.current.npcs || []).map(n => n?.name)].filter(Boolean);
    names.forEach(name => {
      const existing = GameState.current.characterStatuses[name] || initial?.[name] || {};
      const next = defaultStatus(cfg);
      cfg.fields.forEach(f => {
        if (existing?.[f.key] !== undefined) next[f.key] = cleanValue(f, existing[f.key]);
      });
      GameState.current.characterStatuses[name] = next;
    });
  };

  const originalCreate = GameState.create.bind(GameState);
  GameState.create = function(character, config) {
    const state = originalCreate(character, config);
    ensureState(character);
    return state;
  };

  const originalUpsert = GameState.upsertNPC.bind(GameState);
  GameState.upsertNPC = function(npc = {}) {
    originalUpsert(npc);
    ensureState(window.App?.activeCharacter);
    const cfg = configFor(window.App?.activeCharacter);
    if (!cfg.enabled || !npc?.name || !npc?.status || typeof npc.status !== "object") return;
    const current = this.current?.characterStatuses?.[npc.name] || defaultStatus(cfg);
    cfg.fields.forEach(f => {
      if (npc.status[f.key] !== undefined) current[f.key] = cleanValue(f, npc.status[f.key]);
    });
    if (this.current?.characterStatuses) this.current.characterStatuses[npc.name] = current;
  };

  const originalApply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(update = {}) {
    originalApply(update);
    ensureState(window.App?.activeCharacter);
    const cfg = configFor(window.App?.activeCharacter);
    if (!cfg.enabled || !update?.character_statuses || typeof update.character_statuses !== "object" || Array.isArray(update.character_statuses)) return;
    Object.entries(update.character_statuses).slice(0, 20).forEach(([name, patch]) => {
      if (!name || !patch || typeof patch !== "object" || Array.isArray(patch)) return;
      const current = this.current.characterStatuses[name] || defaultStatus(cfg);
      cfg.fields.forEach(f => {
        if (patch[f.key] !== undefined) current[f.key] = cleanValue(f, patch[f.key]);
      });
      this.current.characterStatuses[name] = current;
    });
  };

  const namesForTurn = (text = "", options = {}) => {
    ensureState(window.App?.activeCharacter);
    const state = GameState.current;
    if (!state) return [];
    const hay = String(text || "").toLowerCase();
    const all = Object.keys(state.characterStatuses || {});
    const viewed = String(state.uiContextCharacter || "");
    const scored = all.map(name => {
      let score = hay.includes(name.toLowerCase()) ? 6 : 0;
      if (name === viewed) score += 4;
      if (name === window.App?.activeCharacter?.name) score += 1;
      return { name, score };
    }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, Math.max(1, Math.min(4, Number(options.maxCharacters || 3)))).map(x => x.name);
    if (!scored.length && all.length === 1) return all;
    return scored;
  };

  const trackerRules = () => {
    const cfg = configFor(window.App?.activeCharacter);
    if (!cfg.enabled) return "";
    const fields = cfg.fields.filter(f => f.track);
    if (!fields.length) return "";
    return fields.map(f => `- ${f.label} (${f.key})${f.description ? `：${f.description}` : ""}`).join("\n");
  };

  const snapshotForTracker = (text = "") => {
    ensureState(window.App?.activeCharacter);
    const cfg = configFor(window.App?.activeCharacter);
    if (!cfg.enabled) return {};
    const names = namesForTurn(text, { maxCharacters: 4 });
    const out = {};
    names.forEach(name => {
      const source = GameState.current?.characterStatuses?.[name] || {};
      const status = {};
      cfg.fields.filter(f => f.track).forEach(f => { if (source[f.key] !== undefined) status[f.key] = clone(source[f.key]); });
      out[name] = status;
    });
    return out;
  };

  const compactForPrompt = (text = "", options = {}) => {
    ensureState(window.App?.activeCharacter);
    const cfg = configFor(window.App?.activeCharacter);
    if (!cfg.enabled) return { text: "", names: [] };
    const names = namesForTurn(text, { maxCharacters: options.maxCharacters || 2 });
    if (!names.length) {
      if (options.consumeViewed && GameState.current) GameState.current.uiContextCharacter = "";
      return { text: "", names: [] };
    }
    const prefs = window.App?.config?.characterStatus || {};
    const labels = prefs.labels || {};
    const maxChars = Math.max(300, Math.min(2200, Number(options.maxChars || 1400)));
    const lines = [];
    names.forEach(name => {
      const source = GameState.current?.characterStatuses?.[name] || {};
      const parts = cfg.fields.filter(f => f.context !== "ui_only").map(f => {
        const value = source[f.key];
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
        const label = labels[f.key] || f.label;
        return `${label}=${Array.isArray(value) ? value.join("、") : String(value)}`;
      }).filter(Boolean);
      if (parts.length) lines.push(`${name}：${parts.join("；")}`);
    });
    if (options.consumeViewed && GameState.current) GameState.current.uiContextCharacter = "";
    const joined = lines.join("\n");
    return { text: joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined, names };
  };

  window.BAOCharacterStatus = { configFor, ensureState, trackerRules, snapshotForTracker, compactForPrompt, namesForTurn };
})();