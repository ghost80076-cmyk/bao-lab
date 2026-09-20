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

  // The model's prose is NOT the world-state database. Only a clearly headed
  // scene-information appendix can supply these two explicitly stated fields.
  // Other status fields still go through the separate, validated state tracker.
  const unknown = value => !String(value ?? '').trim() || /^(?:未設定|未知|—|－|-|null)$/i.test(String(value).trim());
  const stripMarkdown = line => String(line || '').replace(/\*\*/g, '').replace(/^\s*#{1,6}\s*/, '').trim();
  const explicitSceneInfo = raw => {
    const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
    let heading = -1;
    for (let index = 0; index < lines.length; index += 1) {
      if (/^當前場景資訊\s*[：:]?$/.test(stripMarkdown(lines[index]))) heading = index;
    }
    if (heading < 0) return null;
    const result = {};
    for (let index = heading + 1; index < Math.min(lines.length, heading + 18); index += 1) {
      const line = stripMarkdown(lines[index]);
      if (/^(?:-{3,}|當前世界狀態\s*[：:]?|\[\/?(?:NARRATION|STATUS)\])$/.test(line)) break;
      const match = line.replace(/^(?:[-*•]|\d+[.)])\s*/, '').match(/^(時間|地點)\s*[：:]\s*(.+)$/);
      if (!match) continue;
      const value = match[2].trim().replace(/\s*\*+$/, '').trim();
      if (unknown(value) || value.length > 120 || /[<>\r\n]/.test(value)) continue;
      result[match[1] === '時間' ? 'time' : 'location'] = value;
    }
    return Object.keys(result).length ? result : null;
  };
  const syncExplicitScene = (raw, onlyUnset = false) => {
    const owner = window.GameState?.current;
    if (!owner || typeof GameState.applyUpdate !== 'function') return null;
    const parsed = explicitSceneInfo(raw);
    if (!parsed) return null;
    const patch = {};
    for (const key of ['time', 'location']) {
      if (parsed[key] && (onlyUnset ? unknown(owner[key]) : parsed[key] !== owner[key])) patch[key] = parsed[key];
    }
    if (!Object.keys(patch).length) return null;
    GameState.applyUpdate(patch);
    if (GameState.current !== owner) return null;
    owner.sceneInfoSource = 'assistant-explicit-scene';
    persistenceHint = true;
    window.BAOSceneHTML?.paintStatus?.();
    return patch;
  };

  // Resume: recover only missing fields from newest saved assistant turns,
  // then the opening greeting. A greeting bubble is not in Chat.messages;
  // never overwrite newer or established state with that older content.
  const recoverExplicitScene = () => {
    const owner = window.GameState?.current;
    if (!owner || (!unknown(owner.time) && !unknown(owner.location))) return false;
    let changed = false;
    for (const message of (window.Chat?.messages || []).slice(-24).reverse()) {
      if (!unknown(owner.time) && !unknown(owner.location)) break;
      if (message?.role !== 'assistant') continue;
      changed = Boolean(syncExplicitScene(message.content, true)) || changed;
    }
    if (unknown(owner.time) || unknown(owner.location)) {
      changed = Boolean(syncExplicitScene(window.App?.activeCharacter?.greeting, true)) || changed;
    }
    return changed;
  };

  WorldStateEngine.explicitSceneInfo = explicitSceneInfo;
  WorldStateEngine.syncExplicitScene = syncExplicitScene;
  WorldStateEngine.recoverExplicitScene = recoverExplicitScene;

  if (window.App && !App.__explicitSceneResumeHooked) {
    const originalShell = App.renderChatShell.bind(App);
    App.renderChatShell = function(...args) {
      const owner = GameState.current;
      const recovered = recoverExplicitScene();
      const result = originalShell(...args);
      if (recovered) queueMicrotask(() => {
        if (GameState.current !== owner) return;
        window.BAOSceneHTML?.paintStatus?.();
        App.saveStory?.(false);
      });
      return result;
    };
    App.__explicitSceneResumeHooked = true;
  }

  WorldStateEngine.interval = config => {
    const n = Number(config?.cost?.stateInterval || 0);
    if (n > 0) return Math.max(1, n);
    return config?.narrativeMode === "world" ? 2 : 3;
  };

  WorldStateEngine.pendingCount = () => queue().length;
  WorldStateEngine.takePersistenceHint = () => { const value = persistenceHint; persistenceHint = false; return value; };

  WorldStateEngine.update = async function(config, playerText, assistantText) {
    if (!window.GameState?.current) return null;
    const owner = GameState.current;
    const scenePatch = syncExplicitScene(assistantText);
    if (!this.enabled(config)) return scenePatch;
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
      report(owner, "waiting", `${scenePatch ? '已同步回覆明示的時間／地點；' : ''}累積 ${pending.length}／${interval} 輪，尚未呼叫狀態模型。`);
      return scenePatch;
    }
    const originalApi = config?.api;
    if (!originalApi?.key) {
      report(owner, "failed", `${scenePatch ? '時間／地點已同步；' : ''}主模型連線金鑰（API Key）未填，其他狀態未更新。`);
      return scenePatch;
    }
    const helper = config?.cost?.stateApi;
    if (helper?.model && helper?.baseUrl && !helper.key) {
      report(owner, "failed", `${scenePatch ? '時間／地點已同步；' : ''}獨立狀態模型的連線金鑰（API Key）尚未重新填入，請到 AI 連線設定補上。`);
      return scenePatch;
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
        report(owner, "failed", `${scenePatch ? '時間／地點已同步；' : ''}狀態模型未產生可套用的 JSON，或呼叫失敗；其餘舊值已保留，待下輪重試。請檢查模型連線與輸出長度。`);
        return scenePatch;
      }
      pending.splice(0, batch.length);
      const changed = Object.keys(result).some(key => key === "character_statuses" ? Object.keys(result[key] || {}).length : key === "npcs" ? (result[key] || []).length : key === "events" ? (result[key] || []).length : true);
      report(owner, changed ? "updated" : "unchanged", changed ? "狀態模型已回傳並套用本輪更新。" : "狀態模型已成功檢查，但沒有可確認的變化。");
      return result;
    } catch (error) {
      if (GameState.current === owner) report(owner, "failed", `狀態整理失敗：${String(error?.message || error).slice(0, 180)}。待下輪重試。`);
      return scenePatch;
    }
  };

  window.WorldStateEngine = WorldStateEngine;
})();
