/* The Ages: bounded, story-local game saves and protocol receipts for an opaque author iframe. */
(() => {
  'use strict';
  if (window.BAOTheAgesBridge) return;
  const ID = 'shikong-zhimen', PREFIX = 'bao-lab:author-regex:v1:';
  const saves = new WeakMap();
  let installed = false, entryQueued = false, openStory = null;
  const settings = () => { try { const value = JSON.parse(localStorage.getItem(PREFIX + ID) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } };
  function normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      if (!['tgmud1_save', 'tgmud1_save_box', 'tgmud1_save_ui'].includes(key) || typeof entry !== 'string') return null;
      out[key] = entry;
    }
    return JSON.stringify(out).length <= 262144 ? out : null;
  }
  function install() {
    if (installed) return;
    installed = true;
    const shell = App.renderChatShell.bind(App), view = App.showView.bind(App);
    App.renderChatShell = function(...args) { const result = shell(...args); scheduleEntry(); return result; };
    App.showView = function(...args) { const result = view(...args); scheduleEntry(); return result; };
    const stream = document.getElementById('chat-stream');
    if (stream) new MutationObserver(scheduleEntry).observe(stream, { childList: true, subtree: true, characterData: true });
    document.addEventListener('change', event => { if (event.target?.closest?.('#bao-author-regex-panel')) scheduleEntry(); });
    window.addEventListener('bao:author-regex-changed', scheduleEntry);
    window.addEventListener('storage', event => { if (event.key === PREFIX + ID || event.key === 'bao-lab:author-regex-dock:v1:' + ID) scheduleEntry(); });
    scheduleEntry();
    const render = App.renderStoryMessage;
    App.renderStoryMessage = function(content, ...args) {
      const value = displaySource(App.activeCharacter?.id, content);
      return render.call(this, value, ...args);
    };
    const build = Storage.buildStoryPayload, restore = Storage.restoreStory;
    Storage.buildStoryPayload = function(...args) {
      const result = build.apply(this, args), value = GameState.current && saves.get(GameState.current);
      if (result?.characterId === ID && value) result.authorGame = { version: 1, characterId: ID, storage: structuredClone(value) };
      return result;
    };
    Storage.restoreStory = function(source, ...args) {
      const result = restore.call(this, source, ...args), record = source?.authorGame;
      if (result && GameState.current && App.activeCharacter?.id === ID && record?.version === 1 && record.characterId === ID) {
        const value = normalize(record.storage);
        if (value) saves.set(GameState.current, value);
      }
      return result;
    };
  }
  function displaySource(owner, content) {
    return owner === ID ? String(content || '').replace(/\[\[(?:TG_PANEL|TGA:[A-Z0-9]{6}|TGX:[^\]\r\n]{1,80})\]\]/g, '') : content;
  }
  const requiresDock = owner => owner === ID;
  function fullyEnabled() {
    const config = settings();
    return Array.isArray(config.rules) && config.rules.length > 0 && config.enabled === true && config.allowScripts === true && config.allowGameReceipts === true
      && config.allowGamePersistence === true && localStorage.getItem('bao-lab:author-regex-dock:v1:' + ID) === '1';
  }
  function openPanel() {
    const panel = document.getElementById('bao-author-dock');
    if (panel) { panel.open = true; panel.scrollIntoView({ block: 'nearest' }); }
  }
  async function activate(button) {
    if (fullyEnabled()) { openStory = GameState.current; openPanel(); window.BAOAuthorDock?.refresh?.(); return; }
    const story = GameState.current;
    if (!story || App.activeCharacter?.id !== ID) return;
    if (!confirm('啟用齊格飛《時空之門》的冒險面板？\n\n此面板需要：\n・執行作者的互動腳本（仍在隔離畫面內）。\n・讀取本故事 AI 的遊戲回執及劇情存檔，以確認結算。\n・將角色、背包與冒險進度保存到本故事及備份。\n\n面板不會自動呼叫 AI；需要演出的指令仍由你按送出。可在自訂介面進階設定停用。')) return;
    const entry = document.getElementById('the-ages-entry');
    if (entry) delete entry.dataset.error;
    openStory = story;
    button.disabled = true; button.textContent = '正在開啟面板…';
    try {
      let config = settings();
      if (!Array.isArray(config.rules) || !config.rules.length) {
        const response = await fetch('data/characters/general/shikong-zhimen.regex.json', { cache: 'no-store' });
        if (!response.ok) throw Error('面板下載失敗，請稍後再試。');
        const source = await response.json();
        if (source.characterId !== ID) throw Error('面板作品不符。');
        const rules = window.BAOAuthorRegexCore?.normalize(source);
        if (!rules?.length || rules.some(rule => rule.reason)) throw Error('面板設定未完整載入，請重新整理後再試。');
        config = { ...settings(), rules, source: 'official-sidecar', sourcePath: 'data/characters/general/shikong-zhimen.regex.json' };
      }
      if (GameState.current !== story || App.activeCharacter?.id !== ID) return;
      config = { ...config, enabled: true, allowScripts: true, allowGameReceipts: true, allowGamePersistence: true };
      localStorage.setItem(PREFIX + ID, JSON.stringify(config));
      localStorage.setItem('bao-lab:author-regex-dock:v1:' + ID, '1');
      window.BAOAuthorInline?.refresh?.(); window.BAOAuthorDock?.refresh?.();
      window.dispatchEvent(new CustomEvent('bao:author-regex-changed'));
      setTimeout(openPanel, 100);
    } catch (error) {
      const note = document.querySelector('#the-ages-entry [role="status"]');
      if (openStory === story) openStory = null;
      if (entry) entry.dataset.error = error.message;
      if (note) note.textContent = error.message;
    } finally { button.disabled = false; scheduleEntry(); }
  }
  function syncEntry() {
    entryQueued = false;
    let entry = document.getElementById('the-ages-entry');
    if (App.activeCharacter?.id !== ID || !GameState.current || !document.getElementById('chat-view')?.classList.contains('active')) {
      entry?.remove(); return;
    }
    const stream = document.getElementById('chat-stream');
    if (!stream?.parentElement) return;
    if (!entry) {
      entry = document.createElement('section'); entry.id = 'the-ages-entry'; entry.setAttribute('aria-label', '時空之門冒險面板入口');
      entry.style.cssText = 'flex-shrink:0;margin:6px 0;padding:10px 12px;border:1px solid #c9a24a;border-radius:12px;background:#211b12;color:#f2e5c4;display:flex;gap:8px;align-items:center;flex-wrap:wrap';
      const note = document.createElement('span'); note.setAttribute('role', 'status'); note.style.cssText = 'font-size:13px;line-height:1.6;flex:1 1 160px';
      const button = document.createElement('button'); button.type = 'button'; button.id = 'the-ages-enable';
      button.style.cssText = 'width:auto;min-height:44px;padding:8px 14px;flex-shrink:0;border:1px solid #c9a24a;border-radius:8px;background:#d5b56b;color:#17130d;font-weight:700';
      button.addEventListener('click', () => { void activate(button); });
      entry.append(note, button);
      stream.parentElement.insertBefore(entry, stream);
    }
    const enabled = fullyEnabled(), button = entry.querySelector('button');
    if (!button.disabled) {
      const label = enabled ? '展開冒險面板' : '啟用冒險面板';
      if (button.textContent !== label) button.textContent = label;
      const text = entry.dataset.error || (enabled ? '角色建立、移動與戰鬥都在冒險面板操作。' : '先啟用冒險面板，才能建立角色與開始教學。');
      const note = entry.querySelector('[role="status"]');
      if (note.textContent !== text) note.textContent = text;
    }
  }
  function panelHTML(owner, html) {
    if (owner !== ID) return html;
    // Older linked rules replaced only the trigger and escaped the rest of the opening.
    // Keep the authored engine nodes; the opening is already rendered in the native reader.
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.body.children].filter(node => node.id === 'tg-bridge-note' || node.tagName === 'SCRIPT' || node.tagName === 'STYLE')
      .map(node => node.outerHTML).join('');
  }
  function scheduleEntry() { if (!entryQueued) { entryQueued = true; queueMicrotask(syncEntry); } }
  function protocol() {
    // Only assistant-generated protocol markers and the latest explicit plot-save cross the bridge.
    // User input cannot forge acknowledgements or item offers. No ordinary dialogue is shared.
    const markers = []; let plot = '', manualTurns = 0, size = 0, hasGameCommands = false;
    for (const message of (Chat.messages || [])) {
      if (typeof message.content !== 'string') continue;
      if (message.role === 'user') { if (message.content.includes('[[TGQ:')) hasGameCommands = true; else manualTurns++; continue; }
      if (message.role !== 'assistant') continue;
      for (const m of message.content.matchAll(/\[\[(?:TGA:[A-Z0-9]{6}|TGX:[^\]\r\n]{1,80})\]\]/g)) {
        markers.push(m[0]); size += m[0].length;
        while (size > 120000) size -= markers.shift().length;
      }
      for (const m of message.content.matchAll(/\[\[TGS:開始\]\]([\s\S]{0,3000}?)\[\[TGS:結束\]\]/g)) plot = m[0];
    }
    return { text: markers.join('\n') + '\n' + plot, manualTurns, hasGameCommands };
  }
  function choices(active) {
    const message = [...(Chat.messages || [])].reverse().find(m => m.role === 'assistant');
    const messageKey = String(message?.id || message?.content || '');
    if (active.choiceKey === messageKey && (active.choiceEmpty || document.getElementById('the-ages-choices'))) return;
    active.choiceKey = messageKey;
    const doc = new DOMParser().parseFromString(String(message?.content || ''), 'text/html');
    const items = [...doc.querySelectorAll('hc-btn[send]')].slice(0, 3).map((node, index) => ({ key: String(index + 1), text: node.getAttribute('send').slice(0, 500) }));
    active.choiceEmpty = items.length < 2;
    window.BAOActionChoiceDock?.mount({ owner: ID, id: 'the-ages-choices', className: 'the-ages-choices', choices: items, messageKey: String(message?.id || message?.content || '') });
  }
  function post(active, type, value) {
    active.frame.contentWindow?.postMessage({ baoAuthor: 'v1', token: active.token, type, value }, '*');
  }
  function send(active) {
    if (active?.owner !== ID || !active.allowScripts || !active.ready || active.story !== GameState.current) return;
    if (openStory === active.story) { openStory = null; openPanel(); }
    const config = settings();
    choices(active);
    const value = { storage: config.allowGamePersistence === true ? structuredClone(saves.get(active.story) || {}) : {},
      persistent: config.allowGamePersistence === true, receipts: config.allowGameReceipts === true,
      protocol: config.allowGameReceipts === true ? protocol() : { text: '', manualTurns: 0, hasGameCommands: false } };
    const signature = JSON.stringify(value);
    if (signature === active.gameSignature) return;
    active.gameSignature = signature;
    post(active, 'the-ages-state', value);
  }
  function handle(active, message) {
    if (active.owner !== ID || !message.type?.startsWith('the-ages-')) return false;
    if (message.type === 'the-ages-save' && settings().allowGamePersistence === true) {
      const value = normalize(message.value);
      if (value) { saves.set(active.story, value); Storage.saveStory(); }
    }
    if (message.type === 'the-ages-draft' && typeof message.value === 'string' && message.value.trim()
      && message.value.length <= 16000 && Date.now() - (active.gameDraftAt || 0) >= 500) {
      active.gameDraftAt = Date.now();
      const input = document.getElementById('user-input');
      if (input && (!input.value.trim() || confirm('要用冒險面板的指令取代尚未送出的文字嗎？'))) {
        input.value = message.value; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
      }
    }
    return true;
  }
  function bootstrap(owner, token) {
    if (owner !== ID) return '';
    return '<script>(' + function(token) {
      let state = null;
      window.BAOTheAges = Object.freeze({
        getState: () => state ? JSON.parse(JSON.stringify(state)) : null,
        draft: value => parent.postMessage({ baoAuthor: 'v1', token, type: 'the-ages-draft', value }, '*'),
        save: value => parent.postMessage({ baoAuthor: 'v1', token, type: 'the-ages-save', value }, '*')
      });
      window.addEventListener('message', e => {
        if (e.source !== parent || e.data?.baoAuthor !== 'v1' || e.data.token !== token || e.data.type !== 'the-ages-state') return;
        state = e.data.value;
        window.dispatchEvent(new CustomEvent('bao:the-ages-state', { detail: window.BAOTheAges.getState() }));
      });
    }.toString() + ')(' + JSON.stringify(token) + ');</script>';
  }
  function controls(host, owner) {
    let panel = document.getElementById('the-ages-permissions');
    if (owner !== ID) { panel?.remove(); return; }
    if (panel?.isConnected) {
      for (const input of panel.querySelectorAll('input[data-game-permission]')) input.checked = settings()[input.dataset.gamePermission] === true;
      return;
    }
    panel = document.createElement('div'); panel.id = 'the-ages-permissions';
    for (const [key, label, note] of [
      ['allowGameReceipts', '允許讀取遊戲回執', '只提供本故事 AI 輸出的 TGA／TGX 標記、劇情存檔及手動回合計數，供面板確認結算。'],
      ['allowGamePersistence', '保存冒險進度', '將冒險面板角色、背包與角色庫存入本故事及備份，最多 256 KB；不會送入模型。']
    ]) {
      const row = document.createElement('label'), input = document.createElement('input');
      row.style.cssText = 'display:block;margin:8px 0;font-size:13px'; input.type = 'checkbox'; input.dataset.gamePermission = key; input.checked = settings()[key] === true;
      input.addEventListener('change', () => {
        if (input.checked && !confirm(note + ' 確定允許嗎？')) { input.checked = false; return; }
        const config = settings(); config[key] = input.checked;
        localStorage.setItem(PREFIX + ID, JSON.stringify(config));
      });
      row.append(input, document.createTextNode(' ' + label));
      const help = document.createElement('small'); help.style.display = 'block'; help.textContent = note;
      panel.append(row, help);
    }
    host.append(panel);
  }
  function clear(active) { if (active?.owner === ID) window.BAOActionChoiceDock?.reset(ID); }
  window.BAOTheAgesBridge = Object.freeze({ install, send, handle, bootstrap, controls, clear, requiresDock, panelHTML, displaySource });
})();
