/* Opt-in author regex preview. Never changes model calls, Chat.messages or saved state. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  if (!Core || !window.App || !window.Chat) return;
  const CORE_URL = new URL('author-regex-core.js', document.currentScript?.src || location.href).href;
  const PREFIX = 'bao-lab:author-regex:v1:';
  const empty = () => ({ enabled: false, allowScripts: false, allowExternalAssets: false,
    allowStateSharing: false, allowUiPersistence: false, rules: [] });
  const cardId = () => String(App.activeCharacter?.id || '').slice(0, 80);
  const key = id => PREFIX + encodeURIComponent(id);
  const load = id => {
    try {
      const data = JSON.parse(localStorage.getItem(key(id)) || 'null');
      return data && Array.isArray(data.rules) ? {
        enabled: data.enabled === true, allowScripts: data.allowScripts === true,
        allowExternalAssets: data.allowExternalAssets === true,
        allowStateSharing: data.allowStateSharing === true,
        // Retain the dock's independent permission whenever this panel saves another toggle.
        allowUiPersistence: data.allowUiPersistence === true, rules: Core.normalize(data.rules)
      } : empty();
    } catch (_) { return empty(); }
  };
  const save = (id, data) => localStorage.setItem(key(id), JSON.stringify(data));
  let panel, status, activeCheckbox, scriptCheckbox, externalCheckbox, stateCheckbox, fileInput, sourceSelect, overlay;
  let currentFrame = null, currentToken = '', currentOwner = '', currentScripts = false, lastDraftAt = 0;
  const say = message => { if (status) status.textContent = message; };
  const close = () => {
    if (overlay) overlay.remove();
    overlay = null; currentFrame = null; currentToken = ''; currentOwner = ''; currentScripts = false;
  };
  const stateForAuthor = () => {
    const state = window.GameState?.current || {};
    const statuses = {};
    for (const [name, fields] of Object.entries(state.characterStatuses || {}).slice(0, 12)) {
      if (!fields || typeof fields !== 'object') continue;
      const safeName = String(name).slice(0, 80);
      statuses[safeName] = {};
      for (const [field, value] of Object.entries(fields).slice(0, 30)) {
        if (['string', 'number', 'boolean'].includes(typeof value))
          statuses[safeName][String(field).slice(0, 80)] = String(value).slice(0, 180);
      }
    }
    return {
      time: String(state.time || '').slice(0, 120), location: String(state.location || '').slice(0, 120),
      character: String(App.activeCharacter?.name || '').slice(0, 80), characterStatuses: statuses,
      npcs: (Array.isArray(state.npcs) ? state.npcs : []).slice(0, 16).map(npc => ({
        name: String(npc.name || '').slice(0, 80), mood: String(npc.mood || '').slice(0, 120),
        presence: String(npc.presence || '').slice(0, 40)
      }))
    };
  };
  const sendState = () => {
    if (!currentScripts || !currentFrame?.isConnected || cardId() !== currentOwner || !currentToken
      || load(currentOwner).allowStateSharing !== true) return;
    currentFrame.contentWindow?.postMessage({ baoAuthor: 'v1', token: currentToken,
      type: 'state', value: stateForAuthor() }, '*');
  };
  window.addEventListener('message', event => {
    if (!currentScripts || !currentFrame || event.source !== currentFrame.contentWindow || event.origin !== 'null'
      || cardId() !== currentOwner || !event.data || event.data.baoAuthor !== 'v1'
      || event.data.token !== currentToken) return;
    if (event.data.type === 'ready') { sendState(); return; }
    if (event.data.type !== 'draft' || typeof event.data.value !== 'string'
      || !event.data.value.trim() || event.data.value.length > 500) return;
    if (Date.now() - lastDraftAt < 1000) return;
    lastDraftAt = Date.now();
    const input = document.getElementById('user-input');
    if (!input || !document.getElementById('chat-view')?.classList.contains('active')) return;
    if (input.value.trim() && !confirm('作者介面希望填入新的行動。要取代目前尚未送出的文字嗎？')) return;
    input.value = event.data.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    close(); input.focus();
    say('自訂介面已把內容填入輸入框；確認後再自行送出。');
  });
  function workerRender(text, rules, allowScripts) {
    return new Promise((resolve, reject) => {
      const workerCode = `importScripts(${JSON.stringify(CORE_URL)});onmessage=function(e){try{postMessage({result:self.BAOAuthorRegexCore.render(e.data.text,e.data.rules,e.data.allowScripts)});}catch(error){postMessage({error:String(error.message||error)});}};`;
      const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
      let worker;
      try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); reject(error); return; }
      let done = false;
      const finish = (error, result) => {
        if (done) return;
        done = true; clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url);
        if (error) reject(error); else resolve(result);
      };
      const timer = setTimeout(() => finish(new Error('正則處理超過 2 秒，已停止；原始故事未變更。')), 2000);
      worker.onmessage = e => e.data?.error ? finish(new Error(e.data.error)) : finish(null, e.data?.result);
      worker.onerror = () => finish(new Error('正則工作執行失敗；請檢查格式與瀏覽器。'));
      worker.postMessage({ text, rules, allowScripts });
    });
  }
  const bootstrap = token => `<script>(function(){'use strict';const token=${JSON.stringify(token)};let state={};window.BAOAuthor=Object.freeze({draft:function(value){if(typeof value==='string'&&value.length<=500)parent.postMessage({baoAuthor:'v1',token:token,type:'draft',value:value},'*');},getState:function(){return JSON.parse(JSON.stringify(state));}});window.addEventListener('message',function(e){if(e.source!==parent||!e.data||e.data.baoAuthor!=='v1'||e.data.token!==token||e.data.type!=='state')return;state=e.data.value||{};window.dispatchEvent(new CustomEvent('bao:statechange',{detail:window.BAOAuthor.getState()}));});parent.postMessage({baoAuthor:'v1',token:token,type:'ready'},'*');})();</script>`;
  function show(htmlResult, owner, allowExternalAssets) {
    close();
    currentOwner = owner;
    currentScripts = Boolean(htmlResult.script);
    currentToken = crypto.randomUUID?.() || String(Math.random()) + String(Date.now());
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:#000b;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:10px;box-sizing:border-box';
    const box = document.createElement('div');
    box.style.cssText = 'background:#171723;color:#fff;border-radius:14px;display:flex;flex-direction:column;width:min(980px,100%);height:min(90vh,100%);overflow:hidden;border:1px solid #876c91';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;gap:10px;padding:12px;justify-content:space-between;flex-wrap:wrap';
    const title = document.createElement('strong');
    title.textContent = `自訂介面預覽｜${htmlResult.name || '自訂畫面'}`;
    const back = document.createElement('button'); back.type = 'button'; back.textContent = '關閉預覽 ✕';
    back.addEventListener('click', close); bar.append(title, back);
    const note = document.createElement('small'); note.style.cssText = 'padding:0 12px 10px;color:#e6cce6';
    note.textContent = '這個畫面只在本機預覽。互動按鈕只會把文字填進輸入框，不會自行送出。';
    currentFrame = document.createElement('iframe');
    currentFrame.title = '作者正則隔離介面'; currentFrame.referrerPolicy = 'no-referrer';
    currentFrame.setAttribute('sandbox', currentScripts ? 'allow-scripts' : '');
    currentFrame.style.cssText = 'display:block;flex:1;min-height:0;width:100%;border:0;background:white';
    const assets = allowExternalAssets ? 'https: data:' : 'data:';
    const csp = `default-src 'none'; script-src ${currentScripts ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline'; img-src ${assets}; font-src ${assets}; media-src ${assets}; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;
    currentFrame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><style>html,body{margin:0;min-height:100%;overflow-wrap:anywhere}*,*:before,*:after{box-sizing:border-box}</style>'
      + (currentScripts ? bootstrap(currentToken) : '') + '</head><body>' + htmlResult.html + '</body></html>';
    box.append(bar, note, currentFrame); overlay.append(box); document.body.append(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    currentFrame.addEventListener('load', sendState);
  }
  const sourceFromCard = () => App.activeCharacter?.import_metadata?.preserved_source;
  const showCount = () => {
    const data = load(cardId());
    if (activeCheckbox) activeCheckbox.checked = data.enabled;
    if (scriptCheckbox) scriptCheckbox.checked = data.allowScripts;
    if (externalCheckbox) externalCheckbox.checked = data.allowExternalAssets;
    if (stateCheckbox) stateCheckbox.checked = data.allowStateSharing;
    say(`已設定：${data.rules.length} 個；其中 ${data.rules.filter(r => r.reason).length} 個需要檢查格式。`);
  };
  const importData = raw => {
    const id = cardId(); if (!id) throw new Error('請先進入一張角色卡的故事。');
    const rules = Core.normalize(raw);
    const current = empty(); current.rules = rules;
    save(id, current); showCount();
    say(`已匯入 ${rules.length} 個自訂介面設定，預設不啟用。確認來源後再開啟即可。`);
  };
  function mount() {
    if (panel?.isConnected) return;
    const aside = document.querySelector('#chat-view aside');
    if (!aside || document.getElementById('bao-author-regex-panel')) return;
    panel = document.createElement('details'); panel.id = 'bao-author-regex-panel';
    panel.style.cssText = 'padding:12px;margin:12px 0;border:1px solid #987a9c;border-radius:10px;display:grid;gap:8px';
    const summary = document.createElement('summary'); summary.textContent = '🧩 自訂介面'; panel.append(summary);
    const intro = document.createElement('p'); intro.style.cssText = 'font-size:12px;line-height:1.6';
    intro.textContent = '為這張作品加入特殊排版、按鈕或互動畫面。一般情況不需要設定。'; panel.append(intro);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
    panel.append(actions);
    const makeButton = (label, action, host = panel) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.margin = '4px';
      b.addEventListener('click', action); host.append(b); return b;
    };
    makeButton('匯入設定', () => fileInput.click(), actions);
    fileInput = document.createElement('input'); fileInput.type = 'file'; fileInput.accept = '.json,application/json'; fileInput.hidden = true;
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0]; fileInput.value = ''; if (!file) return;
      try {
        if (file.size > 1024 * 1024) throw new Error('檔案超過 1 MB，請使用較小的設定檔。');
        importData(JSON.parse(await file.text()));
      } catch (error) { say('匯入失敗：' + error.message); }
    }); panel.append(fileInput);
    const cardImport = makeButton('從角色卡讀取', () => {
      try { if (!sourceFromCard()) throw new Error('這張卡沒有保留可讀取的來源設定。'); importData(sourceFromCard()); }
      catch (error) { say('讀取失敗：' + error.message); }
    }, actions);
    cardImport.title = '從角色卡來源讀取已保存的自訂介面設定';

    const makeToggle = (host, label, checked, change) => {
      const line = document.createElement('label'); line.style.cssText = 'display:block;margin:8px 0;font-size:13px';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = checked;
      input.addEventListener('change', () => change(input));
      line.append(input, document.createTextNode(' ' + label)); host.append(line); return input;
    };
    activeCheckbox = makeToggle(panel, '啟用自訂介面', false, input => {
      const id = cardId(); if (!id) { input.checked = false; return; }
      const data = load(id); data.enabled = input.checked;
      try { save(id, data); showCount(); } catch (error) { input.checked = false; say('保存失敗：' + error.message); }
    });

    const previewLabel = document.createElement('label');
    previewLabel.textContent = '預覽內容';
    previewLabel.style.cssText = 'display:grid;gap:4px;font-size:13px';
    sourceSelect = document.createElement('select'); sourceSelect.style.cssText = 'max-width:100%;margin:4px 0 8px';
    [['greeting','開場畫面'],['latest','最新 AI 回覆']].forEach(([value, label]) => {
      const option = document.createElement('option'); option.value = value; option.textContent = label; sourceSelect.append(option);
    });
    previewLabel.append(sourceSelect); panel.append(previewLabel);
    const preview = makeButton('預覽自訂介面', async () => {
      const id = cardId(), data = load(id);
      if (!id || !data.enabled || !data.rules.length) { say('請先匯入設定並勾選「啟用自訂介面」。'); return; }
      const latest = [...Chat.messages].reverse().find(message => message.role === 'assistant');
      const text = sourceSelect.value === 'latest' ? latest?.content : App.activeCharacter?.greeting;
      if (!text) { say('目前沒有可預覽的 AI 回覆，請改選開場畫面。'); return; }
      preview.disabled = true; say('正在準備預覽，不會呼叫 AI……');
      try {
        const result = await workerRender(text, data.rules, data.allowScripts);
        if (id !== cardId()) { say('已切換故事，取消舊作品的預覽。'); return; }
        if (!result?.matched) { say('這段內容沒有符合目前設定，因此沒有自訂介面可以顯示。'); return; }
        show(result, id, data.allowExternalAssets);
        say(result.blocked ? '已顯示靜態介面；互動腳本尚未獲得權限。' : '預覽已開啟。關閉後原本劇情仍會保留。');
      } catch (error) { say('預覽失敗：' + error.message); }
      finally { preview.disabled = false; }
    });

    const advanced = document.createElement('details');
    advanced.id = 'bao-author-interface-advanced';
    advanced.style.cssText = 'margin-top:8px;padding-top:8px;border-top:1px dashed #7c637f';
    const advancedSummary = document.createElement('summary'); advancedSummary.textContent = '⚙️ 進階設定';
    const advancedNote = document.createElement('p'); advancedNote.style.cssText = 'font-size:12px;line-height:1.6';
    advancedNote.textContent = '一般情況不需要修改。只有信任作品來源時才開啟額外權限。';
    advanced.append(advancedSummary, advancedNote);

    scriptCheckbox = makeToggle(advanced, '允許互動腳本', false, input => {
      const id = cardId(); if (!id) { input.checked = false; return; }
      if (input.checked && !confirm('這會允許作品內的互動腳本在隔離視窗執行。只在信任作品來源時開啟。確定允許嗎？')) { input.checked = false; return; }
      const data = load(id); data.allowScripts = input.checked;
      try { save(id, data); showCount(); } catch (error) { input.checked = false; say('保存失敗：' + error.message); }
    });
    stateCheckbox = makeToggle(advanced, '允許讀取故事狀態', false, input => {
      const id = cardId(); if (!id) { input.checked = false; return; }
      if (input.checked && !confirm('互動介面可讀取這個故事的部分時間、地點、NPC 與角色狀態。確定允許嗎？')) { input.checked = false; return; }
      const data = load(id); data.allowStateSharing = input.checked;
      try { save(id, data); close(); showCount(); } catch (error) { input.checked = false; say('保存失敗：' + error.message); }
    });
    externalCheckbox = makeToggle(advanced, '允許外部圖片、字型與媒體', false, input => {
      const id = cardId(); if (!id) { input.checked = false; return; }
      if (input.checked && !confirm('外部資源提供者可能得知 IP、讀取時間等連線資訊。只在信任來源時開啟。確定允許嗎？')) { input.checked = false; return; }
      const data = load(id); data.allowExternalAssets = input.checked;
      try { save(id, data); showCount(); } catch (error) { input.checked = false; say('保存失敗：' + error.message); }
    });
    panel.append(advanced);

    const developer = document.createElement('details');
    developer.id = 'bao-author-interface-developer';
    developer.style.cssText = 'margin-top:4px';
    const developerSummary = document.createElement('summary'); developerSummary.textContent = '開發者設定';
    const developerNote = document.createElement('p'); developerNote.style.cssText = 'font-size:12px;line-height:1.6';
    developerNote.textContent = '匯入舊式規則或調整進階文字替換時使用。一般作者可以忽略。';
    developer.append(developerSummary, developerNote); panel.append(developer);

    status = document.createElement('p'); status.setAttribute('role', 'status');
    status.style.cssText = 'font-size:12px;line-height:1.6;overflow-wrap:anywhere';
    panel.append(status);
    aside.append(panel);
    panel.addEventListener('toggle', () => { if (panel.open) showCount(); });
    showCount();
  }
  const originalShowView = App.showView.bind(App);
  App.showView = function(...args) { if (args[0] !== 'chat') close(); return originalShowView(...args); };
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { close(); const result = originalShell(...args); mount(); if (panel?.open) showCount(); return result; };
  if (window.GameState?.applyUpdate && !GameState.__baoAuthorRegexHooked) {
    const originalUpdate = GameState.applyUpdate;
    GameState.applyUpdate = function(...args) { const result = originalUpdate.apply(this, args); queueMicrotask(sendState); return result; };
    GameState.__baoAuthorRegexHooked = true;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
