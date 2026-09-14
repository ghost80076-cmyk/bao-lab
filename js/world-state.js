const WorldStateEngine = {
  enabled(config) {
    return config?.narrativeMode === "world"
      || config?.displayMode === "ui";
  },

  stateSnapshot() {
    const s = GameState.current || {};
    return {
      time: s.time || "未設定",
      location: s.location || "未設定",
      npcs: (s.npcs || []).map(n => ({
        name: n.name || "NPC",
        role: n.role || "NPC",
        mood: n.mood || "未知",
        location: n.location || "未知",
        relationship: n.relationship ?? "未設定"
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
      "只輸出一個 JSON 物件，不要 Markdown，不要解釋。",
      "格式：{\"time\":\"\",\"location\":\"\",\"events\":[\"\"],\"npcs\":[{\"name\":\"\",\"role\":\"\",\"mood\":\"\",\"location\":\"\",\"relationship\":\"\"}]}",
      `【目前狀態】\n${JSON.stringify(this.stateSnapshot())}`,
      `【玩家】\n${playerText}`,
      `【故事回覆】\n${assistantText}`
    ].join("\n\n");

    try {
      const result = await API.send(config.api, [
        { role: "system", content: "只輸出合法 JSON 世界狀態。" },
        { role: "user", content: prompt }
      ]);
      const data = this.parse(result?.text || "");
      if (!data) return null;
      GameState.applyUpdate(data);
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
