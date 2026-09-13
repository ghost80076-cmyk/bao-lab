(() => {
  if (typeof GameState === "undefined" || typeof WorldStateEngine === "undefined") return;

  const BUILT_INS = {
    status: { label: "狀態", icon: "◈", tracking: "high", context: "core", kind: "object" },
    inventory: { label: "背包", icon: "▣", tracking: "medium", context: "relevant", kind: "collection" },
    skills: { label: "技能", icon: "✦", tracking: "medium", context: "relevant", kind: "collection" },
    quests: { label: "任務", icon: "◇", tracking: "medium", context: "relevant", kind: "collection" },
    factions: { label: "勢力", icon: "⌘", tracking: "low", context: "relevant", kind: "collection" },
    economy: { label: "資產", icon: "¤", tracking: "medium", context: "core", kind: "object" },
    cultivation: { label: "境界", icon: "△", tracking: "medium", context: "core", kind: "object" },
    magic: { label: "魔法", icon: "✧", tracking: "medium", context: "relevant", kind: "object" },
    equipment: { label: "裝備", icon: "◆", tracking: "medium", context: "relevant", kind: "collection" },
    reputation: { label: "聲望", icon: "◎", tracking: "low", context: "relevant", kind: "object" }
  };

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  const normalizeModule = raw => {
    const source = typeof raw === "string" ? { id: raw } : (raw || {});
    const id = String(source.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!id) return null;
    const preset = BUILT_INS[id] || {};
    const tracking = ["high", "medium", "low", "manual"].includes(source.tracking) ? source.tracking : (preset.tracking || "medium");
    const context = ["core", "relevant", "ui_only"].includes(source.context) ? source.context : (preset.context || "relevant");
    const kind = ["object", "collection"].includes(source.kind) ? source.kind : (preset.kind || "object");
    return {
      id,
      label: String(source.label || preset.label || id).slice(0, 40),
      icon: String(source.icon || preset.icon || "•").slice(0, 4),
      description: String(source.description || "").slice(0, 500),
      tracking,
      context,
      kind,
      enabled: source.enabled !== false,
      fields: Array.isArray(source.fields) ? source.fields.slice(0, 24).map(f => ({
        key: String(f?.key || "").trim().slice(0, 40),
        label: String(f?.label || f?.key || "").trim().slice(0, 40),
        type: ["text", "number", "meter", "boolean"].includes(f?.type) ? f.type : "text",
        min: Number.isFinite(Number(f?.min)) ? Number(f.min) : undefined,
        max: Number.isFinite(Number(f?.max)) ? Number(f.max) : undefined
      })).filter(f => f.key) : []
    };
  };

  const definitions = character => {
    const raw = character?.world_modules || character?.gameplay?.world_modules || [];
    return (Array.isArray(raw) ? raw : []).map(normalizeModule).filter(Boolean).filter(x => x.enabled).slice(0, 12);
  };

  const initialValues = character => clone(character?.initial_state?.modules || character?.gameplay?.initial_state?.modules || {});

  const ensureState = character => {
    if (!GameState.current) return;
    const defs = definitions(character || window.App?.activeCharacter);
    GameState.current.moduleDefinitions = defs;
    if (!GameState.current.modules || typeof GameState.current.modules !== "object") GameState.current.modules = {};
    const initial = initialValues(character || window.App?.activeCharacter);
    defs.forEach(def => {
      if (GameState.current.modules[def.id] !== undefined) return;
      if (initial?.[def.id] !== undefined) GameState.current.modules[def.id] = clone(initial[def.id]);
      else GameState.current.modules[def.id] = def.kind === "collection" ? [] : {};
    });
    if (!Number.isFinite(GameState.current.moduleTrackerTick)) GameState.current.moduleTrackerTick = 0;
  };

  const originalCreate = GameState.create.bind(GameState);
  GameState.create = function(character, config) {
    const state = originalCreate(character, config);
    ensureState(character);
    return state;
  };

  const originalApply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(update = {}) {
    originalApply(update);
    if (!this.current || !update?.modules || typeof update.modules !== "object" || Array.isArray(update.modules)) return;
    ensureState(window.App?.activeCharacter);
    const allowed = new Map((this.current.moduleDefinitions || []).map(d => [d.id, d]));
    Object.entries(update.modules).forEach(([id, value]) => {
      if (!allowed.has(id) || value === undefined) return;
      const def = allowed.get(id);
      if (def.kind === "collection" && !Array.isArray(value)) return;
      if (def.kind === "object" && (!value || typeof value !== "object" || Array.isArray(value))) return;
      this.current.modules[id] = clone(value);
    });
  };

  const dueModules = () => {
    ensureState(window.App?.activeCharacter);
    const state = GameState.current;
    if (!state) return [];
    state.moduleTrackerTick = Number(state.moduleTrackerTick || 0) + 1;
    return (state.moduleDefinitions || []).filter(def => {
      if (def.tracking === "manual") return false;
      if (def.tracking === "high") return true;
      if (def.tracking === "medium") return state.moduleTrackerTick % 2 === 0;
      return state.moduleTrackerTick % 4 === 0;
    });
  };

  const moduleRules = defs => defs.map(def => {
    const fields = def.fields.length ? `；欄位：${def.fields.map(f => `${f.label}(${f.key})`).join("、")}` : "";
    return `- ${def.label} [${def.id}]：${def.description || "依目前資料追蹤變化"}${fields}`;
  }).join("\n");

  const moduleSnapshot = defs => {
    const modules = GameState.current?.modules || {};
    const out = {};
    defs.forEach(def => { out[def.id] = clone(modules[def.id]); });
    return out;
  };

  WorldStateEngine.stateSnapshot = function(defs = []) {
    const s = GameState.current || {};
    const snapshot = {
      time: s.time || "未設定",
      location: s.location || "未設定",
      npcs: (s.npcs || []).slice(0, 30).map(n => ({
        name: n.name || "NPC",
        role: n.role || "NPC",
        mood: n.mood || "未知",
        location: n.location || "未知",
        relationship: n.relationship ?? "未設定"
      })),
      recent_events: (s.events || []).slice(0, 8)
    };
    if (defs.length) snapshot.modules = moduleSnapshot(defs);
    return snapshot;
  };

  WorldStateEngine.update = async function(config, playerText, assistantText) {
    if (!this.enabled(config) || !config?.api?.key || !GameState.current) return null;
    const defs = dueModules();
    const rules = defs.length ? `\n【本次需要檢查的世界模組】\n${moduleRules(defs)}` : "";
    const prompt = [
      "你是角色扮演遊戲的狀態追蹤器，不是故事作者。",
      "只根據本輪玩家輸入與故事回覆更新有明確依據的狀態，不得自行補劇情。",
      "time、location、events、npcs 只在確實變動時更新。",
      "modules 只輸出本次確實有改變的模組；若某模組改變，請回傳該模組更新後的完整資料，不要只回傳差異。",
      "未發生變化時可以輸出空物件 {}。",
      "只輸出合法 JSON，不要 Markdown、註解或解釋。",
      `格式：{\"time\":\"\",\"location\":\"\",\"events\":[\"\"],\"npcs\":[{\"name\":\"\",\"role\":\"\",\"mood\":\"\",\"location\":\"\",\"relationship\":\"\"}],\"modules\":{\"module_id\":{}}}`,
      rules,
      `【目前狀態】\n${JSON.stringify(this.stateSnapshot(defs))}`,
      `【玩家】\n${playerText}`,
      `【故事回覆】\n${assistantText}`
    ].filter(Boolean).join("\n\n");

    try {
      const result = await API.send({ ...config.api, maxOutputTokens: Math.min(Number(config.api.maxOutputTokens || 1200), 1200) }, [
        { role: "system", content: "只進行狀態追蹤，只輸出合法 JSON。" },
        { role: "user", content: prompt }
      ]);
      const data = this.parse(result?.text || "");
      if (!data) return null;
      GameState.applyUpdate(data);
      return data;
    } catch (err) {
      console.warn("BAO/LAB modular world state update failed:", err);
      return null;
    }
  };

  const compactForPrompt = () => {
    ensureState(window.App?.activeCharacter);
    const defs = (GameState.current?.moduleDefinitions || []).filter(d => d.context === "core");
    if (!defs.length) return "";
    const payload = {};
    defs.forEach(d => { payload[d.label] = GameState.current.modules?.[d.id]; });
    const text = JSON.stringify(payload);
    return text.length > 2400 ? text.slice(0, 2400) + "…" : text;
  };

  window.BAOWorldModules = { BUILT_INS, normalizeModule, definitions, ensureState, compactForPrompt };
  window.WorldStateEngine = WorldStateEngine;
})();