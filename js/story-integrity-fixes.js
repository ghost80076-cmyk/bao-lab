/* Story-local repairs: never persist API credentials or infer fictional facts from prose. */
(() => {
  'use strict';
  if (window.BAOStoryIntegrity || !window.App || !window.GameState || !window.Storage) return;
  const synthetic = text => /^玩家與 .+ 完成一輪互動。?$/.test(String(text || '').trim());
  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const hash = text => { let h = 2166136261; for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
  const turnNumber = () => (window.Chat?.messages || []).filter(message => message.role === 'user').length;
  const normalizeEvents = state => {
    if (!state) return [];
    const seen = new Set();
    const out = [];
    (Array.isArray(state.events) ? state.events : []).forEach((item, index) => {
      const text = cleanText(typeof item === 'string' ? item : item?.text);
      if (!text || synthetic(text) || text === '故事剛剛開始。' || seen.has(text)) return;
      seen.add(text);
      const row = typeof item === 'object' && item !== null ? item : {};
      out.push({ id: typeof row.id === 'string' && row.id ? row.id : `legacy-${hash(text)}-${index}`, text,
        turn: Number.isInteger(row.turn) && row.turn >= 0 ? row.turn : null,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
        source: typeof row.source === 'string' ? row.source : 'legacy' });
    });
    state.events = out.slice(0, 100);
    return state.events;
  };
  const record = (text, source = 'state-model') => {
    const state = GameState.current;
    const value = cleanText(text);
    if (!state || !value || synthetic(value) || value === '故事剛剛開始。') return false;
    const existing = normalizeEvents(state);
    // The state model may repeat the same event when processing overlapping turn batches.
    if (existing.some(event => event.text === value)) return false;
    const turn = turnNumber();
    const createdAt = new Date().toISOString();
    existing.unshift({ id: `event-${turn}-${hash(value)}-${Date.now().toString(36)}`, text: value,
      turn, createdAt, source });
    state.events = existing.slice(0, 100);
    return true;
  };
  const previousCreate = GameState.create.bind(GameState);
  GameState.create = function(...args) { const result = previousCreate(...args); normalizeEvents(this.current); return result; };
  const previousAdd = GameState.addEvent.bind(GameState);
  GameState.addEvent = function(value) { if (synthetic(value)) return; if (typeof value === 'string') return record(value, 'legacy'); return previousAdd(value); };
  const previousApply = GameState.applyUpdate.bind(GameState);
  GameState.applyUpdate = function(update = {}) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) return;
    // Existing wrappers update NPCs, character statuses and world modules.
    // Suppress the old events handler so it cannot reverse or duplicate history.
    const events = Array.isArray(update.new_events) ? update.new_events : update.events;
    previousApply({ ...update, events: [] });
    if (Array.isArray(events)) events.slice(0, 12).forEach(text => record(text));
  };
  const previousRestore = Storage.restoreStory.bind(Storage);
  Storage.restoreStory = function(...args) { const result = previousRestore(...args); if (result) normalizeEvents(GameState.current); return result; };
  const previousPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    if (panel !== 'events') return previousPanel(panel);
    const ui = document.getElementById('ui-panel');
    if (!ui || !GameState.current) return;
    const events = normalizeEvents(GameState.current);
    ui.replaceChildren();
    if (!events.length) { ui.textContent = '尚無已確認的劇情事件。'; return; }
    const list = document.createElement('ol');
    list.className = 'bao-story-event-list';
    events.forEach(event => {
      const item = document.createElement('li');
      const text = document.createElement('span'); text.textContent = event.text; item.appendChild(text);
      if (event.turn !== null) { const note = document.createElement('small'); note.textContent = `第 ${event.turn} 輪`; item.appendChild(note); }
      list.appendChild(item);
    });
    ui.appendChild(list);
  };
  const input = document.getElementById('user-input');
  const isMobile = () => Boolean(navigator.userAgentData?.mobile) ||
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && matchMedia('(max-width: 1024px)').matches) ||
    matchMedia('(max-width: 820px) and (pointer: coarse)').matches;
  // Capture ahead of the original app.js keydown listener, without blocking the native newline.
  input?.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    if (event.isComposing || event.keyCode === 229 || isMobile()) event.stopImmediatePropagation();
  }, true);
  if (!document.getElementById('bao-story-integrity-styles')) {
    const style = document.createElement('style'); style.id = 'bao-story-integrity-styles';
    style.textContent = `
      .bao-story-event-list{margin:0;padding:0 0 0 22px;display:grid;gap:10px}
      .bao-story-event-list li{line-height:1.65;overflow-wrap:anywhere}
      .bao-story-event-list small{display:block;color:var(--story-muted,#a4abb8);font-size:11px}
      /* Keep controls in the layout after the scroll pane. Zero-height/absolute
         positioning put them beneath the fixed mobile top bar. */
      .bao-chat-jump{position:static;display:flex;justify-content:flex-end;align-items:center;gap:6px;padding:6px 12px;z-index:4}
      .bao-chat-jump button{width:auto;border-radius:10px;border:1px solid #50556b;background:#191d28;color:#f1eee8;padding:6px 9px;font-size:12px}
      .bao-chat-jump button[hidden]{display:none}
      @media(max-width:820px){
        #chat-view.active{padding-bottom:8px}
        #chat-view.active .chat-layout{height:calc(100dvh - 100px);min-height:0!important;overflow:hidden}
        #chat-view .chat-main{display:flex;flex-direction:column;height:100%;min-height:0;overflow:hidden}
        #chat-view .chat-stream{flex:1 1 auto;min-height:0!important;max-height:none!important;overflow-y:auto!important;overscroll-behavior-y:contain}
        #chat-view #game-ui{flex:0 0 auto;max-height:26dvh;overflow-y:auto}
        #chat-view .composer,#chat-view .story-mobile-tools{flex-shrink:0}
      }`;
    document.head.appendChild(style);
  }
  const stream = document.getElementById('chat-stream');
  const main = document.querySelector('#chat-view .chat-main');
  if (stream && main && !document.getElementById('bao-chat-jump')) {
    const controls = document.createElement('div'); controls.id = 'bao-chat-jump'; controls.className = 'bao-chat-jump';
    const top = document.createElement('button'); top.type = 'button'; top.textContent = '回到開頭';
    const latest = document.createElement('button'); latest.type = 'button'; latest.textContent = '回到最新';
    top.onclick = () => stream.scrollTo({ top: 0, behavior: 'smooth' });
    latest.onclick = () => stream.scrollTo({ top: stream.scrollHeight, behavior: 'smooth' });
    controls.append(top, latest);
    const host = document.createElement('div'); host.style.position = 'relative'; host.style.flex = '0 0 auto';
    host.style.height = 'auto'; host.style.width = '100%'; host.appendChild(controls); stream.after(host);
    const refresh = () => { latest.hidden = stream.scrollHeight - stream.scrollTop - stream.clientHeight < 160; top.hidden = stream.scrollTop < 160; };
    stream.addEventListener('scroll', refresh, { passive: true });
    new MutationObserver(refresh).observe(stream, { childList: true, subtree: false });
    refresh();
    const previousSend = App.sendMessage.bind(App);
    App.sendMessage = async function(...args) {
      const keepPosition = stream.scrollHeight - stream.scrollTop - stream.clientHeight > 120;
      let target = stream.scrollTop;
      let userMoved = false;
      const onScroll = event => { if (event.isTrusted) { userMoved = true; target = stream.scrollTop; } };
      if (keepPosition) stream.addEventListener('scroll', onScroll, { passive: true });
      const restore = () => { if (keepPosition && stream.scrollHeight - stream.clientHeight > 0 &&
        (!userMoved || stream.scrollHeight - stream.scrollTop - stream.clientHeight > 120)) stream.scrollTop = target; };
      try { const result = await previousSend(...args); restore(); return result; }
      finally { restore(); if (keepPosition) stream.removeEventListener('scroll', onScroll); refresh(); }
    };
  }
  // The API dialog's main key and the two helper keys are session-only.
  // Add reconnection choices directly to the existing story API dialog.
  const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');
  const sameEndpoint = (a, b) => normalizeUrl(a?.baseUrl) === normalizeUrl(b?.baseUrl) &&
    String(a?.protocol || 'openai') === String(b?.protocol || 'openai');
  const helperConfig = kind => kind === 'state' ? App.config?.cost?.stateApi : App.config?.memory?.summaryApi;
  const setHelper = (kind, route) => {
    App.config[kind === 'state' ? 'cost' : 'memory'] ||= {};
    App.config[kind === 'state' ? 'cost' : 'memory'][kind === 'state' ? 'stateApi' : 'summaryApi'] = route;
    App.config[kind === 'state' ? 'cost' : 'memory'][kind === 'state' ? 'stateModel' : 'summaryModel'] = route?.model || '';
  };
  const attachHelperControls = dialog => {
    const form = dialog.querySelector('#bao-chat-api-form');
    if (!form || form.dataset.helperReconnect) return;
    form.dataset.helperReconnect = 'true';
    const section = document.createElement('section'); section.className = 'bao-helper-reconnect';
    section.innerHTML = '<h3>輔助 API 重新連接</h3><p class="note">沿用主連線只需要一把 Key；不同服務商需要各自的 Key。Key 不寫入故事。</p>';
    const controls = {};
    for (const [kind, label] of [['state', 'NPC／事件／狀態整理'], ['memory', '長期記憶摘要']]) {
      const route = helperConfig(kind);
      const box = document.createElement('fieldset'); box.style.cssText = 'border:1px solid #555c73;border-radius:10px;margin:10px 0;padding:10px;display:grid;gap:8px';
      const legend = document.createElement('legend'); legend.textContent = label; box.appendChild(legend);
      const choice = document.createElement('select');
      [['same', '沿用主模型與 API'], ['separate', '獨立模型／API']].forEach(([value, title]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = title; choice.appendChild(option);
      });
      choice.value = route?.model && route?.baseUrl ? 'separate' : 'same';
      box.appendChild(choice);
      const advanced = document.createElement('div'); advanced.style.cssText = 'display:grid;gap:8px';
      const fields = {};
      for (const [key, title, type] of [['model', 'Model ID', 'text'], ['baseUrl', 'API 連線網址', 'url'], ['key', '獨立 API Key（同一服務可留空沿用主 Key）', 'password']]) {
        const labelNode = document.createElement('label'); labelNode.textContent = title;
        const field = document.createElement('input'); field.type = type; field.autocomplete = 'off'; field.value = key === 'key' ? '' : String(route?.[key] || '');
        if (key === 'key') field.placeholder = route?.key ? '留空保留目前已連接的 Key' : '不同服務商請貼上自己的 Key';
        labelNode.appendChild(field); advanced.appendChild(labelNode); fields[key] = field;
      }
      const protocolLabel = document.createElement('label'); protocolLabel.textContent = '相容格式';
      const protocol = document.createElement('select');
      ['openai', 'anthropic', 'gemini'].forEach(value => { const opt = document.createElement('option'); opt.value = value; opt.textContent = value; protocol.appendChild(opt); });
      protocol.value = route?.protocol || 'openai'; protocolLabel.appendChild(protocol); advanced.appendChild(protocolLabel);
      const toggle = () => { advanced.hidden = choice.value !== 'separate'; };
      choice.addEventListener('change', toggle); toggle(); box.appendChild(advanced); section.appendChild(box);
      controls[kind] = { choice, fields, protocol, prior: route };
    }
    form.querySelector('footer')?.before(section);
    const error = form.querySelector('.bao-chat-api-error');
    form.addEventListener('submit', event => {
      const nextMain = { baseUrl: form.elements.namedItem('baseUrl').value.trim(),
        protocol: form.elements.namedItem('protocol').value,
        key: form.elements.namedItem('key').value.trim() ||
          (sameEndpoint(App.config?.api, { baseUrl: form.elements.namedItem('baseUrl').value.trim(), protocol: form.elements.namedItem('protocol').value }) ? App.config?.api?.key : '') };
      const proposed = {};
      try {
        for (const [kind, control] of Object.entries(controls)) {
          if (control.choice.value === 'same') { proposed[kind] = null; continue; }
          const candidate = { model: control.fields.model.value.trim(), baseUrl: control.fields.baseUrl.value.trim(), protocol: control.protocol.value };
          if (!candidate.model || !/^https:\/\/\S+$/i.test(candidate.baseUrl)) throw new Error(`${kind === 'state' ? '狀態' : '記憶'} API 需要有效的 Model ID 和 HTTPS 連線網址。`);
          const ownKey = control.fields.key.value.trim();
          const oldKey = sameEndpoint(candidate, control.prior) ? control.prior?.key || '' : '';
          candidate.key = ownKey || oldKey || (sameEndpoint(candidate, nextMain) ? nextMain.key : '');
          if (!candidate.key) throw new Error(`${kind === 'state' ? '狀態' : '記憶'} API 使用不同服務商，請貼上該服務商的 Key。`);
          if (!sameEndpoint(candidate, nextMain) && nextMain.key && candidate.key === nextMain.key) throw new Error('不同服務商不可自動共用主模型 Key。');
          proposed[kind] = { ...(control.prior || {}), ...candidate };
        }
      } catch (cause) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (error) error.textContent = cause.message;
        return;
      }
      queueMicrotask(() => {
        // The base dialog closes only on successful main API validation.
        if (document.getElementById('bao-chat-api-backdrop') !== dialog) return;
        // It may remain in the DOM on errors; do not mutate story data then.
      });
      setTimeout(() => {
        if (document.getElementById('bao-chat-api-backdrop') === dialog) return;
        if (!GameState.current || !App.config?.api?.key) return;
        setHelper('state', proposed.state); setHelper('memory', proposed.memory);
        GameState.current.config = App.config;
        App.saveStory?.(false);
        window.BAOChatAPISettings?.refresh?.();
      }, 0);
    }, true);
  };
  const observer = new MutationObserver(() => {
    const dialog = document.getElementById('bao-chat-api-backdrop');
    if (dialog) attachHelperControls(dialog);
  });
  observer.observe(document.body, { childList: true });
  attachHelperControls(document.getElementById('bao-chat-api-backdrop') || document.createElement('div'));
  window.BAOStoryIntegrity = { normalizeEvents, record, attachHelperControls };
})();