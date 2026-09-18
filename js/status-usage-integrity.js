/* UI and request diagnostics only. Never persist API keys or invent NPC state. */
(() => {
  'use strict';
  if (!window.App || !window.GameState || !window.BAOCharacterStatus || !window.WorldStateEngine || !window.Chat || !window.API || window.BAOStatusUsageIntegrity) return;
  const worldTemplateName = () => App.activeCharacter?.id === 'autonomous-npc-world' ? String(App.activeCharacter.name || '') : '';

  // The world engine is a template, not a fictional NPC. Do not send its default
  // meters as the status of a person in the tracking request.
  const snapshot = BAOCharacterStatus.snapshotForTracker.bind(BAOCharacterStatus);
  BAOCharacterStatus.snapshotForTracker = (...args) => {
    const result = snapshot(...args);
    const template = worldTemplateName();
    if (template) delete result[template];
    return result;
  };
  const compact = BAOCharacterStatus.compactForPrompt.bind(BAOCharacterStatus);
  BAOCharacterStatus.compactForPrompt = (...args) => {
    const result = compact(...args);
    const template = worldTemplateName();
    if (!template) return result;
    return {
      ...result,
      names: (result.names || []).filter(name => name !== template),
      text: String(result.text || '').split('\n').filter(line => !line.startsWith(`${template}：`)).join('\n')
    };
  };

  // Only a speaker label in an actual saved assistant turn is enough to
  // establish a named NPC. A name alone cannot establish their health/mood.
  const registerNamedNPCs = text => {
    if (!worldTemplateName() || !GameState.current || !GameState.upsertNPC) return 0;
    const excluded = new Set([
      worldTemplateName(), App.config?.persona?.name, '玩家', '旁白', '系統', '狀態', '時間', '地點', '世界', '世界狀態', '主要角色', '當前NPC', 'NPC'
    ].filter(Boolean));
    const pattern = /(?:^|\n)\s*(?:\[(?:\/)?NARRATION\]\s*)?([\p{Script=Han}]{2,6})\s*[：:]\s*[「『]/gu;
    let found = 0;
    for (const match of String(text || '').matchAll(pattern)) {
      const name = match[1];
      if (excluded.has(name) || (GameState.current.npcs || []).some(npc => npc.name === name)) continue;
      GameState.upsertNPC({ name, role: 'NPC' });
      found += 1;
      if (found >= 8) break;
    }
    return found;
  };
  const registerFromHistory = () => {
    if (!worldTemplateName()) return;
    (Chat.messages || []).filter(message => message?.role === 'assistant').slice(-12)
      .forEach(message => registerNamedNPCs(message.content));
  };

  // Identify named NPCs explicitly mentioned in the supplied story. The tracker
  // must not invent names or treat the world template's title as a character.
  const rawSend = API.send.bind(API);
  API.send = function(config, messages) {
    if (!config?.__stateTask) return rawSend(config, messages);
    const extra = '人物建檔：如果故事回覆明確出現具名 NPC（例如「姓名：台詞」），而目前 npcs 清單尚未有此人，請在 npcs 回傳其真實姓名與有據可查的資訊；不要把角色卡／世界模板名稱當成 NPC，也不要杜撰姓名、數值或玩家心理。新 NPC 的 character_statuses 只填本輪能證實有變動的欄位；未知欄位沿用預設。';
    const updated = (messages || []).map((message, index) => index === 0 && message.role === 'system'
      ? { ...message, content: `${message.content}\n${extra}` } : message);
    return rawSend(config, updated);
  };

  const renderStatusNotice = () => {
    const panel = document.getElementById('ui-panel');
    if (!panel || !panel.querySelector('.character-status-grid')) return;
    const template = worldTemplateName();
    if (template) panel.querySelectorAll('.character-status-card').forEach(card => {
      if (card.dataset.characterContext === template) card.remove();
    });
    const grid = panel.querySelector('.character-status-grid');
    if (template && !grid.querySelector('.character-status-card') && !grid.querySelector('[data-status-no-npc]')) {
      const empty = document.createElement('p');
      empty.dataset.statusNoNpc = 'true';
      empty.className = 'note';
      empty.textContent = '尚未追蹤到具名 NPC。世界模板不是 NPC；狀態模型成功辨識人物後，這裡會自動顯示其姓名與數值。';
      grid.appendChild(empty);
    }
    const tracker = GameState.current?.stateTracker;
    const note = document.createElement('p');
    note.dataset.statusTracker = 'true';
    note.className = 'note';
    const phases = { waiting: '待整理', updating: '整理中', updated: '已更新', unchanged: '已檢查／無變化', failed: '更新失敗' };
    const pending = Number(tracker?.pending || 0);
    note.textContent = tracker
      ? `狀態模型：${phases[tracker.phase] || '待確認'} · ${tracker.message || ''}${pending ? `（待處理 ${pending} 輪）` : ''}`
      : '狀態模型：尚未完成第一次整理。狀態欄初始值不代表已由 AI 驗證。';
    const previous = panel.querySelector('[data-status-tracker]');
    if (previous) previous.replaceWith(note);
    else panel.querySelector('.character-status-toolbar')?.append(note);
  };
  const oldPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(...args) {
    const result = oldPanel(...args);
    if (args[0] === 'npc') renderStatusNotice();
    return result;
  };

  // A streaming gateway may omit usage entirely. Never imply unknown = 0.
  let missingReports = 0;
  const oldAddUsage = Chat.addUsage.bind(Chat);
  Chat.addUsage = function(usage = {}) {
    const input = usage.input_tokens ?? usage.prompt_tokens;
    const output = usage.output_tokens ?? usage.completion_tokens;
    if (input == null || output == null) missingReports += 1;
    return oldAddUsage(usage);
  };
  const decorateUsage = () => {
    const bar = document.querySelector('.usage-bar');
    if (!bar) return;
    let note = bar.querySelector('[data-usage-integrity]');
    if (!note) {
      note = document.createElement('span');
      note.dataset.usageIntegrity = 'true';
      note.className = 'note';
      bar.appendChild(note);
    }
    const cost = App.config?.cost || {};
    const hasPrice = Number(cost.inputPerMillion || 0) > 0 && Number(cost.outputPerMillion || 0) > 0;
    const hasMessages = (Chat.messages || []).length > 0;
    const missing = missingReports > 0 || (hasMessages && !Chat.usage?.prompt && !Chat.usage?.completion);
    if (missing) {
      note.textContent = `⚠ 有 ${missingReports || '部分'} 次 API 用量未完整回報；累積 Token 可能低估，無法準確計算總費用。串流中轉站不一定提供 usage。`;
      if (!Chat.usage?.prompt) {
        const input = document.getElementById('usage-input-total');
        if (input) input.textContent = '未回報';
      }
      if (!Chat.usage?.completion) {
        const output = document.getElementById('usage-output-total');
        if (output) output.textContent = '未回報';
      }
      if (!Chat.usage?.prompt && !Chat.usage?.completion) {
        const total = document.getElementById('usage-total');
        if (total) total.textContent = '未回報';
      }
    } else if (!hasPrice) note.textContent = '金額未估：尚未設定主模型輸入與輸出單價；不同輔助模型的價格不可直接套用主模型單價。';
    else note.textContent = '金額為依已回報 Token 與自填單價估算，非服務商帳單；多模型可能各有費率。';
    if (missing && !hasPrice) note.textContent += ' 目前也未設定主模型單價。';
  };
  const oldRenderUsage = Chat.renderUsage.bind(Chat);
  Chat.renderUsage = function(...args) { const result = oldRenderUsage(...args); decorateUsage(); return result; };
  const oldTurnUsage = Chat.renderTurnUsage.bind(Chat);
  Chat.renderTurnUsage = function(...args) { const result = oldTurnUsage(...args); decorateUsage(); return result; };
  const oldReset = Chat.reset.bind(Chat);
  Chat.reset = function(...args) { missingReports = 0; const result = oldReset(...args); decorateUsage(); return result; };
  const oldShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    registerFromHistory();
    const result = oldShell(...args);
    decorateUsage();
    return result;
  };
  window.BAOStatusUsageIntegrity = { registerNamedNPCs, registerFromHistory, renderStatusNotice, decorateUsage };
  decorateUsage();
})();
