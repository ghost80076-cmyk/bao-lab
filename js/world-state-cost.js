(() => {
  if (typeof WorldStateEngine === "undefined") return;

  const originalUpdate = WorldStateEngine.update.bind(WorldStateEngine);
  let persistenceHint = false;

  const queue = () => {
    if (!window.GameState?.current) return [];
    if (!Array.isArray(GameState.current.pendingStateTurns)) GameState.current.pendingStateTurns = [];
    return GameState.current.pendingStateTurns;
  };
  const report = (owner, phase, message) => {
    if (!owner || GameState.current !== owner) return;
    owner.stateTracker = {
      ...(owner.stateTracker || {}),
      phase,
      message,
      pending: queue().length,
      checkedAt: new Date().toISOString(),
      ...(phase === "updated" || phase === "unchanged" ? { successAt: new Date().toISOString() } : {})
    };
    persistenceHint = true;
  };

  WorldStateEngine.interval = config => {
    const n = Number(config?.cost?.stateInterval || 0);
    if (n > 0) return Math.max(1, n);
    return config?.narrativeMode === "world" ? 2 : 3;
  };

  WorldStateEngine.pendingCount = () => queue().length;
  WorldStateEngine.takePersistenceHint = () => { const value = persistenceHint; persistenceHint = false; return value; };

  WorldStateEngine.update = async function(config, playerText, assistantText) {
    if (!this.enabled(config) || !window.GameState?.current) return null;
    const owner = GameState.current;
    // A clearly labeled speaker is an observed NPC name, not an inferred status.
    // Register it before building the tracker snapshot so the state model can
    // update the correct person's fields on this very turn.
    window.BAOStatusUsageIntegrity?.registerNamedNPCs?.(assistantText);
    const pending = queue();
    pending.push({ player: String(playerText || ""), assistant: String(assistantText || "") });
    if (pending.length > 12) pending.splice(0, pending.length - 12);
    persistenceHint = true;
    const interval = this.interval(config);
    if (pending.length < interval) {
      report(owner, "waiting", `累積 ${pending.length}／${interval} 輪，尚未呼叫狀態模型。`);
      return null;
    }
    const originalApi = config?.api;
    if (!originalApi?.key) {
      report(owner, "failed", "主模型 API Key 未填，狀態未更新。");
      return null;
    }
    const helper = config?.cost?.stateApi;
    if (helper?.model && helper?.baseUrl && !helper.key) {
      report(owner, "failed", "獨立狀態模型的 API Key 尚未重新填入，請到 API 設定補上。");
      return null;
    }
    const batch = pending.slice();
    const helperModel = config?.cost?.stateModel || "";
    const patched = {
      ...config,
      api: {
        ...originalApi,
        ...(helperModel ? { model: helperModel } : {}),
        __auxiliaryTask: true,
        __stateTask: true
      }
    };
    const combinedPlayer = batch.map((turn, index) => `第 ${index + 1} 輪：${turn.player}`).join("\n\n");
    const combinedAssistant = batch.map((turn, index) => `第 ${index + 1} 輪：${turn.assistant}`).join("\n\n");
    report(owner, "updating", `正在整理 ${batch.length} 輪；此操作會呼叫狀態 API。`);
    try {
      const result = await originalUpdate(patched, combinedPlayer, combinedAssistant);
      if (GameState.current !== owner) return null;
      if (result === null || result === undefined) {
        report(owner, "failed", "狀態模型未產生可套用的 JSON，或呼叫失敗；舊值已保留，待下輪重試。請檢查模型連線與輸出長度。");
        return null;
      }
      pending.splice(0, batch.length);
      const changed = Object.keys(result).some(key => key === "character_statuses" ? Object.keys(result[key] || {}).length : key === "npcs" ? (result[key] || []).length : key === "events" ? (result[key] || []).length : true);
      report(owner, changed ? "updated" : "unchanged", changed ? "狀態模型已回傳並套用本輪更新。" : "狀態模型已成功檢查，但沒有可確認的變化。");
      return result;
    } catch (error) {
      if (GameState.current === owner) report(owner, "failed", `狀態整理失敗：${String(error?.message || error).slice(0, 180)}。待下輪重試。`);
      return null;
    }
  };

  window.WorldStateEngine = WorldStateEngine;
})();
