(() => {
  'use strict';
  const WORLD_ID = 'autonomous-npc-world';
  const isWorld = () => window.App?.activeCharacter?.id === WORLD_ID;
  const originalStart = App.startStory.bind(App);
  const originalSend = App.sendMessage.bind(App);
  const originalResume = App.resumeSavedStory.bind(App);
  const originalShell = App.renderChatShell.bind(App);
  const hasAPI = cfg => Boolean(cfg?.api?.key && cfg?.api?.model && cfg?.api?.baseUrl);
  const preview = cfg => {
    const s = cfg.worldSetup || {}, confirmed = s.confirmed || {};
    const parts = ['離線世界設定預覽（尚未連接 AI；不會生成劇情）', '玩法：' + (s.mode || '未指定'), '世界類型：' + (s.world || '未指定')];
    if (confirmed.world && s.worldText) parts.push('【世界觀】\n' + s.worldText);
    if (confirmed.npcs && s.npcs) parts.push('【NPC】\n' + s.npcs);
    if (confirmed.persona && s.personaText) parts.push('【玩家資料】\n' + s.personaText);
    if (s.opening) parts.push('【預定開場】\n' + s.opening);
    parts.push('要讓 NPC 自主行動並生成後續劇情，請設定自己的 API Key。');
    return parts.join('\n\n');
  };
  function status(message) {
    const panel = document.querySelector('.builder-step[data-step-panel="5"]');
    if (!panel) return;
    let el = document.getElementById('offline-start-status');
    if (!el) {
      el = document.createElement('p'); el.id = 'offline-start-status';
      el.setAttribute('role', 'alert');
      el.style.cssText = 'padding:12px;border:1px solid #db8d8d;border-radius:8px;white-space:pre-wrap';
      panel.appendChild(el);
    }
    el.textContent = message;
  }
  function startOffline() {
    try {
      status('正在開啟離線世界預覽……');
      const cfg = App.collectConfig();
      if (hasAPI(cfg)) { status('正在開始故事……'); return originalStart(); }
      cfg.demoMode = true;
      cfg.offlineWorldPreview = true;
      cfg.api = { ...cfg.api, key: '' };
      App.config = cfg;
      Chat.reset();
      GameState.create(App.activeCharacter, cfg);
      App.renderChatShell(true);
      App.showView('chat');
      App.saveStory(false);
      status('離線世界預覽已開啟。');
    } catch (error) {
      console.error('BAO/LAB offline world start failed:', error);
      status('無法開始故事：' + (error?.message || String(error)));
      App.setStep(5);
    }
  }
  App.startStory = function () {
    if (!isWorld()) return originalStart();
    return startOffline();
  };
  // Handle the actual button before inline onclick or late-loaded modules can replace App.startStory.
  // This also surfaces an error on step 5 instead of leaving mobile users with a silent tap.
  document.addEventListener('click', event => {
    const button = event.target?.closest?.('#start-story');
    if (!button || !isWorld()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startOffline();
  }, true);
  App.renderChatShell = function (fresh = false) {
    const result = originalShell(fresh);
    if (isWorld() && this.config?.offlineWorldPreview && (fresh || !Chat.messages.length)) {
      const stream = document.getElementById('chat-stream');
      if (stream) {
        stream.textContent = '';
        const message = document.createElement('div'); message.className = 'message assistant';
        const bubble = document.createElement('div'); bubble.className = 'bubble';
        bubble.style.whiteSpace = 'pre-wrap'; bubble.textContent = preview(this.config);
        message.appendChild(bubble); stream.appendChild(message);
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
      this.renderChatShell(false); this.showView('chat');
    } catch (error) {
      console.error('BAO/LAB offline preview resume failed:', error);
      alert('離線預覽讀取失敗：' + (error?.message || String(error)));
    }
  };
})();