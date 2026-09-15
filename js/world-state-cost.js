(() => {
  if (typeof WorldStateEngine === "undefined") return;

  const originalUpdate = WorldStateEngine.update.bind(WorldStateEngine);
  let persistenceHint = false;

  const queue = () => {
    if (!window.GameState?.current) return [];
    if (!Array.isArray(GameState.current.pendingStateTurns)) GameState.current.pendingStateTurns = [];
    return GameState.current.pendingStateTurns;
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
    const pending = queue();
    pending.push({ player: String(playerText || ""), assistant: String(assistantText || "") });
    if (pending.length > 12) pending.splice(0, pending.length - 12);
    persistenceHint = true;
    if (pending.length < this.interval(config)) return null;
    const originalApi = config?.api;
    if (!originalApi) return null;
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
    const result = await originalUpdate(patched, combinedPlayer, combinedAssistant);
    if (result) pending.splice(0, batch.length);
    return result;
  };

  window.WorldStateEngine = WorldStateEngine;
})();
