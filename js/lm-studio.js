(() => {
  'use strict';
  if (window.BAOLMStudio || !window.BAOLMStudioCore || typeof App === 'undefined' || typeof API === 'undefined') return;
  const local = window.BAOLMStudioCore;
  const DEFAULT_URL = 'http://localhost:1234/v1/chat/completions';
  const PRESET = { provider: 'lmstudio', provider_label: 'LM Studio（本地 AI）', label: '選擇本機已載入的模型', protocol: 'openai', base_url: DEFAULT_URL, model: '', route: 'local', cache: 'unknown' };
  const byId = id => document.getElementById(id);
  const normalize = value => String(value || '').trim().replace(/\/+$/, '');
  const isLocal = config => local.isLocal(config);
  const credential = value => String(value || '').trim() || local.NO_AUTH;
  const localConfig = (previous = {}, model, baseUrl, token) => ({
    ...previous, type: 'lmstudio', local: true, route: 'local', protocol: 'openai',
    model: String(model || '').trim(), baseUrl: local.endpoint(baseUrl).chatUrl,
    key: credential(token), cacheMode: 'unknown', explicitCacheModel: ''
  });

  // Keep cloud providers unchanged; local requests never use a cloud relay.
  const upstream = API.send.bind(API);
  API.send = function(config, messages) {
    const helper = config?.__memoryTask ? App.config?.memory?.summaryApi : config?.__stateTask ? App.config?.cost?.stateApi : null;
    if (isLocal(helper)) {
      return local.send({ ...config, ...helper, maxOutputTokens: config.maxOutputTokens, signal: config.signal || API.activeSignal }, messages, API);
    }
    if (isLocal(config)) return local.send(config, messages, API);
    return upstream(config, messages);
  };

  // Existing BYOK UI and request lifecycle expect a truthy key. This in-memory marker
  // is NOT a credential; the local transport never sends it in an Authorization header.
  const originalCollect = App.collectConfig.bind(App);
  App.collectConfig = function(...args) {
    const result = originalCollect(...args);
    const localSelected = byId('api-type')?.value === 'lmstudio';
    if (localSelected) {
      result.api = { ...result.api, type: 'lmstudio', route: 'local', local: true,
        protocol: 'openai', key: credential(byId('api-key')?.value), cacheMode: 'unknown', explicitCacheModel: '' };
    }
    for (const kind of ['memory', 'state']) {
      const selected = byId(`${kind}-preset-select`);
      if (selected?.value === '') continue;
      const preset = App.modelPresets?.[Number(selected?.value)];
      if (preset?.provider !== 'lmstudio') continue;
      const route = kind === 'memory' ? result.memory?.summaryApi : result.cost?.stateApi;
      if (!route) continue;
      route.type = 'lmstudio'; route.route = 'local'; route.local = true;
      route.protocol = 'openai'; route.key = credential(byId(`${kind}-api-key`)?.value);
      route.cacheMode = 'unknown'; route.explicitCacheModel = '';
    }
    return result;
  };

  const originalRestore = Storage.restoreStory.bind(Storage);
  Storage.restoreStory = function(save) {
    const ok = originalRestore(save);
    if (!ok) return ok;
    const config = App.config || {};
    if (isLocal(config.api)) config.api.key = local.NO_AUTH;
    if (isLocal(config.memory?.summaryApi)) config.memory.summaryApi.key = local.NO_AUTH;
    if (isLocal(config.cost?.stateApi)) config.cost.stateApi.key = local.NO_AUTH;
    if (GameState.current) GameState.current.config = config;
    return ok;
  };

  const originalStart = App.startStory.bind(App);
  App.startStory = function(...args) {
    if (byId('api-type')?.value !== 'lmstudio') return originalStart(...args);
    try {
      local.endpoint(byId('base-url')?.value);
      if (!byId('model-id')?.value.trim()) throw new Error('請先按「讀取本機模型」選擇 Model ID，或手動輸入模型 ID。');
    } catch (error) { alert(error.message); this.setStep(4); return false; }
    return originalStart(...args);
  };

  const updateBuilder = () => {
    const selected = byId('api-type')?.value === 'lmstudio';
    const controls = byId('bao-lm-builder');
    if (controls) controls.classList.toggle('hidden', !selected);
    const field = byId('api-key');
    const label = field?.closest('label');
    if (label) {
      if (!label.dataset.baoCloudLabel) label.dataset.baoCloudLabel = label.firstChild?.textContent || 'API Key';
      if (label.firstChild) label.firstChild.textContent = selected ? '本機 API Token（選填）' : label.dataset.baoCloudLabel;
      field.placeholder = selected ? 'LM Studio 預設免填；只有開啟驗證才需要' : '貼上自己的 API Key';
    }
    if (selected) {
      const hint = byId('api-hint');
      if (hint) hint.textContent = '免雲端 API Key。先在 LM Studio 啟動 Server 並開啟 CORS，再讀取本機模型。';
    }
  };

  const fillModels = (select, models, modelField) => {
    select.replaceChildren();
    select.add(new Option('請選擇已載入模型…', ''));
    models.forEach(id => select.add(new Option(id, id)));
    if (models.includes(modelField.value)) select.value = modelField.value;
    else if (models.length === 1) { select.value = models[0]; modelField.value = models[0]; }
    select.onchange = () => { if (select.value) modelField.value = select.value; };
  };

  const getModels = async ({ url, token, select, modelField, status, button }) => {
    button.disabled = true;
    status.textContent = '正在讀取 LM Studio 模型…';
    try {
      const models = await local.listModels({ baseUrl: url.value.trim(), key: credential(token?.value) });
      fillModels(select, models, modelField);
      status.textContent = models.length ? `讀取成功：${models.length} 個模型。請確認 Model ID。` : '已連線，但目前沒有可用模型。請先在 LM Studio 載入模型。';
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  };

  const addPreset = () => {
    if (!Array.isArray(App.modelPresets) || !App.modelPresets.length) return false;
    if (App.modelPresets.some(item => item.provider === 'lmstudio')) return true;
    const oldProvider = byId('api-type')?.value || '';
    const oldPreset = byId('model-select')?.value || '';
    App.modelPresets.push(PRESET);
    App.populateAPIControls();
    if (oldProvider && byId('api-type')?.querySelector(`option[value="${oldProvider}"]`)) {
      byId('api-type').value = oldProvider;
      App.populateModelOptions();
      if (oldPreset && byId('model-select')?.querySelector(`option[value="${oldPreset}"]`)) {
        byId('model-select').value = oldPreset;
        App.syncSelectedPreset();
      }
    }
    updateBuilder();
    return true;
  };

  const installBuilder = () => {
    if (byId('bao-lm-builder')) return;
    const step = document.querySelector('[data-step-panel="4"]');
    if (!step) return;
    const box = document.createElement('section');
    box.id = 'bao-lm-builder'; box.className = 'hidden';
    box.innerHTML = '<div class="bao-lm-heading"><strong>本地 AI · LM Studio</strong><a href="lm-studio-guide.html" target="_blank" rel="noopener">查看連接教學 ↗</a></div><p class="note">在同一台電腦啟動 LM Studio 的 Developer → Start Server，開啟 Enable CORS。模型在你的電腦運行，BAO/LAB 不會自動改用付費雲端 API。</p><div class="bao-lm-controls"><button type="button" class="secondary" id="bao-lm-discover">讀取本機模型</button><select id="bao-lm-models" aria-label="本機模型"><option value="">先按讀取本機模型…</option></select></div><p class="note" id="bao-lm-status" role="status" aria-live="polite"></p>';
    byId('api-key')?.closest('label')?.after(box);
    const select = byId('bao-lm-models');
    byId('bao-lm-discover').onclick = () => getModels({ url: byId('base-url'), token: byId('api-key'), select,
      modelField: byId('model-id'), status: byId('bao-lm-status'), button: byId('bao-lm-discover') });
    byId('api-type')?.addEventListener('change', updateBuilder);
    updateBuilder();
  };

  const updateStatus = () => {
    if (!isLocal(App.config?.api)) return;
    document.querySelectorAll('[data-bao-api-status]').forEach(node => {
      node.textContent = `本地 AI · ${App.config.api.model || '請選擇模型'}`;
      node.dataset.connected = 'true';
    });
  };
  const originalRefresh = window.BAOChatAPISettings?.refresh;
  if (originalRefresh) window.BAOChatAPISettings.refresh = function(...args) {
    const result = originalRefresh(...args); updateStatus(); return result;
  };

  const openLocal = () => {
    if (!App.activeCharacter || !GameState.current) return false;
    byId('bao-lm-dialog')?.remove();
    const prior = App.config?.api || {};
    const root = document.createElement('div');
    root.id = 'bao-lm-dialog';
    root.innerHTML = '<section class="bao-lm-modal" role="dialog" aria-modal="true" aria-labelledby="bao-lm-title"><header><h2 id="bao-lm-title">連接 LM Studio 本地 AI</h2><button type="button" data-close aria-label="關閉">×</button></header><p>在執行模型的電腦啟動 LM Studio Server，並開啟 Enable CORS；不需要雲端 API Key。</p><form id="bao-lm-form" autocomplete="off"><label>本地 API 網址<input name="endpoint" required spellcheck="false"></label><label>本地 API Token（選填）<input name="token" type="password" autocomplete="off" placeholder="LM Studio 預設免填"></label><div class="bao-lm-controls"><button type="button" class="secondary" data-discover>讀取本機模型</button><select name="models" aria-label="本機模型"><option value="">請先讀取模型…</option></select></div><label>Model ID<input name="model" required placeholder="模型 ID，可手動填寫"></label><p data-message role="status" aria-live="polite"></p><footer><button type="button" class="secondary" data-test>測試本地模型</button><button type="submit" class="primary">套用到目前故事</button></footer></form><a href="lm-studio-guide.html" target="_blank" rel="noopener">LM Studio 詳細設定與故障排除 ↗</a></section>';
    document.body.append(root);
    const form = root.querySelector('form');
    const field = name => form.elements.namedItem(name);
    field('endpoint').value = isLocal(prior) ? prior.baseUrl : DEFAULT_URL;
    field('model').value = isLocal(prior) ? prior.model || '' : '';
    const message = root.querySelector('[data-message]');
    const candidate = () => {
      const same = isLocal(prior) && normalize(prior.baseUrl) === normalize(local.endpoint(field('endpoint').value).chatUrl);
      const previousToken = same && prior.key !== local.NO_AUTH ? prior.key : '';
      return localConfig(prior, field('model').value, field('endpoint').value, field('token').value.trim() || previousToken);
    };
    root.querySelector('[data-close]').onclick = () => root.remove();
    root.addEventListener('click', event => { if (event.target === root) root.remove(); });
    root.querySelector('[data-discover]').onclick = () => getModels({ url: field('endpoint'), token: field('token'),
      select: field('models'), modelField: field('model'), status: message, button: root.querySelector('[data-discover]') });
    root.querySelector('[data-test]').onclick = async event => {
      const button = event.currentTarget;
      try {
        const config = candidate();
        if (!config.model) throw new Error('請先選擇本地模型。');
        button.disabled = true; message.textContent = '正在測試本地模型…';
        await API.test(config);
        message.textContent = '本地模型回覆成功。請按「套用到目前故事」。';
      } catch (error) { message.textContent = error.message; }
      finally { button.disabled = false; }
    };
    form.onsubmit = event => {
      event.preventDefault();
      try {
        const next = candidate();
        if (!next.model) throw new Error('請選擇或填入 Model ID。');
        const wasOffline = Boolean(App.config?.offlineWorldPreview);
        App.config.api = next; App.config.demoMode = false; App.config.offlineWorldPreview = false;
        if (GameState.current) GameState.current.config = App.config;
        if (wasOffline) App.renderChatShell(false);
        const model = byId('chat-model'); if (model) model.textContent = next.model;
        const input = byId('user-input'); if (input) input.placeholder = '輸入你的行動或台詞…';
        App.saveStory?.(false); updateStatus(); root.remove(); input?.focus();
      } catch (error) { message.textContent = error.message; }
    };
    field('model').focus();
    return true;
  };

  const installChatButton = () => {
    if (!window.BAOChatAPISettings || !byId('bao-chat-api-toolbar')) return false;
    const toolbar = byId('bao-chat-api-toolbar');
    if (!byId('bao-lm-chat-button')) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = 'bao-lm-chat-button'; button.className = 'secondary';
      button.textContent = '連接本地 AI'; button.onclick = openLocal;
      toolbar.append(button);
    }
    const oldOpen = toolbar.querySelector('[data-bao-api-open]');
    if (oldOpen && !oldOpen.dataset.baoLmPatched) {
      const cloudOpen = oldOpen.onclick;
      oldOpen.onclick = () => { if (isLocal(App.config?.api)) {
        const choice = confirm('目前正在使用本地 AI。要切換到雲端 API 設定嗎？\n按「取消」可保留本地模型。');
        if (!choice) return;
      } cloudOpen?.(); };
      oldOpen.dataset.baoLmPatched = 'true';
    }
    updateStatus();
    return true;
  };

  const init = () => {
    installBuilder();
    if (!addPreset()) setTimeout(() => { if (!addPreset()) setTimeout(addPreset, 450); }, 100);
    const restore = window.BAOChatAPISettings?.restore;
    if (restore && !window.BAOChatAPISettings.__baoLmRestore) {
      App.resumeSavedStory = () => window.BAOChatAPISettings.restore(Storage.loadStory());
      const original = restore.bind(window.BAOChatAPISettings);
      window.BAOChatAPISettings.restore = save => {
        const result = original(save);
        updateStatus(); installChatButton();
        return result;
      };
      window.BAOChatAPISettings.__baoLmRestore = true;
    }
    installChatButton();
    const originalRender = App.renderChatShell.bind(App);
    App.renderChatShell = function(...args) {
      const result = originalRender(...args); installChatButton(); updateStatus(); return result;
    };
  };
  const style = document.createElement('style');
  style.textContent = '#bao-lm-builder{margin:12px 0;padding:12px;border:1px solid #596676;border-radius:12px}#bao-lm-builder .bao-lm-heading{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}#bao-lm-builder a,#bao-lm-dialog a{color:#aad7ff} .bao-lm-controls{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0}.bao-lm-controls select{min-width:130px;flex:1 1 230px;max-width:100%;padding:8px}#bao-lm-chat-button{width:auto;min-height:38px}#bao-lm-dialog{position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;overflow:auto;padding:16px;background:#000b}.bao-lm-modal{box-sizing:border-box;width:min(100%,560px);max-height:calc(100dvh - 30px);overflow:auto;padding:20px;background:#20232d;color:#f4f4fa;border:1px solid #62677a;border-radius:16px}.bao-lm-modal header,.bao-lm-modal footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.bao-lm-modal header h2{margin:0}.bao-lm-modal header button{font-size:27px;color:inherit;border:0;background:none}.bao-lm-modal p{line-height:1.6}.bao-lm-modal form,.bao-lm-modal label{display:grid;gap:8px}.bao-lm-modal input,.bao-lm-modal select{box-sizing:border-box;min-width:0;width:100%;padding:10px;background:#141720;color:#fff;border:1px solid #697086;border-radius:8px}.bao-lm-modal [data-message]{min-height:1.5em;color:#ffd7a0}.bao-lm-modal footer button{flex:1 1 170px}@media(max-width:700px){#bao-lm-chat-button{flex:1 1 auto}}';
  document.head.append(style);
  window.BAOLMStudio = Object.freeze({ open: openLocal, core: local });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
