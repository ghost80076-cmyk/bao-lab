(() => {
  'use strict';
  const WORLD_ID = 'autonomous-npc-world';
  const isWorld = () => App.activeCharacter?.id === WORLD_ID;
  const hasAPI = cfg => Boolean(cfg?.api?.key && cfg?.api?.model && cfg?.api?.baseUrl);
  const originalStart = App.startStory.bind(App);
  const originalSend = App.sendMessage.bind(App);
  const originalResume = App.resumeSavedStory.bind(App);
  const originalShell = App.renderChatShell.bind(App);
  const preview = cfg => {
    const s = cfg.worldSetup || {};
    const confirmed = s.confirmed || {};
    const parts = ['離線世界設定預覽（尚未連接 AI；不會生成劇情）', '玩法：' + (s.mode || '未指定'), '世界類型：' + (s.world || '未指定')];
    if (confirmed.world && s.worldText) parts.push('【世界觀】\n' + s.worldText);
    if (confirmed.npcs && s.npcs) parts.push('【NPC】\n' + s.npcs);
    if (confirmed.persona && s.personaText) parts.push('【玩家資料】\n' + s.personaText);
    if (s.opening) parts.push('【預定開場】\n' + s.opening);
    parts.push('要讓 NPC 自主行動並生成後續劇情，請設定自己的 API Key。');
    return parts.join('\n\n');
  };
  const showError = error => {
    const panel = document.querySelector('.builder-step[data-step-panel="5"]');
    if (!panel) return;
    let status = document.getElementById('offline-start-status');
    if (!status) {
      status = document.createElement('p');
      status.id = 'offline-start-status';
      status.setAttribute('role', 'alert');
      status.style.cssText = 'padding:12px;border:1px solid #db8d8d;border-radius:8px;white-space:pre-wrap';
      panel.appendChild(status);
    }
    status.textContent = '無法開始故事：' + (error?.message || String(error));
    App.setStep(5);
  };
  App.startStory = function () {
    if (!isWorld()) return originalStart();
    try {
      const cfg = this.collectConfig();
      if (hasAPI(cfg)) return originalStart();
      cfg.demoMode = true;
      cfg.offlineWorldPreview = true;
      cfg.api = { ...cfg.api, key: '' };
      this.config = cfg;
      Chat.reset();
      GameState.create(this.activeCharacter, cfg);
      this.renderChatShell(true);
      this.showView('chat');
      this.saveStory(false);
    } catch (error) {
      console.error('BAO/LAB offline world preview failed:', error);
      showError(error);
    }
  };
  App.renderChatShell = function (fresh = false) {
    const result = originalShell(fresh);
    if (isWorld() && this.config?.offlineWorldPreview && (fresh || !Chat.messages.length)) {
      const stream = document.getElementById('chat-stream');
      if (stream) {
        stream.textContent = '';
        const message = document.createElement('div');
        message.className = 'message assistant';
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        bubble.style.whiteSpace = 'pre-wrap';
        bubble.textContent = preview(this.config);
        message.appendChild(bubble);
        stream.appendChild(message);
      }
      const model = document.getElementById('chat-model');
      if (model) model.textContent = '離線預覽';
      const input = document.getElementById('user-input');
      if (input) input.placeholder = '離線預覽不能生成 AI 回覆；請先設定 API Key';
    }
    return result;
  };
  App.sendMessage = function () {
    if (isWorld() && this.config?.offlineWorldPreview) {
      const input = document.getElementById('user-input');
      if (input) input.placeholder = '離線預覽不能生成 AI 回覆；請先設定 API Key';
      alert('目前是離線世界設定預覽，尚未連接 AI。請返回角色設定並填入自己的 API Key，才能開始生成劇情。');
      return;
    }
    return originalSend();
  };
  App.resumeSavedStory = function () {
    const save = Storage.loadStory();
    if (!save?.config?.offlineWorldPreview || save.characterId !== WORLD_ID) return originalResume();
    try {
      if (!Storage.restoreStory(save)) { alert('無法讀取這份離線預覽存檔。'); return; }
      this.renderChatShell(false);
      this.showView('chat');
    } catch (error) {
      console.error('BAO/LAB offline preview resume failed:', error);
      alert('離線預覽讀取失敗：' + (error?.message || String(error)));
    }
  };
})();
