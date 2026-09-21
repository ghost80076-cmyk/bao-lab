/* Opt-in author UI in the chat stream. The story text, prompts and model calls stay untouched. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  if (!Core || !window.App || !window.Chat) return;
  const PREFIX = 'bao-lab:author-regex:v1:';
  const CORE_URL = new URL('author-regex-core.js', document.currentScript?.src || location.href).href;
  const stream = document.getElementById('chat-stream');
  if (!stream) return;
  let active = null, queued = false, sequence = 0, lastDraftAt = 0;
  const cardId = () => String(App.activeCharacter?.id || '').slice(0, 80);
  const config = id => {
    try {
      const raw = JSON.parse(localStorage.getItem(PREFIX + encodeURIComponent(id)) || 'null');
      return raw && raw.enabled === true && Array.isArray(raw.rules) ? raw : null;
    } catch (_) { return null; }
  };
  const clear = () => {
    sequence++;
    if (!active) return;
    if (active.bubble?.isConnected) active.bubble.hidden = false;
    active.root.remove();
    active = null;
  };
  const stateSnapshot = () => {
    const state = window.GameState?.current || {};
    const characterStatuses = {};
    for (const [name, fields] of Object.entries(state.characterStatuses || {}).slice(0, 12)) {
      if (!fields || typeof fields !== 'object') continue;
      const safeName = String(name).slice(0, 80);
      characterStatuses[safeName] = {};
      for (const [key, value] of Object.entries(fields).slice(0, 30)) {
        if (['string', 'number', 'boolean'].includes(typeof value))
          characterStatuses[safeName][String(key).slice(0, 80)] = String(value).slice(0, 180);
      }
    }
    return { time: String(state.time || '').slice(0, 120), location: String(state.location || '').slice(0, 120),
      character: String(App.activeCharacter?.name || '').slice(0, 80), characterStatuses };
  };
  const sendState = () => {
    if (!active?.ready || cardId() !== active.owner || !active.frame.isConnected) return;
    active.frame.contentWindow?.postMessage({ baoAuthor: 'v1', token: active.token,
      type: 'state', value: stateSnapshot() }, '*'); // Opaque sandbox origin; window + nonce are checked on receive.
  };
  window.addEventListener('message', event => {
    if (!active || event.source !== active.frame.contentWindow || event.origin !== 'null'
      || cardId() !== active.owner || event.data?.baoAuthor !== 'v1'
      || event.data.token !== active.token) return;
    if (event.data.type === 'ready') {
      active.ready = true;
      if (!active.rawOpen) active.bubble.hidden = true;
      sendState();
      return;
    }
    if (event.data.type !== 'draft' || typeof event.data.value !== 'string'
      || !event.data.value.trim() || event.data.value.length > 500) return;
    if (Date.now() - lastDraftAt < 500) return;
    lastDraftAt = Date.now();
    const input = document.getElementById('user-input');
    if (!input || !document.getElementById('chat-view')?.classList.contains('active')) return;
    if (input.value.trim() && !confirm('要用作者介面的選項取代目前尚未送出的文字嗎？')) return;
    input.value = event.data.value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus(); // The player, never the authored iframe, chooses when to send an API request.
  });
  const renderInWorker = (text, rules, allowScripts) => new Promise((resolve, reject) => {
    const workerCode = `importScripts(${JSON.stringify(CORE_URL)});onmessage=e=>{try{postMessage({value:self.BAOAuthorRegexCore.render(e.data.text,e.data.rules,e.data.allowScripts)});}catch(err){postMessage({error:String(err.message||err)});}}`;
    const url = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    let worker;
    try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); reject(error); return; }
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      worker.terminate(); URL.revokeObjectURL(url);
      if (error) reject(error); else resolve(value);
    };
    const timeout = setTimeout(() => finish(new Error('作者正則處理超時；原文已保留')), 2000);
    worker.onmessage = e => e.data?.error ? finish(new Error(e.data.error)) : finish(null, e.data?.value);
    worker.onerror = () => finish(new Error('作者正則無法執行；原文已保留'));
    worker.postMessage({ text, rules, allowScripts });
  });
  function target() {
    if (!document.getElementById('chat-view')?.classList.contains('active')) return null;
    const records = Chat.messages;
    const nodes = [...stream.children].filter(node => node.classList?.contains('message'));
    if (!Array.isArray(records) || !nodes.length) return null;
    if (!records.length) return nodes.length === 1 && nodes[0].classList.contains('assistant')
      ? { node: nodes[0], source: String(App.activeCharacter?.greeting || ''), id: 'greeting' } : null;
    const shift = nodes.length === records.length + 1 && nodes[0].classList.contains('assistant') ? 1 : 0;
    if (nodes.length !== records.length + shift || !records.every((m, i) =>
      nodes[i + shift].classList.contains(m.role === 'user' ? 'user' : 'assistant'))) return null;
    for (let index = records.length - 1; index >= 0; index--) {
      if (records[index].role !== 'assistant') continue;
      const node = nodes[index + shift];
      if (node.classList.contains('is-streaming')) return null;
      return { node, source: String(records[index].content || ''), id: String(records[index].id || index) };
    }
    return shift ? { node: nodes[0], source: String(App.activeCharacter?.greeting || ''), id: 'greeting' } : null;
  }
  function mount(candidate, result, owner, fingerprint) {
    clear();
    const bubble = candidate.node.querySelector(':scope > .bubble');
    if (!bubble || !candidate.node.isConnected) return;
    const token = crypto.randomUUID?.() || `${Math.random()}-${Date.now()}`;
    const root = document.createElement('section');
    root.className = 'bao-author-inline';
    root.style.cssText = 'width:min(100%,860px);margin:10px 0 18px;border:1px solid #826589;border-radius:12px;overflow:hidden;background:#171723;color:#fff';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:8px 12px;font-size:12px';
    const title = document.createElement('span'); title.textContent = `作者介面 · ${result.name || '正則排版'}`;
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '查看原文';
    toggle.style.cssText = 'padding:5px 9px;max-width:100%;width:auto;background:#392d47;color:white;border:1px solid #987a9c;border-radius:7px';
    toggle.addEventListener('click', () => {
      if (!active || active.root !== root) return;
      active.rawOpen = !active.rawOpen;
      bubble.hidden = !active.rawOpen;
      toggle.textContent = active.rawOpen ? '顯示作者介面' : '查看原文';
      frame.hidden = active.rawOpen;
    });
    bar.append(title, toggle);
    const frame = document.createElement('iframe');
    frame.title = '聊天內作者隔離介面'; frame.referrerPolicy = 'no-referrer';
    frame.setAttribute('sandbox', 'allow-scripts'); // Never grant allow-same-origin.
    frame.style.cssText = 'display:block;width:100%;height:clamp(320px,68vh,720px);border:0;background:#fff';
    const bootstrap = `<script>(function(){'use strict';const token=${JSON.stringify(token)};let state={};window.BAOAuthor=Object.freeze({draft:function(value){if(typeof value==='string'&&value.length<=500)parent.postMessage({baoAuthor:'v1',token:token,type:'draft',value:value},'*');},getState:function(){return state;}});window.addEventListener('message',function(e){if(e.source!==parent||e.data?.baoAuthor!=='v1'||e.data.token!==token||e.data.type!=='state')return;state=e.data.value||{};window.dispatchEvent(new CustomEvent('bao:statechange',{detail:state}));});parent.postMessage({baoAuthor:'v1',token:token,type:'ready'},'*');})();</script>`;
    const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src https: data:; font-src https: data:; media-src https: data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
    frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + csp + '"><style>html,body{margin:0;min-height:100%;overflow-wrap:anywhere}*,*:before,*:after{box-sizing:border-box}</style>' + bootstrap + '</head><body>' + result.html + '</body></html>';
    root.append(bar, frame); candidate.node.append(root);
    active = { owner, fingerprint, root, frame, bubble, token, ready: false, rawOpen: false };
  }
  async function refresh() {
    queued = false;
    const owner = cardId();
    const data = owner && config(owner);
    if (!owner || !data || !data.rules.length) { clear(); return; }
    const candidate = target();
    if (!candidate?.source) return; // Ignore an intermediate streaming DOM, without unmounting the old UI.
    const bubble = candidate.node.querySelector(':scope > .bubble');
    if (!bubble || bubble.querySelector('.story-inline-editor')) return;
    const fingerprint = JSON.stringify([owner, candidate.id, candidate.source, data.allowScripts, data.rules]);
    if (active?.fingerprint === fingerprint && active.root.parentElement === candidate.node) return;
    const ticket = ++sequence;
    try {
      const value = await renderInWorker(candidate.source, Core.normalize(data.rules), data.allowScripts === true);
      if (ticket !== sequence || cardId() !== owner || !candidate.node.isConnected) return;
      if (!value?.matched || !value.rich) { clear(); return; }
      mount(candidate, value, owner, fingerprint);
    } catch (error) {
      if (ticket !== sequence) return;
      clear();
      console.warn('BAO/LAB author inline regex:', error.message);
    }
  }
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(refresh); } };
  const showView = App.showView.bind(App);
  App.showView = function(...args) { const value = showView(...args); if (args[0] !== 'chat') clear(); else schedule(); return value; };
  const renderShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { clear(); const value = renderShell(...args); schedule(); return value; };
  if (window.GameState?.applyUpdate) {
    const original = GameState.applyUpdate;
    GameState.applyUpdate = function(...args) { const value = original.apply(this, args); queueMicrotask(sendState); return value; };
  }
  new MutationObserver(schedule).observe(stream, { childList: true });
  document.addEventListener('change', event => {
    if (event.target?.closest?.('#bao-author-regex-panel')) setTimeout(schedule, 250);
  });
  window.addEventListener('storage', event => { if (event.key?.startsWith(PREFIX)) schedule(); });
  window.BAOAuthorInline = { refresh: schedule };
  schedule();
})();