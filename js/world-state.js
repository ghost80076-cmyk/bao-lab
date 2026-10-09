const WorldStateEngine = {
  // Record the original UI-based default only once for old stories. After that,
  // rendering preferences cannot silently enable or disable an auxiliary API.
  ensureTrackingPreference(config) {
    if (!config || typeof config !== "object") return false;
    if (typeof config.stateTracking !== "boolean") config.stateTracking = config.displayMode === "ui";
    return config.stateTracking;
  },

  enabled(config) {
    const preferred = this.ensureTrackingPreference(config);
    return config?.narrativeMode === "world"
      || preferred
      || Boolean(window.BAOCharacterStatus?.hasTrackedFields?.());
  },

  stateSnapshot() {
    GameState.ensureNPCIds?.();
    const s = GameState.current || {};
    return {
      time: s.time || "未設定",
      location: s.location || "未設定",
      npcs: (s.npcs || []).map(n => ({
        npc_id: n.npc_id || "",
        name: n.name || "NPC",
        aliases: Array.isArray(n.aliases) ? n.aliases.slice(0, 8) : [],
        role: n.role || "NPC",
        appearance: n.appearance || "",
        outfit: n.outfit || "",
        mood: n.mood || "未知",
        location: n.location || "未知",
        relationship: n.relationship ?? "未設定",
        presence: n.presence || "unknown",
        first_seen: n.first_seen || null
      })),
      recent_events: (s.events || []).slice(0, 8)
    };
  },

  async update(config, playerText, assistantText) {
    if (!this.enabled(config) || !config?.api?.key || !GameState.current) return null;
    const prompt = [
      "你是角色扮演遊戲的狀態整理器，不是故事作者。",
      "根據本輪玩家輸入與故事回覆，只更新有明確依據的世界狀態。",
      "不得自行新增未發生的劇情。沒有變化的欄位請保留原值。",
      "npcs 是人物狀態的 PATCH，不是全島完整名單；只依場景可證實的人物進出更新 presence：present（在場）、away（離場）、unknown（不確定）。轉場後不能把原登記員自動視為在場，既有人物資料仍要保留。",
      "NPC 連續性：更新既有人物時沿用目前狀態的 npc_id；新人物不填 npc_id，由系統建立。新人物可填 aliases、appearance（固定外貌）與 outfit（當前穿著）。既有人物的固定 appearance 必須沿用；只有故事明確造成長期外貌變化時，才同時回傳 appearance 與 appearance_change:true。只有文本明確換裝時才更新 outfit。first_seen 由系統建立，不得輸出或捏造。別名對應到既有人物時沿用其正式姓名，不重複建檔。",
      "world_clock 是可選 PATCH。只有故事明確經過一段時間時才寫 advance_minutes；只有文本明確建立日期、期限、約定、旅程耗時或倒數時才 schedule。不得自行創造伏筆或未發生事件。resolve/cancel 只能引用目前狀態中已存在的 wc-* ID。",
      "只輸出一個 JSON 物件，不要 Markdown，不要解釋。",
      "格式：{\"time\":\"\",\"location\":\"\",\"events\":[\"\"],\"npcs\":[{\"npc_id\":\"npc-1\",\"name\":\"\",\"aliases\":[\"\"],\"role\":\"\",\"appearance\":\"\",\"appearance_change\":false,\"outfit\":\"\",\"mood\":\"\",\"location\":\"\",\"relationship\":\"\",\"presence\":\"present\"}],\"world_clock\":{\"advance_minutes\":0,\"schedule\":[{\"label\":\"\",\"in_minutes\":0}],\"resolve\":[\"wc-1\"],\"cancel\":[\"wc-2\"]}}",
      `【目前狀態】\n${JSON.stringify(this.stateSnapshot())}`,
      `【玩家】\n${playerText}`,
      `【故事回覆】\n${assistantText}`
    ].join("\n\n");

    try {
      const result = await API.send(config.api, [
        { role: "system", content: "只輸出合法 JSON 世界狀態。" },
        { role: "user", content: prompt }
      ]);
      const data = window.BAOHelperData.stateUpdate(this.parse(result?.text || ""), []);
      if (GameState.current) GameState.current.stateRequestDiagnostics = {
        ...(GameState.current.stateRequestDiagnostics || {}), parsed: Boolean(data), applied: false
      };
      if (!data) return null;
      GameState.applyUpdate(data);
      if (GameState.current?.stateRequestDiagnostics) GameState.current.stateRequestDiagnostics.applied = true;
      return data;
    } catch (err) {
      console.warn("BAO/LAB world state update failed:", err);
      return null;
    }
  },

  parse(text) {
    const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      const data = JSON.parse(cleaned);
      return data && typeof data === "object" && !Array.isArray(data) ? data : null;
    } catch {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start < 0 || end <= start) return null;
      try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
    }
  }
};

// New stories persist the original tracking choice in their own config. The
// legacy restore path is normalized lazily by enabled() on its first turn.
if (typeof GameState !== "undefined" && typeof GameState.create === "function") {
  const create = GameState.create;
  GameState.create = function(character, config) {
    WorldStateEngine.ensureTrackingPreference(config);
    return create.call(this, character, config);
  };
}
