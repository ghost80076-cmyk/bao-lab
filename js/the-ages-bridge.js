/* The Ages: bounded, story-local game saves and protocol receipts for an opaque author iframe. */
(() => {
  'use strict';
  const ID = 'shikong-zhimen', PREFIX = 'bao-lab:author-regex:v1:';
  const saves = new WeakMap();
  let installed = false;
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
    const render = App.renderStoryMessage;
    App.renderStoryMessage = function(content, ...args) {
      const value = App.activeCharacter?.id === ID
        ? String(content || '').replace(/\[\[(?:TG_PANEL|TGA:[A-Z0-9]{6}|TGX:[^\]\r\n]{1,80})\]\]/g, '') : content;
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
  function protocol() {
    // Only assistant-generated protocol markers and the latest explicit plot-save cross the bridge.
    // User input cannot forge acknowledgements or item offers. No ordinary dialogue is shared.
    const markers = []; let plot = '', manualTurns = 0, size = 0;
    for (const message of (Chat.messages || [])) {
      if (typeof message.content !== 'string') continue;
      if (message.role === 'user') { if (!message.content.includes('[[TGQ:')) manualTurns++; continue; }
      if (message.role !== 'assistant') continue;
      for (const m of message.content.matchAll(/\[\[(?:TGA:[A-Z0-9]{6}|TGX:[^\]\r\n]{1,80})\]\]/g)) {
        markers.push(m[0]); size += m[0].length;
        while (size > 120000) size -= markers.shift().length;
      }
      for (const m of message.content.matchAll(/\[\[TGS:開始\]\]([\s\S]{0,3000}?)\[\[TGS:結束\]\]/g)) plot = m[0];
    }
    return { text: markers.join('\n') + '\n' + plot, manualTurns };
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
    const config = settings();
    choices(active);
    const value = { storage: config.allowGamePersistence === true ? structuredClone(saves.get(active.story) || {}) : {},
      persistent: config.allowGamePersistence === true, receipts: config.allowGameReceipts === true,
      protocol: config.allowGameReceipts === true ? protocol() : { text: '', manualTurns: 0 } };
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
    if (panel?.isConnected) return;
    panel = document.createElement('div'); panel.id = 'the-ages-permissions';
    for (const [key, label, note] of [
      ['allowGameReceipts', '允許讀取遊戲回執', '只提供本故事 AI 輸出的 TGA／TGX 標記、劇情存檔及手動回合計數，供面板確認結算。'],
      ['allowGamePersistence', '保存冒險進度', '將冒險面板角色、背包與角色庫存入本故事及備份，最多 256 KB；不會送入模型。']
    ]) {
      const row = document.createElement('label'), input = document.createElement('input');
      row.style.cssText = 'display:block;margin:8px 0;font-size:13px'; input.type = 'checkbox'; input.checked = settings()[key] === true;
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
  window.BAOTheAgesBridge = Object.freeze({ install, send, handle, bootstrap, controls, clear });
})();
