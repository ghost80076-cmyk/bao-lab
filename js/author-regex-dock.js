/* Story-scoped, opt-in author interface. Presentation only; no prompts or model calls. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  if (!Core || !window.App || !window.Chat || !window.GameState) return;
  const PREFIX = 'bao-lab:author-regex:v1:';
  const DOCK_PREFIX = 'bao-lab:author-regex-dock:v1:';
  const CORE_URL = new URL('author-regex-core.js', document.currentScript?.src || location.href).href;
  const stream = document.getElementById('chat-stream');
  const main = document.querySelector('#chat-view .chat-main');
  if (!stream || !main) return;
  let active = null, sequence = 0, queued = false, control = null, lastDraftAt = 0;
  const cardId = () => String(App.activeCharacter?.id || '').slice(0, 80);
  const key = id => DOCK_PREFIX + encodeURIComponent(id);
  const optedIn = id => { try { return localStorage.getItem(key(id)) === '1'; } catch (_) { return false; } };
  const settings = id => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREFIX + encodeURIComponent(id)) || 'null');
      return saved && saved.enabled === true && Array.isArray(saved.rules) && saved.rules.length ? saved : null;
    } catch (_) { return null; }
  };
  const enabled = () => Boolean(cardId() && GameState.current && optedIn(cardId()) && settings(cardId()));
  const inChat = () => document.getElementById('chat-view')?.classList.contains('active');
  const safe = (value, max = 120) => String(value ?? '').slice(0, max);
  function snapshot() {
    const state = GameState.current || {};
    const characterStatuses = {};
    for (const [name, fields] of Object.entries(state.characterStatuses || {}).slice(0, 12)) {
      if (!fields || typeof fields !== 'object' || Array.isArray(fields)) continue;
      const status = {};
      for (const [field, value] of Object.entries(fields).slice(0, 30)) {
        if (['string', 'number', 'boolean'].includes(typeof value)) status[safe(field, 80)] = safe(value, 180);
        else if (Array.isArray(value)) status[safe(field, 80)] = value.slice(0, 12).map(x => safe(x, 80)).join('、');
      }
      characterStatuses[safe(name, 80)] = status;
    }
    return {
      time: safe(state.time), location: safe(state.location), character: safe(App.activeCharacter?.name, 80),
      characterStatuses,
      npcs: (Array.isArray(state.npcs) ? state.npcs : []).slice(0, 16).map(npc => ({
        name: safe(npc?.name, 80), mood: safe(npc?.mood), location: safe(npc?.location),
        presence: safe(npc?.presence, 40)
      }))
    };
  }
  function sendState() {
    if (!active || active.story !== GameState.current || active.owner !== cardId() || !inChat()) return;
    const value = snapshot();
    active.stateLabel.textContent = `世界狀態：${value.time || '未設定'} · ${value.location || '未設定'} · NPC ${value.npcs.length} 位`;
    if (active.allowScripts && active.ready && active.frame?.isConnected)
      active.frame.contentWindow?.postMessage({ baoAuthor: 'v1', token: active.token, type: 'state', value }, '*');
  }
  function clear() {
    sequence++;
    active?.root.remove();
    active = null;
  }
  window.addEventListener('message', event => {
    if (!active || !active.allowScripts || !active.frame?.isConnected || !inChat()
      || active.story !== GameState.current || active.owner !== cardId()
      || event.source !== active.frame.contentWindow || event.origin !== 'null'
      || event.data?.baoAuthor !== 'v1' || event.data.token !== active.token) return;
    if (event.data.type === 'ready') { active.ready = true; sendState(); return; }
    if (event.data.type !== 'draft' || typeof event.data.value !== 'string'
      || !event.data.value.trim() || event.data.value.length > 500 || Date.now() - lastDraftAt < 500) return;
    lastDraftAt = Date.now();
    const input = document.getElementById('user-input');
    if (!input) return;
    if (input.value.trim() && !confirm('要用作者介面的選項取代尚未送出的文字嗎？')) return;
    input.value = event.data.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  });
  function candidates() {
    const records = Array.isArray(Chat.messages) ? Chat.messages : [];
    const latest = records.filter(m => m.role === 'assistant' && typeof m.content === 'string' && m.content).slice(-12).reverse();
    return [...latest.map(m => ({ text: m.content, id: String(m.id || '') })),
      { text: String(App.activeCharacter?.greeting || ''), id: 'greeting' }].filter(item => item.text);
  }
  function renderInWorker(items, rules, allowScripts) {
    return new Promise((resolve, reject) => {
      const code = `importScripts(${JSON.stringify(CORE_URL)});onmessage=e=>{try{let blocked=0;for(const item of e.data.items){try{const result=self.BAOAuthorRegexCore.render(item.text,e.data.rules,e.data.allowScripts);blocked+=result.blocked||0;if(result.matched&&result.rich){postMessage({result,id:item.id});return;}}catch(_){}}postMessage({blocked});}catch(err){postMessage({error:String(err.message||err)});}}`;
      const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      let worker;
      try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); reject(error); return; }
      let finished = false;
      const finish = (error, value) => {
        if (finished) return;
        finished = true; clearTimeout(timer); worker.terminate(); URL.revokeObjectURL(url);
        if (error) reject(error); else resolve(value);
      };
      const timer = setTimeout(() => finish(new Error('正則比對超時；保留原始故事')), 2000);
      worker.onerror = () => finish(new Error('瀏覽器無法執行正則工作執行緒'));
      worker.onmessage = event => event.data?.error ? finish(new Error(event.data.error)) : finish(null, event.data);
      worker.postMessage({ items, rules: Core.normalize(rules), allowScripts });
    });
  }
  const bootstrap = token => `<script>(function(){'use strict';const token=${JSON.stringify(token)};let state={};window.BAOAuthor=Object.freeze({draft:function(value){if(typeof value==='string'&&value.length<=500)parent.postMessage({baoAuthor:'v1',token:token,type:'draft',value:value},'*');},getState:function(){return JSON.parse(JSON.stringify(state));}});window.addEventListener('message',function(e){if(e.source!==parent||e.data?.baoAuthor!=='v1'||e.data.token!==token||e.data.type!=='state')return;state=e.data.value||{};window.dispatchEvent(new CustomEvent('bao:statechange',{detail:window.BAOAuthor.getState()}));});window.addEventListener('DOMContentLoaded',function(){parent.postMessage({baoAuthor:'v1',token:token,type:'ready'},'*');},{once:true});})();</script>`;
  function mount(result, owner, story, signature, allowExternalAssets) {
    clear();
    if (!inChat() || GameState.current !== story || cardId() !== owner) return;
    const root = document.createElement('details');
    root.id = 'bao-author-dock'; root.open = true;
    root.style.cssText = 'margin:8px 0;border:1px solid #987a9c;border-radius:12px;overflow:hidden;background:#181722;color:#fff;flex-shrink:0';
    const summary = document.createElement('summary'); summary.textContent = `常駐作者介面 · ${result.name || '正則排版'}`;
    summary.style.cssText = 'padding:10px 12px;cursor:pointer;font-weight:600';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;align-items:center;justify-content:space-between;padding:0 12px 8px;flex-wrap:wrap';
    const stateLabel = document.createElement('span'); stateLabel.style.cssText = 'font-size:12px;overflow-wrap:anywhere';
    const reload = document.createElement('button'); reload.type = 'button'; reload.textContent = '重新選取介面';
    reload.style.cssText = 'width:auto;padding:5px 10px;font-size:12px';
    reload.addEventListener('click', () => { clear(); schedule(); });
    bar.append(stateLabel, reload);
    const frame = document.createElement('iframe');
    frame.title = '跨回合作者隔離介面'; frame.referrerPolicy = 'no-referrer';
    const allowScripts = Boolean(result.script);
    frame.setAttribute('sandbox', allowScripts ? 'allow-scripts' : ''); // No allow-same-origin.
    frame.style.cssText = 'display:block;width:100%;height:clamp(240px,42vh,520px);border:0;background:#fff';
    const assets = allowExternalAssets ? 'https: data:' : 'data:';
    const csp = `default-src 'none'; script-src ${allowScripts ? "'unsafe-inline'" : "'none'"}; style-src 'unsafe-inline'; img-src ${assets}; font-src ${assets}; media-src ${assets}; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;
    const token = crypto.randomUUID?.() || `${Math.random()}-${Date.now()}`;
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><style>html,body{margin:0;min-height:100%;overflow-wrap:anywhere}*,*:before,*:after{box-sizing:border-box}</style>' + (allowScripts ? bootstrap(token) : '') + '</head><body>' + result.html + '</body></html>';
    root.append(summary, bar, frame);
    main.insertBefore(root, stream);
    active = { owner, story, signature, root, frame, token, ready: false, allowScripts, stateLabel };
    sendState();
  }
  function attachControl() {
    const panel = document.getElementById('bao-author-regex-panel');
    if (!panel) return;
    if (!control || !control.isConnected) {
      const label = document.createElement('label');
      label.style.cssText = 'display:block;margin:8px 0;font-size:13px';
      control = document.createElement('input'); control.type = 'checkbox';
      label.append(control, document.createTextNode(' 跨回合常駐作者介面（不必每輪重建）'));
      const note = document.createElement('small');
      note.style.cssText = 'display:block;line-height:1.6';
      note.textContent = '選用後會固定最新一個命中的介面，後續只同步同一份世界狀態；切換故事或關閉功能會銷毀介面。腳本仍須另外授權。';
      panel.append(label, note);
      control.addEventListener('change', () => {
        const id = cardId();
        try { if (!id) throw new Error('請先進入角色故事'); localStorage.setItem(key(id), control.checked ? '1' : '0'); }
        catch (error) { control.checked = false; console.warn('BAO/LAB author dock:', error.message); }
        clear(); window.BAOAuthorInline?.refresh?.(); schedule();
      });
    }
    control.checked = optedIn(cardId());
  }
  async function refresh() {
    queued = false;
    attachControl();
    const owner = cardId(), story = GameState.current, data = owner && settings(owner);
    if (!inChat() || !story || !owner || !data || !optedIn(owner)) { clear(); return; }
    const signature = JSON.stringify([owner, data.allowScripts === true, data.allowExternalAssets === true, data.rules]);
    if (active && active.owner === owner && active.story === story && active.signature === signature && active.root.isConnected) {
      sendState(); return;
    }
    clear();
    const ticket = sequence;
    try {
      const rendered = await renderInWorker(candidates(), data.rules, data.allowScripts === true);
      if (ticket !== sequence || GameState.current !== story || cardId() !== owner || !inChat() || !optedIn(owner)) return;
      if (!rendered?.result) {
        console.info('BAO/LAB author dock: no compatible rich source found', rendered?.blocked ? '(scripts disabled)' : '');
        return;
      }
      mount(rendered.result, owner, story, signature, data.allowExternalAssets === true);
    } catch (error) { if (ticket === sequence) console.warn('BAO/LAB persistent author interface:', error.message); }
  }
  function schedule() { if (!queued) { queued = true; queueMicrotask(refresh); } }
  const originalShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { const result = originalShell(...args); schedule(); return result; };
  const originalView = App.showView.bind(App);
  App.showView = function(...args) { const result = originalView(...args); if (args[0] !== 'chat') clear(); else schedule(); return result; };
  if (typeof GameState.applyUpdate === 'function') {
    const originalUpdate = GameState.applyUpdate;
    GameState.applyUpdate = function(...args) { const result = originalUpdate.apply(this, args); queueMicrotask(sendState); return result; };
  }
  const aside = document.querySelector('#chat-view aside');
  if (aside) new MutationObserver(attachControl).observe(aside, { childList: true });
  new MutationObserver(() => { if (!active) schedule(); }).observe(stream, { childList: true });
  document.addEventListener('change', event => {
    if (event.target?.closest?.('#bao-author-regex-panel') && event.target !== control) schedule();
  });
  window.addEventListener('storage', event => {
    if (event.key?.startsWith(PREFIX) || event.key?.startsWith(DOCK_PREFIX)) schedule();
  });
  window.BAOAuthorDock = Object.freeze({ enabled, refresh: schedule, snapshot });
  schedule();
})();