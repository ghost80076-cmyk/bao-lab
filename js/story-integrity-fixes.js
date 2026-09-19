/* Preserve story event integrity and session-only API keys without changing the chat layout. */
(() => {
  'use strict';
  if (window.BAOStoryIntegrity || !window.App || !window.GameState || !window.Storage) return;
  const synthetic = text => /^玩家與 .+ 完成一輪互動。?$/.test(String(text || '').trim());
  const cleanText = value => String(value || '').replace(/\s+/g, ' ').trim();
  const hash = text => { let h = 2166136261; for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619); return (h >>> 0).toString(36); };
  const turnNumber = () => (window.Chat?.messages || []).filter(message => message.role === 'user').length;
  const normalizeEvents = state => {
    if (!state) return [];
    const seen = new Set(), out = [];
    (Array.isArray(state.events) ? state.events : []).forEach((item, index) => {
      const text = cleanText(typeof item === 'string' ? item : item?.text);
      if (!text || synthetic(text) || text === '故事剛剛開始。' || seen.has(text)) return;
      seen.add(text);
      const row = item && typeof item === 'object' ? item : {};
      out.push({ id: typeof row.id === 'string' && row.id ? row.id : `legacy-${hash(text)}-${index}`, text,
        turn: Number.isInteger(row.turn) && row.turn >= 0 ? row.turn : null,
        createdAt: typeof row.createdAt === 'string' ? row.createdAt : null,
        source: typeof row.source === 'string' ? row.source : 'legacy' });
    });
    state.events = out.slice(0, 100);
    return state.events;
  };
  const record = (text, source = 'state-model') => {
    const state = GameState.current, value = cleanText(text);
    if (!state || !value || synthetic(value) || value === '故事剛剛開始。') return false;
    const existing = normalizeEvents(state);
    if (existing.some(event => event.text === value)) return false;
    const turn = turnNumber();
    existing.unshift({ id: `event-${turn}-${hash(value)}-${Date.now().toString(36)}`, text: value,
      turn, createdAt: new Date().toISOString(), source });
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
      const item = document.createElement('li'), text = document.createElement('span');
      text.textContent = event.text; item.appendChild(text);
      if (event.turn !== null) {
        const note = document.createElement('small'); note.textContent = `第 ${event.turn} 輪`;
        item.appendChild(note);
      }
      list.appendChild(item);
    });
    ui.appendChild(list);
  };

  // Keep the existing mobile keyboard behaviour, not a new scroll container.
  const input = document.getElementById('user-input');
  const isMobile = () => Boolean(navigator.userAgentData?.mobile) ||
    (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) && matchMedia('(max-width: 1024px)').matches) ||
    matchMedia('(max-width: 820px) and (pointer: coarse)').matches;
  input?.addEventListener('keydown', event => {
    if (event.key === 'Enter' && (event.isComposing || event.keyCode === 229 || isMobile())) event.stopImmediatePropagation();
  }, true);
  if (!document.getElementById('bao-story-integrity-styles')) {
    const style = document.createElement('style'); style.id = 'bao-story-integrity-styles';
    style.textContent = `
      .bao-story-event-list{margin:0;padding:0 0 0 22px;display:grid;gap:10px}
      .bao-story-event-list li{line-height:1.65;overflow-wrap:anywhere}
      .bao-story-event-list small{display:block;color:var(--story-muted,#a4abb8);font-size:11px}
      #chat-view .ui-tabs #bao-chat-top{flex:0 0 auto;width:auto;white-space:nowrap;cursor:pointer}
      #chat-view .ui-tabs{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
      #chat-view .ui-tabs #bao-chat-top:focus-visible{outline:2px solid var(--bao-cyan,#5dd6c0);outline-offset:2px}
      /* Undo the original clipping as well as the removed 100dvh override.
         Mobile keeps the whole-document reading flow; desktop retains its own styles. */
      @media(max-width:820px){
        #chat-view .chat-layout{height:auto!important;max-height:none!important;overflow:visible!important}
        #chat-view .chat-main{height:auto!important;max-height:none!important;overflow:visible!important}
        #chat-view .chat-stream{flex:0 0 auto!important;height:auto!important;max-height:none!important;overflow:visible!important}
      }`;
    document.head.appendChild(style);
  }
  const scrollToStart = () => {
    const stream = document.getElementById('chat-stream');
    if (!stream) return;
    // Desktop may have its original own scrollbar; mobile keeps document scrolling.
    if (stream.scrollTop) stream.scrollTop = 0;
    const header = document.querySelector('.topbar');
    const offset = header ? header.getBoundingClientRect().height : 0;
    window.scrollTo(0, Math.max(0, window.scrollY + stream.getBoundingClientRect().top - offset - 8));
  };
  const ensureTop = () => {
    const tabs = document.querySelector('#chat-view #game-ui .ui-tabs');
    if (!tabs || tabs.querySelector('#bao-chat-top')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.id = 'bao-chat-top'; button.className = 'ui-tab';
    button.textContent = '↑ 置頂'; button.setAttribute('aria-label', '跳到目前對話開頭');
    button.addEventListener('click', scrollToStart);
    const memory = tabs.querySelector('[data-panel="memory"]');
    (memory || tabs.lastElementChild)?.insertAdjacentElement('afterend', button);
    if (!button.isConnected) tabs.append(button);
  };
  ensureTop();
  // Some rendering modes rebuild the tabs; only reattach the button, never resize the story.
  const topObserver = new MutationObserver(ensureTop);
  const gameUI = document.getElementById('game-ui');
  if (gameUI) topObserver.observe(gameUI, { childList: true, subtree: true });

  // Restore helper route metadata from the story. Credentials remain in this page only.
  const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');
  const sameEndpoint = (a, b) => normalizeUrl(a?.baseUrl) === normalizeUrl(b?.baseUrl) &&
    String(a?.protocol || 'openai') === String(b?.protocol || 'openai');
  const helperConfig = kind => kind === 'state' ? App.config?.cost?.stateApi : App.config?.memory?.summaryApi;
  const helperModel = kind => kind === 'state' ? App.config?.cost?.stateModel : App.config?.memory?.summaryModel;
  const helperSection = kind => kind === 'state' ? 'cost' : 'memory';
  const helperModeName = kind => kind === 'state' ? 'stateApiMode' : 'summaryApiMode';
  const helperRouteName = kind => kind === 'state' ? 'stateApi' : 'summaryApi';
  const helperModelName = kind => kind === 'state' ? 'stateModel' : 'summaryModel';
  const restoreMode = (kind, route) => {
    const saved = App.config?.[helperSection(kind)]?.[helperModeName(kind)];
    if (saved === 'same' || saved === 'separate') return saved;
    return route?.model && route?.baseUrl && !sameEndpoint(route, App.config?.api) ? 'separate' :
      route?.model && route?.baseUrl && route?.key && route.key !== App.config?.api?.key ? 'separate' : 'same';
  };
  const setHelper = (kind, mode, route, model) => {
    const section = App.config[helperSection(kind)] ||= {};
    section[helperModeName(kind)] = mode;
    section[helperRouteName(kind)] = mode === 'separate' ? route : null;
    section[helperModelName(kind)] = model || App.config.api?.model || '';
  };
  const validUrl = url => /^https:\/\/[^\s]+$/i.test(url) || /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(url);
  const attachHelperControls = dialog => {
    const form = dialog.querySelector('#bao-chat-api-form');
    if (!form || form.dataset.helperReconnect) return;
    form.dataset.helperReconnect = 'true';
    const section = document.createElement('section');
    section.className = 'bao-helper-reconnect';
    const heading = document.createElement('h3'); heading.textContent = '輔助 API 重新連接';
    const explanation = document.createElement('p'); explanation.className = 'note';
    explanation.textContent = '模型、網址與格式已從故事恢復；只需重新填入尚未連接的 Key。沿用主 API 不需額外 Key。';
    section.append(heading, explanation);
    const controls = {};
    for (const [kind, title] of [['state', 'NPC／事件／狀態整理'], ['memory', '長期記憶摘要']]) {
      const route = helperConfig(kind) || {};
      const box = document.createElement('fieldset');
      box.style.cssText = 'border:1px solid #555c73;border-radius:10px;margin:10px 0;padding:10px;display:grid;gap:8px';
      const legend = document.createElement('legend'); legend.textContent = title; box.append(legend);
      const choice = document.createElement('select'); choice.setAttribute('aria-label', `${title} API 模式`);
      [['same', '沿用主 API'], ['separate', '使用獨立 API']].forEach(([value, text]) => {
        const option = document.createElement('option'); option.value = value; option.textContent = text; choice.append(option);
      });
      choice.value = restoreMode(kind, route);
      const summary = document.createElement('p'); summary.className = 'note';
      const advanced = document.createElement('div'); advanced.style.cssText = 'display:grid;gap:8px';
      const fields = {};
      for (const [key, label, type] of [['model', 'Model ID', 'text'], ['baseUrl', 'Base URL', 'url'], ['key', '獨立 API Key', 'password']]) {
        const labelNode = document.createElement('label'); labelNode.textContent = label;
        const field = document.createElement('input'); field.type = type; field.autocomplete = 'off';
        field.value = key === 'key' ? '' : String(route[key] || (key === 'model' ? helperModel(kind) || App.config?.api?.model : App.config?.api?.baseUrl) || '');
        if (key === 'key') field.placeholder = route.key ? '留空沿用本頁已連接的 Key' : '只有獨立服務需要輸入';
        labelNode.append(field); advanced.append(labelNode); fields[key] = field;
      }
      const protocolLabel = document.createElement('label'); protocolLabel.textContent = '相容格式';
      const protocol = document.createElement('select');
      ['openai', 'anthropic', 'gemini'].forEach(value => {
        const option = document.createElement('option'); option.value = value; option.textContent = value; protocol.append(option);
      });
      protocol.value = route.protocol || App.config?.api?.protocol || 'openai';
      protocolLabel.append(protocol); advanced.append(protocolLabel);
      const toggle = () => {
        advanced.hidden = choice.value !== 'separate';
        const model = fields.model.value.trim() || helperModel(kind) || App.config?.api?.model || '未設定';
        summary.textContent = choice.value === 'same' ? `沿用主連線 · 模型：${model}` :
          `已恢復：${model} · ${fields.baseUrl.value.trim() || '網址未設定'}`;
      };
      choice.addEventListener('change', toggle);
      fields.model.addEventListener('input', toggle);
      fields.baseUrl.addEventListener('input', toggle);
      box.append(choice, summary, advanced); section.append(box);
      controls[kind] = { choice, fields, protocol, prior: route, model: helperModel(kind) };
      toggle();
    }
    (form.querySelector('footer') || form.lastElementChild)?.before(section);
    const error = form.querySelector('.bao-chat-api-error');
    form.addEventListener('submit', event => {
      const mainFields = form.elements;
      const nextMain = { model: mainFields.namedItem('model').value.trim(),
        baseUrl: mainFields.namedItem('baseUrl').value.trim(), protocol: mainFields.namedItem('protocol').value,
        key: mainFields.namedItem('key').value.trim() || (sameEndpoint(App.config?.api, {
          baseUrl: mainFields.namedItem('baseUrl').value.trim(), protocol: mainFields.namedItem('protocol').value
        }) ? App.config?.api?.key || '' : '') };
      const proposed = {};
      try {
        for (const [kind, control] of Object.entries(controls)) {
          const mode = control.choice.value;
          if (mode === 'same') {
            proposed[kind] = { mode, route: null, model: control.model || control.prior?.model || nextMain.model };
            continue;
          }
          const candidate = { ...control.prior, model: control.fields.model.value.trim(),
            baseUrl: control.fields.baseUrl.value.trim(), protocol: control.protocol.value };
          if (!candidate.model || !validUrl(candidate.baseUrl)) {
            throw new Error(`${kind === 'state' ? '狀態' : '記憶'}模型缺少 Model ID 或有效的 Base URL。`);
          }
          const ownKey = control.fields.key.value.trim();
          const oldKey = sameEndpoint(candidate, control.prior) ? control.prior?.key || '' : '';
          const shared = sameEndpoint(candidate, nextMain);
          candidate.key = ownKey || oldKey || (shared ? nextMain.key : '');
          if (!candidate.key) throw new Error(`請重新輸入獨立${kind === 'state' ? '狀態' : '記憶'} API Key。`);
          proposed[kind] = { mode, route: candidate, model: candidate.model };
        }
      } catch (cause) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (error) error.textContent = cause.message;
        return;
      }
      // The original form validates and saves the main API synchronously.
      // Apply helper routes only if that submit closed the dialog successfully.
      const owner = GameState.current;
      setTimeout(() => {
        if (document.getElementById('bao-chat-api-backdrop') === dialog || GameState.current !== owner || !App.config?.api?.key) return;
        for (const [kind, item] of Object.entries(proposed)) setHelper(kind, item.mode, item.route, item.model);
        owner.config = App.config;
        App.saveStory?.(false);
        window.BAOChatAPISettings?.refresh?.();
      }, 0);
    }, true);
  };
  const dialogObserver = new MutationObserver(() => {
    const dialog = document.getElementById('bao-chat-api-backdrop');
    if (dialog) attachHelperControls(dialog);
  });
  dialogObserver.observe(document.body, { childList: true });
  attachHelperControls(document.getElementById('bao-chat-api-backdrop') || document.createElement('div'));
  window.BAOStoryIntegrity = { normalizeEvents, record, attachHelperControls, scrollToStart, ensureTop };
})();