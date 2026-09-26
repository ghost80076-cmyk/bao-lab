/* Reconnect optional story helpers without ever putting credentials in story saves. */
(() => {
  'use strict';
  if (window.BAOStoryHelperReconnect) return;
  const normalize = value => String(value || '').trim().replace(/\/+$/, '');
  const sameConnection = (a, b) => Boolean(normalize(a?.baseUrl) && normalize(b?.baseUrl)) &&
    normalize(a.baseUrl) === normalize(b.baseUrl) &&
    String(a.protocol || 'openai') === String(b.protocol || 'openai');
  const getRoute = (config, kind) => kind === 'state' ? config?.cost?.stateApi : config?.memory?.summaryApi;
  const isSeparate = route => Boolean(route?.model && route?.baseUrl);
  const snapshot = config => ({
    main: config?.api || {}, state: getRoute(config, 'state'), memory: getRoute(config, 'memory')
  });
  const reconcile = (previous, config) => {
    for (const kind of ['state', 'memory']) {
      const route = getRoute(config, kind);
      if (!isSeparate(route)) continue;
      const former = previous[kind];
      // A saved/legacy route's key is never trusted: reuse ONLY the session's old credentials.
      const key = sameConnection(former, route) && former?.key ? String(former.key) :
        sameConnection(previous.main, route) && previous.main?.key ? String(previous.main.key) : '';
      route.key = key;
    }
    return config;
  };
  const missing = config => ['state', 'memory'].some(kind => {
    const route = getRoute(config, kind);
    return isSeparate(route) && !route.key &&
      !(sameConnection(route, config?.api) && config.api?.key);
  });
  let installed = false;
  let attempts = 0;

  function enhance() {
    const backdrop = document.getElementById('bao-chat-api-backdrop');
    const form = backdrop?.querySelector('form');
    if (!form || form.querySelector('.bao-helper-reconnect')) return;
    const container = document.createElement('div');
    container.className = 'bao-helper-reconnect';
    container.innerHTML = '<h3>記憶與狀態模型重連</h3><p>模型名稱與網址取自故事存檔；API Key 不在存檔裡。獨立服務的 Key 請在這裡重新輸入。測試連線按鈕只測主模型。</p>';
    for (const kind of ['state', 'memory']) {
      const route = getRoute(App.config, kind);
      const separate = isSeparate(route);
      const fieldset = document.createElement('fieldset');
      fieldset.dataset.helperKind = kind;
      fieldset.innerHTML = `<legend>${kind === 'state' ? '狀態模型' : '記憶模型'}</legend>
        <label>連線方式<select data-helper-mode><option value="same">沿用主模型 API</option><option value="separate">獨立 API／模型</option></select></label>
        <div data-helper-details><label>Model ID<input type="text" data-helper-model autocomplete="off"></label>
        <label>API 連線網址<input type="url" data-helper-url autocomplete="off" spellcheck="false"></label>
        <label>相容格式<select data-helper-protocol><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select></label>
        <label>API Key<input type="password" data-helper-key autocomplete="off" spellcheck="false" placeholder="獨立服務請重新輸入 Key"></label></div>
        <small data-helper-note></small>`;
      const find = selector => fieldset.querySelector(selector);
      find('[data-helper-mode]').value = separate ? 'separate' : 'same';
      find('[data-helper-model]').value = route?.model || '';
      find('[data-helper-url]').value = route?.baseUrl || '';
      find('[data-helper-protocol]').value = route?.protocol || 'openai';
      find('[data-helper-note]').textContent = separate
        ? route.key ? '已沿用相同連線在本次頁面的 Key；留空即可保留。' : '請提供此連線的 Key；與主模型同一連線可共用。'
        : `目前沿用主 API${(kind === 'state' ? App.config?.cost?.stateModel : App.config?.memory?.summaryModel) ? ' · 已存模型：' + (kind === 'state' ? App.config.cost.stateModel : App.config.memory.summaryModel) : ''}`;
      const toggle = () => { find('[data-helper-details]').hidden = find('[data-helper-mode]').value !== 'separate'; };
      find('[data-helper-mode]').addEventListener('change', toggle);
      toggle();
      container.append(fieldset);
    }
    form.querySelector('.bao-chat-api-hint')?.before(container);
    if (!container.isConnected) form.insertBefore(container, form.querySelector('.bao-chat-api-error'));
    const err = form.querySelector('.bao-chat-api-error');
    form.addEventListener('submit', event => {
      try {
        const main = {
          model: form.elements.namedItem('model').value.trim(),
          baseUrl: form.elements.namedItem('baseUrl').value.trim(),
          protocol: form.elements.namedItem('protocol').value
        };
        const enteredMainKey = form.elements.namedItem('key').value.trim();
        const mainKey = enteredMainKey || (sameConnection(App.config?.api, main) ? String(App.config.api.key || '') : '');
        const changes = {};
        for (const kind of ['state', 'memory']) {
          const fields = container.querySelector(`[data-helper-kind="${kind}"]`);
          if (fields.querySelector('[data-helper-mode]').value === 'same') {
            changes[kind] = null;
            continue;
          }
          const old = getRoute(App.config, kind);
          const next = {
            ...old,
            model: fields.querySelector('[data-helper-model]').value.trim(),
            baseUrl: fields.querySelector('[data-helper-url]').value.trim(),
            protocol: fields.querySelector('[data-helper-protocol]').value
          };
          if (!next.model || !next.baseUrl) throw new Error(`請填寫${kind === 'state' ? '狀態' : '記憶'}模型 ID 與連線網址。`);
          if (!/^https:\/\/[^\s]+$/i.test(next.baseUrl) &&
              !/^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(next.baseUrl))
            throw new Error('獨立 API 必須使用 HTTPS，或本機 localhost 連線。');
          const typed = fields.querySelector('[data-helper-key]').value.trim();
          next.key = typed || (sameConnection(old, next) ? String(old?.key || '') : '');
          if (!next.key && !sameConnection(next, main)) throw new Error(`請輸入${kind === 'state' ? '狀態' : '記憶'}模型自己的 API Key。`);
          if (!sameConnection(next, main) && mainKey && next.key === mainKey)
            throw new Error('不同 API 連線不能直接沿用主模型 Key；請確認獨立服務的 Key。');
          changes[kind] = next;
        }
        // The existing dialog commits the main connection first. Only apply helpers if it succeeds.
        queueMicrotask(() => {
          if (backdrop.isConnected) return;
          App.config.memory ||= {};
          App.config.cost ||= {};
          const update = (kind, settings, routeName, modelName, modeName) => {
            const route = changes[kind];
            const prior = settings[routeName];
            settings[routeName] = route;
            settings[modeName] = route ? 'separate' : 'same';
            settings[modelName] = route?.model || (prior ? '' : settings[modelName] || '');
          };
          update('state', App.config.cost, 'stateApi', 'stateModel', 'stateApiMode');
          update('memory', App.config.memory, 'summaryApi', 'summaryModel', 'summaryApiMode');
          if (GameState.current) GameState.current.config = App.config;
          App.saveStory?.(false); // Storage.scrubSecrets removes all *.api.key fields.
          window.BAOChatAPISettings?.refresh?.();
        });
      } catch (error) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (err) err.textContent = error.message || '獨立模型設定無效。';
      }
    }, true);
  }

  function install() {
    if (installed) return;
    if (!window.App || !window.Storage || !window.BAOChatAPISettings) {
      if (++attempts < 100) setTimeout(install, 100);
      return;
    }
    installed = true;
    const originalOpen = window.BAOChatAPISettings.open;
    window.BAOChatAPISettings.open = function(...args) {
      const result = originalOpen.apply(this, args);
      enhance();
      return result;
    };
    const originalRestore = Storage.restoreStory;
    Storage.restoreStory = function(...args) {
      const before = snapshot(App.config);
      const restored = originalRestore.apply(this, args);
      if (!restored) return restored;
      reconcile(before, App.config);
      if (GameState.current) GameState.current.config = App.config;
      queueMicrotask(() => {
        enhance(); // Original restore() can call its private open() instead of the public wrapper.
        if (missing(App.config) && !document.getElementById('bao-chat-api-backdrop'))
          window.BAOChatAPISettings?.open?.();
      });
      return restored;
    };
    enhance();
  }
  window.BAOStoryHelperReconnect = { sameConnection, reconcile, missing, enhance, install };
  install();
})();
