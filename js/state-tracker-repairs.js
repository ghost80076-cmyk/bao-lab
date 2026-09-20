/* Keep the modular state tracker, its validation, and one shared GameState. */
(() => {
  'use strict';
  if (window.BAOStateTrackerRepairs || !window.App || !window.GameState ||
      !window.WorldStateEngine || !window.BAOCharacterStatus || !window.BAOHelperData || !window.API) return;

  const DEFAULT_FIELDS = [
    { key: 'current_activity', label: '當前行動', type: 'text', context: 'core', track: true,
      default: '未確認', description: '只根據已發生的行動或明確敘事更新，不能推測離場行為。' },
    { key: 'trust', label: '信任狀態', type: 'text', context: 'relevant', track: true,
      default: '未確認', description: '只有已表現的言行或明確設定才更新；不憑空產生數字或推斷內心。' },
    { key: 'boundaries', label: '已確認界線', type: 'text', context: 'core', track: true,
      default: '未確認', description: '僅記錄人物明示的界線；信任、好感或沉默不能代表同意。' }
  ];
  const installSchema = character => {
    if (character?.id !== 'autonomous-npc-world') return false;
    const configured = character.character_status || character.gameplay?.character_status;
    if (Array.isArray(configured?.fields) && configured.fields.length) return false;
    character.character_status = { enabled: true, allow_player_customize: true,
      fields: DEFAULT_FIELDS.map(field => ({ ...field })) };
    return true;
  };
  const ensureSchema = () => {
    (App.characters || []).forEach(installSchema);
    if (!App.activeCharacter || App.activeCharacter.id !== 'autonomous-npc-world') return;
    installSchema(App.activeCharacter);
    if (GameState.current) BAOCharacterStatus.ensureState(App.activeCharacter);
  };
  ensureSchema();
  const oldOpen = App.openCharacter?.bind(App);
  if (oldOpen) App.openCharacter = function(...args) {
    ensureSchema();
    const result = oldOpen(...args);
    ensureSchema();
    return result;
  };
  const oldShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    ensureSchema();
    return oldShell(...args);
  };

  // A state response is a PATCH, never an entire event history. Support both
  // the legacy `events` and the more explicit `new_events` response format.
  const oldStateUpdate = BAOHelperData.stateUpdate;
  BAOHelperData.stateUpdate = function(data, definitions) {
    if (data && Array.isArray(data.new_events)) {
      const updated = oldStateUpdate({ ...data, events: data.new_events }, definitions);
      if (updated) {
        updated.new_events = updated.events || [];
        delete updated.events;
      }
      return updated;
    }
    return oldStateUpdate(data, definitions);
  };
  // Structured history is for the UI and saves; keep the model's history
  // compact by sending plain texts, not IDs, bookkeeping, or source metadata.
  // The modular tracker omitted NPC presence from its snapshot, so retain the
  // existing confirmed presence without guessing whether anyone is in scene.
  const oldSnapshot = WorldStateEngine.stateSnapshot.bind(WorldStateEngine);
  WorldStateEngine.stateSnapshot = function(...args) {
    const snapshot = oldSnapshot(...args);
    if (Array.isArray(snapshot?.recent_events)) snapshot.recent_events = snapshot.recent_events
      .map(item => typeof item === 'string' ? item : item?.text)
      .filter(Boolean);
    if (Array.isArray(snapshot?.npcs)) {
      const knownPresence = new Map((GameState.current?.npcs || [])
        .filter(npc => npc?.name && ['present', 'away', 'unknown'].includes(npc.presence))
        .map(npc => [npc.name, npc.presence]));
      snapshot.npcs.forEach(npc => {
        if (knownPresence.has(npc.name)) npc.presence = knownPresence.get(npc.name);
      });
    }
    return snapshot;
  };
  let lastError = '';
  const oldSend = API.send.bind(API);
  API.send = async function(config, messages) {
    try {
      if (config?.__stateTask) lastError = '';
      const guarded = config?.__stateTask ? (messages || []).map(message => message?.role === 'system'
        ? { ...message, content: `${message.content}\nNPC 的 presence 可為 present、away 或 unknown。npcs 是 PATCH，不是全員名單。僅在本輪敘事明確證實進場、離場或行蹤不明時更新 presence；地點改變不能自動認定原 NPC 仍在場。已有的 presence 應依「目前狀態」延續；只在確有變化時於 npcs 回傳 presence。` }
        : message) : messages;
      return await oldSend(config, guarded);
    } catch (error) {
      if (config?.__stateTask) lastError = String(error?.message || error).slice(0, 240);
      throw error;
    }
  };
  const oldUpdate = WorldStateEngine.update.bind(WorldStateEngine);
  WorldStateEngine.update = async function(...args) {
    lastError = '';
    const owner = GameState.current;
    const result = await oldUpdate(...args);
    if (owner && owner === GameState.current && owner.stateTracker?.phase === 'failed' && lastError) {
      owner.stateTracker.message = `狀態 API 呼叫失敗：${lastError}。請檢查狀態模型的連線、Key 與額度；待下輪重試。`;
    }
    lastError = '';
    return result;
  };

  const oldPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    const result = oldPanel(panel);
    if (panel !== 'status') return result;
    const ui = document.getElementById('ui-panel');
    if (!ui || ui.querySelector('[data-world-state-tracker]')) return result;
    const tracker = GameState.current?.stateTracker;
    const note = document.createElement('p');
    note.dataset.worldStateTracker = 'true';
    note.className = 'note';
    note.setAttribute('role', 'status');
    const labels = { waiting: '待整理', updating: '整理中', updated: '已更新',
      unchanged: '已檢查、無變化', failed: '更新失敗' };
    note.textContent = tracker
      ? `狀態模型：${labels[tracker.phase] || '待確認'}。${tracker.message || ''}`
      : '狀態模型：尚未完成第一次整理；初始數值不是 AI 已確認的劇情。';
    ui.appendChild(note);
    return result;
  };
  window.BAOStateTrackerRepairs = { installSchema, ensureSchema };
})();