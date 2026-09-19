/* Fetch selectable model IDs from a player's own provider without storing credentials. */
(() => {
  'use strict';
  if (typeof App === 'undefined' || window.BAOModelDiscovery) return;
  const normalizeUrl = value => String(value || '').trim().replace(/\/+$/, '');
  const protocolName = value => ['openai', 'anthropic', 'gemini'].includes(value) ? value : 'openai';
  const sameConnection = (left, right) => normalizeUrl(left?.baseUrl) === normalizeUrl(right?.baseUrl)
    && protocolName(left?.protocol) === protocolName(right?.protocol);

  function modelsEndpoint(config) {
    const input = normalizeUrl(config?.baseUrl);
    if (!input) throw new Error('請先填入 API 連線網址。');
    let url;
    try { url = new URL(input); } catch { throw new Error('API 連線網址格式不正確。'); }
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
      throw new Error('請使用 HTTPS，或本機 localhost 的 HTTP 連線。');
    }
    if (url.username || url.password || url.search || url.hash) throw new Error('請使用不含帳密或查詢參數的 API 網址。');
    let path = url.pathname.replace(/\/+$/, '');
    const protocol = protocolName(config?.protocol);
    // The chat endpoint differs from the model catalog endpoint; never alter the saved chat URL.
    if (protocol === 'gemini') {
      path = path.replace(/\/models(?:\/[^/]+(?::(?:generateContent|streamGenerateContent))?)?$/i, '');
      if (!/\/(?:v1beta|v1)$/i.test(path)) path += '/v1beta';
    } else {
      path = path.replace(/\/(?:chat\/completions|responses|messages|completions|models)$/i, '');
      if (!/\/(?:v1|v1beta)$/i.test(path)) path += '/v1';
    }
    url.pathname = path + '/models';
    return url.toString();
  }

  const usableId = value => {
    const id = String(value || '').trim();
    return id.length <= 200 && /^[A-Za-z0-9][A-Za-z0-9._/:+@-]*$/.test(id)
      && !/(?:餘額|余额|當前|当前|balance|credit|充值|公告|notice|剩余|剩餘)/i.test(id);
  };

  function normalizeModels(data, protocol = 'openai') {
    const records = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
    const models = new Map();
    records.forEach(item => {
      if (!item || typeof item !== 'object') return;
      if (item.type && item.type !== 'model') return;
      if (protocol === 'gemini' && Array.isArray(item.supportedGenerationMethods)
          && !item.supportedGenerationMethods.includes('generateContent')) return;
      const rawId = typeof item.id === 'string' ? item.id : item.name;
      const id = protocol === 'gemini' ? String(rawId || '').replace(/^models\//, '') : String(rawId || '');
      if (!usableId(id)) return;
      const name = String(item.displayName || item.display_name || item.name || id).trim();
      models.set(id, { id, label: name && name !== id && name.length <= 100 ? `${name} (${id})` : id });
    });
    return [...models.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }

  async function fetchModels(config, fetcher = fetch) {
    const protocol = protocolName(config?.protocol);
    const key = String(config?.key || '').trim();
    if (!key) throw new Error('請先輸入這個連線的 API Key。');
    const url = modelsEndpoint(config);
    const headers = protocol === 'gemini' ? { 'x-goog-api-key': key }
      : protocol === 'anthropic' ? { 'x-api-key': key, 'anthropic-version': '2023-06-01' }
      : { Authorization: `Bearer ${key}` };
    let response;
    try { response = await fetcher(url, { method: 'GET', headers, signal: config?.signal }); }
    catch (error) { throw new Error(`無法拉取模型，可能是網路或供應商的瀏覽器跨網域限制（CORS）。${error?.message ? ' ' + error.message : ''}`); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error('供應商的模型清單不是有效 JSON，請改用手動填寫 Model ID。'); }
    if (!response.ok) {
      const message = String(data?.error?.message || data?.message || '').slice(0, 180);
      throw new Error(`拉取失敗（HTTP ${response.status}）。${message || '請確認 Key、網址或供應商是否支援模型清單。'}`);
    }
    const models = normalizeModels(data, protocol);
    if (!models.length) throw new Error('供應商沒有回傳可辨識的聊天模型；請手動填寫 Model ID。');
    return models;
  }

  function attachPicker({ anchor, getConfig, setModel, controls = [] }) {
    if (!anchor || anchor.dataset.baoModelDiscovery === 'yes') return;
    anchor.dataset.baoModelDiscovery = 'yes';
    const block = document.createElement('div');
    block.className = 'bao-model-discovery';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = '拉取模型';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '選擇拉取到的模型');
    select.hidden = true;
    const status = document.createElement('small');
    status.className = 'note';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = '拉取後可以選擇模型；也可直接手動輸入 Model ID。';
    block.append(button, select, status);
    anchor.insertAdjacentElement('afterend', block);
    const reset = () => {
      select.replaceChildren();
      select.hidden = true;
      status.textContent = '連線設定已更改，請重新拉取；仍可手動輸入 Model ID。';
    };
    controls.forEach(control => control?.addEventListener('change', reset));
    select.addEventListener('change', () => { if (select.value) setModel(select.value); });
    button.addEventListener('click', async () => {
      button.disabled = true;
      select.hidden = true;
      status.textContent = '正在拉取模型清單（不會發送聊天生成請求）…';
      try {
        const config = getConfig();
        const connection = `${protocolName(config.protocol)}|${normalizeUrl(config.baseUrl)}|${config.key}`;
        const models = await fetchModels(config);
        // Ignore stale results if fields changed while the network request was in flight.
        const current = getConfig();
        if (connection !== `${protocolName(current.protocol)}|${normalizeUrl(current.baseUrl)}|${current.key}`) {
          reset();
          return;
        }
        select.replaceChildren(new Option(`已取得 ${models.length} 個模型，請選擇…`, ''));
        models.forEach(model => select.add(new Option(model.label, model.id)));
        select.hidden = false;
        status.textContent = `已取得 ${models.length} 個模型。清單不代表帳號可用或聊天一定相容。`;
      } catch (error) { status.textContent = error.message || '拉取失敗，請手動填寫 Model ID。'; }
      finally { button.disabled = false; }
    });
    return { block, button, select, status, reset };
  }

  function mountBuilder() {
    const modelInput = document.getElementById('model-id');
    const baseUrl = document.getElementById('base-url');
    const key = document.getElementById('api-key');
    const provider = document.getElementById('model-select');
    if (!modelInput || !baseUrl || !key || !provider || modelInput.dataset.baoDiscoveryMounted) return;
    modelInput.dataset.baoDiscoveryMounted = 'yes';
    const protocol = document.createElement('select');
    protocol.id = 'bao-builder-discovery-protocol';
    protocol.innerHTML = '<option value="openai">Chat / OpenAI-compatible</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option>';
    const protocolLabel = document.createElement('label');
    protocolLabel.textContent = 'API 相容格式（自訂連線可切換）';
    protocolLabel.append(protocol);
    baseUrl.closest('label')?.insertAdjacentElement('afterend', protocolLabel);
    const sync = () => { protocol.value = protocolName(App.getSelectedPreset?.()?.protocol); };
    provider.addEventListener('change', sync);
    document.getElementById('api-type')?.addEventListener('change', sync);
    sync();
    // App.collectConfig has further wrappers for memory/state routes; retain them.
    const originalCollect = App.collectConfig.bind(App);
    App.collectConfig = function(...args) {
      const config = originalCollect(...args);
      if (config?.api) config.api.protocol = protocol.value;
      return config;
    };
    attachPicker({
      anchor: modelInput.closest('label'),
      getConfig: () => ({ baseUrl: baseUrl.value, key: key.value, protocol: protocol.value }),
      setModel: id => { modelInput.value = id; modelInput.dispatchEvent(new Event('input', { bubbles: true })); },
      controls: [baseUrl, provider, protocol, key]
    });
  }

  function mountHelper(kind) {
    const modelInput = document.getElementById(`${kind}-model-id`);
    const baseUrl = document.getElementById(`${kind}-base-url`);
    const protocol = document.getElementById(`${kind}-protocol`);
    const key = document.getElementById(`${kind}-api-key`);
    if (!modelInput || !baseUrl || !protocol || !key || modelInput.dataset.baoDiscoveryMounted) return;
    modelInput.dataset.baoDiscoveryMounted = 'yes';
    const preset = document.getElementById(`${kind}-preset-select`);
    attachPicker({
      anchor: modelInput.closest('label'),
      getConfig: () => {
        const candidate = { baseUrl: baseUrl.value, protocol: protocol.value, key: key.value.trim() };
        const main = { baseUrl: document.getElementById('base-url')?.value,
          protocol: document.getElementById('bao-builder-discovery-protocol')?.value,
          key: document.getElementById('api-key')?.value };
        if (!candidate.key && sameConnection(candidate, main)) candidate.key = main.key;
        return candidate;
      },
      setModel: id => { modelInput.value = id; modelInput.dispatchEvent(new Event('input', { bubbles: true })); },
      controls: [baseUrl, protocol, preset, key, document.getElementById('api-key')]
    });
  }

  function mountChat() {
    const form = document.getElementById('bao-chat-api-form');
    if (!form || form.dataset.baoDiscoveryMounted) return;
    form.dataset.baoDiscoveryMounted = 'yes';
    const field = name => form.elements.namedItem(name);
    attachPicker({
      anchor: field('model')?.closest('label'),
      getConfig: () => {
        const candidate = { baseUrl: field('baseUrl').value, protocol: field('protocol').value,
          key: field('key').value.trim() };
        const main = App.config?.api || {};
        if (!candidate.key && sameConnection(candidate, main)) candidate.key = main.key;
        return candidate;
      },
      setModel: id => { field('model').value = id; field('model').dispatchEvent(new Event('input', { bubbles: true })); },
      controls: [field('baseUrl'), field('protocol'), field('preset'), field('key')]
    });
  }

  function mount() {
    mountBuilder();
    mountHelper('memory');
    mountHelper('state');
    mountChat();
  }
  const style = document.createElement('style');
  style.id = 'bao-model-discovery-style';
  style.textContent = '.bao-model-discovery{display:grid;grid-template-columns:minmax(0,1fr);gap:7px;margin:8px 0 13px}.bao-model-discovery button{width:max-content;max-width:100%;min-height:39px}.bao-model-discovery select{width:100%;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #697086;border-radius:8px;background:#141720;color:#fff;font:inherit}.bao-model-discovery small{line-height:1.5;overflow-wrap:anywhere}#bao-builder-discovery-protocol{width:100%;min-width:0}';
  document.head.append(style);
  const watcher = new MutationObserver(() => mount());
  watcher.observe(document.body, { childList: true, subtree: true });
  mount();
  window.BAOModelDiscovery = { modelsEndpoint, normalizeModels, fetchModels, sameConnection, mount };
})();