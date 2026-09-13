(() => {
  if (typeof GameState === "undefined" || typeof WorldStateEngine === "undefined") return;

  const BUILT_INS = {
    status: { label: "狀態", icon: "◈", tracking: "high", context: "core", kind: "object", triggers: ["狀態","血量","hp","生命","體力","魔力","mp","受傷","傷勢","中毒","疲勞"] },
    inventory: { label: "背包", icon: "▣", tracking: "medium", context: "relevant", kind: "collection", triggers: ["背包","物品","道具","行囊","儲物","口袋","撿起","拿出","放入","丟掉","使用道具","消耗品"] },
    skills: { label: "技能", icon: "✦", tracking: "medium", context: "relevant", kind: "collection", triggers: ["技能","能力","天賦","招式","武學","功法","法術","施法","咒語","絕招"] },
    quests: { label: "任務", icon: "◇", tracking: "medium", context: "relevant", kind: "collection", triggers: ["任務","委託","主線","支線","目標","線索","接任務","完成任務","交付"] },
    factions: { label: "勢力", icon: "⌘", tracking: "low", context: "relevant", kind: "collection", triggers: ["勢力","陣營","宗門","門派","公會","家族","國家","王國","帝國","組織"] },
    economy: { label: "資產", icon: "¤", tracking: "medium", context: "core", kind: "object", triggers: ["錢","金幣","銀幣","銅幣","銀兩","靈石","貨幣","價格","購買","買下","賣掉","支付","花費"] },
    cultivation: { label: "境界", icon: "△", tracking: "medium", context: "core", kind: "object", triggers: ["境界","修為","修煉","突破","靈根","靈力","築基","金丹","元嬰","渡劫"] },
    magic: { label: "魔法", icon: "✧", tracking: "medium", context: "relevant", kind: "object", triggers: ["魔法","法術","咒語","魔力","元素","魔法陣","施法","法力"] },
    equipment: { label: "裝備", icon: "◆", tracking: "medium", context: "relevant", kind: "collection", triggers: ["裝備","武器","防具","劍","刀","弓","盾","盔甲","戒指","穿戴","換裝"] },
    reputation: { label: "聲望", icon: "◎", tracking: "low", context: "relevant", kind: "object", triggers: ["聲望","名聲","評價","名望","通緝","知名度","威望"] }
  };

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };

  const normalizeWords = value => (Array.isArray(value) ? value : [value]).filter(Boolean).map(x => String(x).trim().toLowerCase()).filter(Boolean).slice(0, 40);

  const normalizeModule = raw => {
    const source = typeof raw === "string" ? { id: raw } : (raw || {});
    const id = String(source.id || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40);
    if (!id) return null;
    const preset = BUILT_INS[id] || {};
    const tracking = ["high", "medium", "low", "manual"].includes(source.tracking) ? source.tracking : (preset.tracking || "medium");
    const context = ["core", "relevant", "ui_only"].includes(source.context) ? source.context : (preset.context || "relevant");
    const kind = ["object", "collection"].includes(source.kind) ? source.kind : (preset.kind || "object");
    const customTriggers = normalizeWords(source.triggers || []);
    const triggers = [...new Set(customTriggers.length ? customTriggers : normalizeWords(preset.triggers || []))].slice(0, 40);
    return {
      id,
      label: String(source.label || preset.label || id).slice(0, 40),
      icon: String(source.icon || preset.icon || "•").slice(0, 4),
      description: String(source.description || "").slice(0, 500),
      tracking,
      context,
      kind,
      enabled: source.enabled !== false,
      triggers,
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

  const relevanceScore = (def, text = "") => {
    const hay = String(text || "").toLowerCase();
    if (!hay) return 0;
    let score = 0;
    if (hay.includes(String(def.label || "").toLowerCase())) score += 5;
    if (hay.includes(String(def.id || "").toLowerCase())) score += 3;
    (def.triggers || []).forEach(word => { if (word && hay.includes(word)) score += word.length >= 3 ? 3 : 2; });
    (def.fields || []).forEach(field => {
      const label = String(field.label || "").toLowerCase();
      const key = String(field.key || "").toLowerCase();
      if (label && hay.includes(label)) score += 2;
      if (key.length >= 3 && hay.includes(key)) score += 1;
    });
    return score;
  };

  const dueModules = (playerText = "", assistantText = "") => {
    ensureState(window.App?.activeCharacter);
    const state = GameState.current;
    if (!state) return [];
    state.moduleTrackerTick = Number(state.moduleTrackerTick || 0) + 1;
    const turnText = `${playerText}\n${assistantText}`;
    return (state.moduleDefinitions || []).filter(def => {
      if (def.tracking === "manual") return false;
      if (def.tracking === "high") return true;
      const mentioned = relevanceScore(def, turnText) > 0;
      if (def.tracking === "medium") return mentioned || state.moduleTrackerTick % 2 === 0;
      return mentioned || state.moduleTrackerTick % 4 === 0;
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

  WorldStateEngine.stateSnapshot = function(defs = [], turnText = "") {
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
    if (window.BAOCharacterStatus) {
      const characterStatuses = window.BAOCharacterStatus.snapshotForTracker(turnText);
      if (Object.keys(characterStatuses).length) snapshot.character_statuses = characterStatuses;
    }
    return snapshot;
  };

  WorldStateEngine.update = async function(config, playerText, assistantText) {
    if (!this.enabled(config) || !config?.api?.key || !GameState.current) return null;
    const defs = dueModules(playerText, assistantText);
    const rules = defs.length ? `\n【本次需要檢查的世界模組】\n${moduleRules(defs)}` : "";
    const turnText = `${playerText}\n${assistantText}`;
    const characterStatusRules = window.BAOCharacterStatus?.trackerRules?.() || "";
    const statusBlock = characterStatusRules ? `【人物狀態欄位】\n只有角色狀態真的改變時，才在 character_statuses 內回傳該角色更新後的欄位。不得猜測沒有證據的身體、服裝、心理或關係變化。\n${characterStatusRules}` : "";
    const prompt = [
      "你是角色扮演遊戲的狀態追蹤器，不是故事作者。",
      "只根據本輪玩家輸入與故事回覆更新有明確依據的狀態，不得自行補劇情。",
      "time、location、events、npcs 只在確實變動時更新。",
      "modules 只輸出本次確實有改變的模組；若某模組改變，請回傳該模組更新後的完整資料，不要只回傳差異。",
      "character_statuses 只輸出本輪確實改變的人物與欄位。",
      "未發生變化時可以輸出空物件 {}。",
      "只輸出合法 JSON，不要 Markdown、註解或解釋。",
      `格式：{\"time\":\"\",\"location\":\"\",\"events\":[\"\"],\"npcs\":[{\"name\":\"\",\"role\":\"\",\"mood\":\"\",\"location\":\"\",\"relationship\":\"\"}],\"modules\":{\"module_id\":{}},\"character_statuses\":{\"角色名\":{\"field_key\":\"value\"}}}`,
      rules,
      statusBlock,
      `【目前狀態】\n${JSON.stringify(this.stateSnapshot(defs, turnText))}`,
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

  const compactValue = (value, maxChars = 900) => {
    let text = "";
    try { text = JSON.stringify(value); } catch { text = String(value ?? ""); }
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
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

  const relevantDefinitions = (text = "", options = {}) => {
    ensureState(window.App?.activeCharacter);
    const state = GameState.current;
    if (!state) return [];
    const maxModules = Math.max(1, Math.min(5, Number(options.maxModules || 3)));
    const viewed = String(state.uiContextModule || "");
    const scored = (state.moduleDefinitions || [])
      .filter(def => def.context === "relevant")
      .map(def => ({ def, score: relevanceScore(def, text) + (def.id === viewed ? 4 : 0) }))
      .filter(item => item.score > 0)
      .sort((a,b) => b.score - a.score || a.def.label.localeCompare(b.def.label, "zh-Hant"))
      .slice(0, maxModules)
      .map(item => item.def);
    return scored;
  };

  const compactRelevantForPrompt = (text = "", options = {}) => {
    const defs = relevantDefinitions(text, options);
    if (!defs.length) {
      if (options.consumeViewed && GameState.current) GameState.current.uiContextModule = "";
      return { text: "", ids: [] };
    }
    const maxChars = Math.max(400, Math.min(4000, Number(options.maxChars || 2200)));
    const perModule = Math.max(300, Math.floor(maxChars / defs.length));
    const lines = defs.map(def => `${def.icon} ${def.label}：${compactValue(GameState.current?.modules?.[def.id], perModule)}`);
    if (options.consumeViewed && GameState.current) GameState.current.uiContextModule = "";
    const joined = lines.join("\n");
    return { text: joined.length > maxChars ? `${joined.slice(0, maxChars)}…` : joined, ids: defs.map(d => d.id) };
  };

  window.BAOWorldModules = { BUILT_INS, normalizeModule, definitions, ensureState, compactForPrompt, relevantDefinitions, compactRelevantForPrompt, relevanceScore };
  window.WorldStateEngine = WorldStateEngine;
})();