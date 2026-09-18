(() => {
  'use strict';
  const WORLD = 'autonomous-npc-world';
  const isWorld = () => window.App?.activeCharacter?.id === WORLD;
  const defaults = { layout: 'cards', world: true, npcs: true, persona: true, opening: true };
  const key = 'bao-lab:world-display';
  const read = () => { try { return {...defaults, ...JSON.parse(localStorage.getItem(key) || '{}')}; } catch { return {...defaults}; } };
  let preferences = read();
  const save = () => { try { localStorage.setItem(key, JSON.stringify(preferences)); } catch {} };
  const field = (label, value) => { const item = document.createElement('section'); item.className = 'aw-display-item'; const heading = document.createElement('strong'); heading.textContent = label; const body = document.createElement('p'); body.textContent = value; body.style.whiteSpace = 'pre-wrap'; item.append(heading, body); return item; };
  function renderStatus() {
    const host = document.getElementById('aw-display-status');
    if (!host || !isWorld()) return;
    host.replaceChildren();
    const config = App.config?.worldSetup || {};
    const confirmed = config.confirmed || {};
    const title = document.createElement('h3'); title.textContent = '世界設定'; host.append(title);
    if (preferences.layout === 'text') { host.hidden = true; return; }
    host.hidden = false;
    host.dataset.layout = preferences.layout;
    if (preferences.world) host.append(field('世界類型', config.world || '未指定'));
    if (preferences.world && confirmed.world && config.worldText) host.append(field('世界觀', config.worldText));
    if (preferences.npcs && confirmed.npcs && config.npcs) host.append(field('NPC 與人物關係', config.npcs));
    if (preferences.persona && confirmed.persona && config.personaText) host.append(field('玩家背景', config.personaText));
    if (preferences.opening && config.opening) host.append(field('開場情境', config.opening));
  }
  function installControls() {
    if (!isWorld()) return;
    const panel = document.querySelector('.builder-step[data-step-panel="2"]');
    if (!panel || panel.querySelector('#aw-display-options')) return;
    const section = document.createElement('section'); section.id = 'aw-display-options'; section.className = 'aw-display-options';
    const heading = document.createElement('h3'); heading.textContent = '世界狀態顯示'; section.append(heading);
    const description = document.createElement('p'); description.textContent = '只控制本機畫面，不會把 HTML 或顯示偏好送給模型；世界設定仍由原有聊天流程處理。'; section.append(description);
    const selectLabel = document.createElement('label'); selectLabel.textContent = '顯示樣式 ';
    const select = document.createElement('select'); select.id = 'aw-display-layout';
    [['cards','BAO/LAB 狀態卡'],['text','純文字（不顯示額外狀態卡）']].forEach(([value, label]) => { const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option); });
    select.value = preferences.layout; select.addEventListener('change', () => { preferences.layout = select.value; save(); renderStatus(); }); selectLabel.append(select); section.append(selectLabel);
    [['world','世界觀'],['npcs','NPC 與人物關係'],['persona','玩家背景'],['opening','開場情境']].forEach(([name,label]) => {
      const wrapper = document.createElement('label'); wrapper.style.display = 'block';
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = Boolean(preferences[name]); checkbox.addEventListener('change', () => { preferences[name] = checkbox.checked; save(); renderStatus(); });
      wrapper.append(checkbox, document.createTextNode(' ' + label)); section.append(wrapper);
    });
    panel.append(section);
  }
  function installStatus() {
    if (!isWorld() || !App.config?.worldSetup) return;
    const chat = document.getElementById('chat-view');
    const target = chat?.querySelector('.chat-main');
    if (!target) return;
    let status = document.getElementById('aw-display-status');
    if (!status) { status = document.createElement('section'); status.id = 'aw-display-status'; status.className = 'aw-display-status'; target.insertBefore(status, target.firstChild); }
    renderStatus();
  }
  const style = document.createElement('style'); style.textContent = '.aw-display-options{margin:18px 0;padding:16px;border:1px solid #8e7bd5;border-radius:12px}.aw-display-options label{margin:10px 0}.aw-display-options select{max-width:100%;padding:8px}.aw-display-status{margin:12px;padding:14px;border:1px solid #8772cf;border-radius:12px;max-height:35vh;overflow:auto}.aw-display-status h3{margin:0 0 8px}.aw-display-item{padding:9px;margin:7px 0;border-radius:8px;background:rgba(125,105,190,.12)}.aw-display-item p{margin:5px 0;overflow-wrap:anywhere}@media(max-width:600px){.aw-display-status{max-height:28vh;margin:8px}}'; document.head.append(style);
  const originalOpen = App.openBuilder.bind(App);
  App.openBuilder = function(...args) { const result = originalOpen(...args); installControls(); return result; };
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { const result = originalShell(...args); installStatus(); return result; };
  window.BAOWorldDisplay = { render: renderStatus, preferences: () => ({...preferences}) };
})();

// Native story start: retain the original card greeting and existing API/memory
// pipeline. The former multi-step world creator remains available only to old
// saved stories, not as a required setup screen for new playthroughs.
(() => {
  'use strict';
  const ID = 'autonomous-npc-world';
  if (typeof App === 'undefined' || App.__nativeAutonomousWorldStart) return;
  const originalOpen = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    const result = originalOpen(...args);
    if (this.activeCharacter?.id !== ID) return result;
    document.getElementById('autonomous-world-setup')?.remove();
    document.getElementById('aw-display-options')?.remove();
    document.getElementById('offline-start-status')?.remove();
    const mode = document.querySelector('input[name="narrative-mode"][value="world"]');
    if (mode) { mode.checked = true; mode.dispatchEvent(new Event('change', { bubbles: true })); }
    return result;
  };
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    const result = originalShell(fresh);
    if (fresh && this.activeCharacter?.id === ID && !this.config?.offlineWorldPreview && !Chat.messages.length) {
      const stream = document.getElementById('chat-stream');
      if (stream) stream.innerHTML = `<div class="message assistant"><div class="bubble">${this.formatMessage(this.activeCharacter.greeting || '')}</div></div>`;
    }
    return result;
  };
  const originalPrompt = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalPrompt();
    if (this.activeCharacter?.id !== ID || this.config?.worldSetup || Chat.messages.length !== 1 || Chat.messages[0]?.role !== 'user') return base;
    return base + '\n\n【已向玩家顯示的原始開場白】\n' + String(this.activeCharacter.greeting || '') + '\n玩家已看過這段開場白；請依照玩家第一則輸入建立世界，不要無故重複要求選擇。';
  };
  App.__nativeAutonomousWorldStart = true;
})();
