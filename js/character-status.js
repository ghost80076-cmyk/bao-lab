(() => {
  if (typeof GameState === "undefined" || typeof WorldStateEngine === "undefined") return;

  const FIELD_TYPES = ["text", "number", "meter", "boolean", "tags"];
  const CONTEXT_TYPES = ["core", "relevant", "ui_only"];
  const MAX_BASE_FIELDS = 24;
  const MAX_CUSTOM_FIELDS = 24;

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  const cleanKey = value => String(value || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);

  const normalizeField = (raw, options = {}) => {
    const f = raw || {};
    const key = cleanKey(f.key);
    if (!key) return null;
    const type = FIELD_TYPES.includes(f.type) ? f.type : "text";
    const context = CONTEXT_TYPES.includes(f.context) ? f.context : "relevant";
    let min = Number.isFinite(Number(f.min)) ? Number(f.min) : undefined;
    let max = Number.isFinite(Number(f.max)) ? Number(f.max) : undefined;
    if (Number.isFinite(min) && Number.isFinite(max) && min > max) [min, max] = [max, min];
    const playerOwned = options.origin === "player";
    return {
      key,
      label: String(f.label || key).trim().slice(0, 40) || key,
      type,
      context,
      track: f.track !== false,
      player_toggle: playerOwned ? true : f.player_toggle !== false,
      player_rename: playerOwned ? true : f.player_rename !== false,
      default: f.default ?? (type === "boolean" ? false : type === "tags" ? [] : (type === "number" || type === "meter" ? 0 : "")),
      min,
      max,
      description: String(f.description || "").trim().slice(0, 240),
      origin: playerOwned ? "player" : "character",
      template_id: playerOwned ? String(f.template_id || "").slice(0, 40) : ""
    };
  };

  const baseConfigFor = character => {
    const raw = character?.character_status || character?.gameplay?.character_status || {};
    const fields = (Array.isArray(raw.fields) ? raw.fields : [])
      .map(f => normalizeField(f, { origin: "character" }))
      .filter(Boolean)
      .slice(0, MAX_BASE_FIELDS);
    return {
      enabled: raw.enabled !== false && fields.length > 0,
      allow_player_customize: raw.allow_player_customize !== false,
      fields
    };
  };

  const emptyCustomization = () => ({ version: 1, customFields: [], hidden: [], labels: {}, order: [] });

  const normalizeCustomization = (raw, character) => {
    const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    const base = baseConfigFor(character);
    const baseKeys = new Set(base.fields.map(f => f.key));
    const customKeys = new Set();
    const customFields = [];
    (Array.isArray(source.customFields) ? source.customFields : []).slice(0, MAX_CUSTOM_FIELDS).forEach(item => {
      const field = normalizeField(item, { origin: "player" });
      if (!field || baseKeys.has(field.key) || customKeys.has(field.key)) return;
      customKeys.add(field.key);
      customFields.push(field);
    });
    const allKeys = new Set([...baseKeys, ...customKeys]);
    const hidden = [...new Set(Array.isArray(source.hidden) ? source.hidden.map(cleanKey) : [])]
      .filter(key => customKeys.has(key) || base.fields.some(f => f.key === key && f.player_toggle));
    const labels = {};
    if (source.labels && typeof source.labels === "object" && !Array.isArray(source.labels)) {
      Object.entries(source.labels).forEach(([rawKey, value]) => {
        const key = cleanKey(rawKey);
        const baseField = base.fields.find(f => f.key === key);
        if (!allKeys.has(key) || (baseField && !baseField.player_rename)) return;
        const label = String(value || "").trim().slice(0, 40);
        if (label) labels[key] = label;
      });
    }
    const requestedOrder = [...new Set(Array.isArray(source.order) ? source.order.map(cleanKey) : [])].filter(key => allKeys.has(key));
    const order = [...requestedOrder, ...[...allKeys].filter(key => !requestedOrder.includes(key))];
    return { version: 1, customFields, hidden, labels, order };
  };

  const getCustomization = character => {
    const c = character || window.App?.activeCharacter;
    const stateValue = GameState.current?.characterStatusCustomization;
    if (stateValue) return normalizeCustomization(stateValue, c);
    const legacy = window.App?.config?.characterStatus;
    return normalizeCustomization(legacy ? { ...legacy, customFields: legacy.customFields || [] } : emptyCustomization(), c);
  };

  const configFor = character => {
    const c = character || window.App?.activeCharacter;
    const base = baseConfigFor(c);
    const customization = getCustomization(c);
    const fields = [...base.fields, ...customization.customFields];
    const rank = new Map(customization.order.map((key, index) => [key, index]));
    fields.sort((a, b) => (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999));
    return {
      enabled: fields.length > 0 && (base.enabled || customization.customFields.length > 0),
      allow_player_customize: base.allow_player_customize,
      fields,
      baseFields: base.fields,
      customization
    };
  };

  const cleanValue = (field, value) => {
    if (value === undefined || value === null) value = clone(field.default);
    if (field.type === "number" || field.type === "meter") {
      let n = Number(value);
      if (!Number.isFinite(n)) n = Number(field.default);
      if (!Number.isFinite(n)) n = 0;
      if (Number.isFinite(field.min)) n = Math.max(field.min, n);
      if (Number.isFinite(field.max)) n = Math.min(field.max, n);
      return n;
    }
    if (field.type === "boolean") {
      if (typeof value === "string") return ["true", "1", "yes", "是", "開啟"].includes(value.trim().toLowerCase());
      return Boolean(value);
    }
    if (field.type === "tags") {
      const list = Array.isArray(value) ? value : String(value || "").split(/[、,，]/);
      return list.map(x => String(x).trim()).filter(Boolean).map(x => x.slice(0, 80)).slice(0, 12);
    }
    return String(value ?? "").slice(0, 800);
  };

  const defaultStatus = cfg => Object.fromEntries(cfg.fields.map(f => [f.key, cleanValue(f, f.default)]));

  const trackedNames = character => [
    ...(character?.id === "desire-district" ? [] : [character?.name || window.App?.activeCharacter?.name]),
    ...(GameState.current?.npcs || []).map(n => n?.name)
  ].filter(Boolean);

  const ensureState = character => {
    if (!GameState.current) return null;
    const c = character || window.App?.activeCharacter;
    if (!GameState.current.characterStatusCustomization) {
      const legacy = window.App?.config?.characterStatus;
      GameState.current.characterStatusCustomization = normalizeCustomization(legacy || emptyCustomization(), c);
    } else {
      GameState.current.characterStatusCustomization = normalizeCustomization(GameState.current.characterStatusCustomization, c);
    }
    const cfg = configFor(c);
    GameState.current.characterStatusDefinition = clone(cfg);
    if (!GameState.current.characterStatuses || typeof GameState.current.characterStatuses !== "object" || Array.isArray(GameState.current.characterStatuses)) {
      GameState.current.characterStatuses = {};
    }
    if (!cfg.enabled) return cfg;

    const initial = c?.initial_state?.character_statuses || c?.gameplay?.initial_state?.character_statuses || {};
    [...new Set(trackedNames(c))].forEach(name => {
      const existing = GameState.current.characterStatuses[name] || initial?.[name] || {};
      const next = defaultStatus(cfg);
      cfg.fields.forEach(field => {
        if (existing?.[field.key] !== undefined) next[field.key] = cleanValue(field, existing[field.key]);
      });
      GameState.current.characterStatuses[name] = next;
    });
    return cfg;
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
    const cfg = ensureState(window.App?.activeCharacter) || configFor(window.App?.activeCharacter);
    if (!cfg.enabled || !npc?.name || !npc?.status || typeof npc.status !== "object") return;
    const current = this.current?.characterStatuses?.[npc.name] || defaultStatus(cfg);
    cfg.fields.forEach(field => {
      if (npc.status[field.key] !== undefined) current[field.key] = cleanValue(field, npc.status[field.key]);
    });
    if (this.current?.characterStatuses) this.current.characterStatuses[npc.name] = current;
  };

  const originalApply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(update = {}) {
    originalApply(update);
    const cfg = ensureState(window.App?.activeCharacter) || configFor(window.App?.activeCharacter);
    if (!cfg.enabled || !update?.character_statuses || typeof update.character_statuses !== "object" || Array.isArray(update.character_statuses)) return;
    Object.entries(update.character_statuses).slice(0, 20).forEach(([name, patch]) => {
      if (!name || !patch || typeof patch !== "object" || Array.isArray(patch)) return;
      const current = this.current.characterStatuses[name] || defaultStatus(cfg);
      cfg.fields.forEach(field => {
        if (patch[field.key] !== undefined) current[field.key] = cleanValue(field, patch[field.key]);
      });
      this.current.characterStatuses[name] = current;
    });
  };

  const applyCustomization = (raw, character) => {
    if (!GameState.current) return null;
    const c = character || window.App?.activeCharacter;
    const base = baseConfigFor(c);
    if (!base.allow_player_customize) return configFor(c);
    GameState.current.characterStatusCustomization = normalizeCustomization(raw, c);
    if (window.App?.config) delete window.App.config.characterStatus;
    return ensureState(c);
  };

  const resetCustomization = character => applyCustomization(emptyCustomization(), character);

  const uniqueCustomKey = (hint = "status", character, extraFields = []) => {
    const cfg = configFor(character || window.App?.activeCharacter);
    const used = new Set([...cfg.fields, ...extraFields].map(f => f.key));
    const stem = cleanKey(`custom_${hint}`) || "custom_status";
    if (!used.has(stem)) return stem;
    let index = 2;
    while (used.has(`${stem}_${index}`)) index += 1;
    return `${stem}_${index}`.slice(0, 40);
  };

  const namesForTurn = (text = "", options = {}) => {
    ensureState(window.App?.activeCharacter);
    const state = GameState.current;
    if (!state) return [];
    const hay = String(text || "").toLowerCase();
    const district = window.App?.activeCharacter?.id === "desire-district";
    const all = Object.keys(state.characterStatuses || {}).filter(name => !district || name !== window.App?.activeCharacter?.name);
    const inScene = new Set((state.npcs || []).filter(npc => npc?.name && npc.presence !== "away" &&
      (npc.location === state.location || (npc.presence === "present" && (!npc.location || npc.location === "未知")))).map(npc => npc.name));
    const viewed = String(state.uiContextCharacter || "");
    const scored = all.map(name => {
      const mentioned = hay.includes(name.toLowerCase());
      if (district && !mentioned && !inScene.has(name)) return { name, score: 0 };
      let score = mentioned ? 6 : 0;
      if (name === viewed) score += 4;
      if (name === window.App?.activeCharacter?.name) score += 1;
      if (district && inScene.has(name)) score += 2;
      return { name, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(4, Number(options.maxCharacters || 3))))
      .map(x => x.name);
    if (!scored.length && !district && all.length === 1) return all;
    return scored;
  };

  const trackerRules = () => {
    const cfg = configFor(window.App?.activeCharacter);
    if (!cfg.enabled) return "";
    const fields = cfg.fields.filter(f => f.track);
    if (!fields.length) return "";
    return fields.map(field => {
      const range = (field.type === "number" || field.type === "meter") && (Number.isFinite(field.min) || Number.isFinite(field.max))
        ? `，範圍 ${Number.isFinite(field.min) ? field.min : "不限"}～${Number.isFinite(field.max) ? field.max : "不限"}` : "";
      return `- ${field.label} (${field.key})，類型 ${field.type}${range}${field.description ? `：${field.description}` : ""}`;
    }).join("\n");
  };

  const hasTrackedFields = () => configFor(window.App?.activeCharacter).fields.some(field => field.track);

  const snapshotForTracker = (text = "") => {
    const cfg = ensureState(window.App?.activeCharacter) || configFor(window.App?.activeCharacter);
    if (!cfg.enabled) return {};
    const names = namesForTurn(text, { maxCharacters: 4 });
    const out = {};
    names.forEach(name => {
      const source = GameState.current?.characterStatuses?.[name] || {};
      const status = {};
      cfg.fields.filter(f => f.track).forEach(f => {
        if (source[f.key] !== undefined) status[f.key] = clone(source[f.key]);
      });
      out[name] = status;
    });
    return out;
  };

  const fieldIsRelevant = (field, source, text, explicitlyViewed) => {
    if (field.context === "core") return true;
    if (field.context !== "relevant") return false;
    if (explicitlyViewed) return true;
    const hay = String(text || "").toLowerCase();
    const needles = [field.key, field.label, field.description, Array.isArray(source[field.key]) ? source[field.key].join(" ") : source[field.key]];
    return needles.some(value => {
      const word = String(value ?? "").trim().toLowerCase();
      return word.length >= 2 && hay.includes(word);
    });
  };

  const compactForPrompt = (text = "", options = {}) => {
    const cfg = ensureState(window.App?.activeCharacter) || configFor(window.App?.activeCharacter);
    if (!cfg.enabled) return { text: "", names: [] };
    const names = namesForTurn(text, { maxCharacters: options.maxCharacters || 2 });
    if (!names.length) {
      if (options.consumeViewed && GameState.current) GameState.current.uiContextCharacter = "";
      return { text: "", names: [] };
    }
    const viewed = String(GameState.current?.uiContextCharacter || "");
    const maxChars = Math.max(300, Math.min(2200, Number(options.maxChars || 1400)));
    const lines = [];
    names.forEach(name => {
      const source = GameState.current?.characterStatuses?.[name] || {};
      const parts = cfg.fields.filter(field => fieldIsRelevant(field, source, text, name === viewed)).map(field => {
        const value = source[field.key];
        if (value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length)) return "";
        return `${field.label}=${Array.isArray(value) ? value.join("、") : String(value)}`;
      }).filter(Boolean);
      if (parts.length) lines.push(`${name}：${parts.join("；")}`);
    });
    if (options.consumeViewed && GameState.current) GameState.current.uiContextCharacter = "";
    const joined = lines.join("\n");
    return { text: joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined, names };
  };

  window.BAOCharacterStatus = {
    FIELD_TYPES,
    CONTEXT_TYPES,
    MAX_CUSTOM_FIELDS,
    baseConfigFor,
    configFor,
    getCustomization,
    normalizeCustomization,
    applyCustomization,
    resetCustomization,
    uniqueCustomKey,
    ensureState,
    cleanValue,
    trackerRules,
    hasTrackedFields,
    snapshotForTracker,
    compactForPrompt,
    namesForTurn
  };
})();
