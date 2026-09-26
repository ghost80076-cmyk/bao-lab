/* Player-owned, opt-in Gemini explicit cache. No API keys/cache IDs in story saves. */
(() => {
  'use strict';
  if (window.BAOGeminiExplicitCache || !window.API || !window.App) return;
  const records = new WeakMap();
  const BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const PRICING = 'https://ai.google.dev/gemini-api/docs/pricing';
  const storageRates = { 'gemini-3.1-pro-preview': 4.5, 'gemini-3.1-pro-preview-customtools': 4.5 };
  let preview = null, busy = false;
  const $ = id => document.getElementById(id);
  const story = () => window.GameState?.current;
  const configNow = () => {
    const config = App.config?.api;
    if (config?.protocol !== 'gemini' || config.type !== 'gemini' || !config.key || !config.model) return null;
    try {
      const url = new URL(config.baseUrl);
      if (url.origin !== 'https://generativelanguage.googleapis.com' || url.pathname.replace(/\/$/, '') !== '/v1beta/models') return null;
    } catch (_) { return null; }
    return config;
  };
  const systemOf = messages => messages.filter(m => m.role === 'system').map(m => API.contentToText(m.content)).filter(Boolean).join('\n\n');
  const fingerprint = async key => {
    if (!globalThis.crypto?.subtle) throw new Error('顯式快取需要 HTTPS 安全網頁。');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join('');
  };
  const current = () => story() ? records.get(story()) : null;
  const description = record => !record ? '尚未建立，Gemini 自動快取仍照常運作。' :
    record.expires <= Date.now() ? '已過期，後續使用一般 Gemini 請求。' :
    `已建立 ${record.tokens.toLocaleString()} Token；${new Date(record.expires).toLocaleString('zh-TW')} 到期。`;
  const status = message => { if ($('bao-gemini-cache-status')) $('bao-gemini-cache-status').textContent = message; };
  const refresh = () => {
    const cfg = configNow();
    if ($('bao-gemini-cache-check')) $('bao-gemini-cache-check').disabled = busy || !cfg || !story();
    if ($('bao-gemini-cache-create')) $('bao-gemini-cache-create').disabled = busy || !cfg || !preview ||
      preview.story !== story() || preview.model !== cfg.model || current()?.expires > Date.now();
    if ($('bao-gemini-cache-remove')) $('bao-gemini-cache-remove').disabled = busy || !cfg || !current();
  };
  const google = async (url, options, cfg) => {
    let response;
    try { response = await fetch(url, { ...options, headers: { 'x-goog-api-key': cfg.key, 'Content-Type': 'application/json' }, signal: options.signal || cfg.signal }); }
    catch (error) { throw API.networkError(error); }
    const data = await API.readJSON(response);
    if (!response.ok) throw new Error(API.friendlyError(response.status, data, 'Gemini 快取'));
    return data;
  };
  const inspect = async () => {
    if (busy) return;
    const cfg = configNow(), entryStory = story();
    if (!cfg || !entryStory) { status('請先用自己的 Google 官方 Gemini API 開始故事。'); return; }
    busy = true; preview = null; refresh(); status('正在查詢固定設定 Token 數……');
    try {
      if (typeof App.buildMessages !== 'function') throw new Error('故事提示組件仍在載入，請稍後重試。');
      const messages = await App.buildMessages(App.config);
      const system = systemOf(messages);
      if (!system.trim()) throw new Error('目前沒有可快取的系統設定。');
      const counted = await google(`${BASE}/models/${encodeURIComponent(cfg.model)}:countTokens`, { method: 'POST',
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: '計算快取長度' }] }] }) }, cfg);
      const tokens = Number(counted.totalTokens || 0);
      const minimum = /^gemini-2\.5-(?:pro|flash)/.test(cfg.model) ? 2048 : 4096;
      if (tokens < minimum) throw new Error(`固定設定約 ${tokens.toLocaleString()} Token，未達約 ${minimum.toLocaleString()} Token 的最低門檻；繼續使用自動快取即可。`);
      if (story() !== entryStory || configNow()?.model !== cfg.model || configNow()?.key !== cfg.key) throw new Error('故事或 API 已變動，請重新檢查。');
      preview = { story: entryStory, model: cfg.model, baseUrl: cfg.baseUrl, keyHash: await fingerprint(cfg.key), system, tokens, checkedAt: Date.now() };
      const minutes = Number($('bao-gemini-cache-ttl')?.value || 30);
      const rate = storageRates[cfg.model];
      const price = rate ? `，估計保管費 US$${(tokens / 1e6 * rate * minutes / 60).toFixed(5)}` : '；此模型保管費請參考 Google 定價';
      status(`固定設定約 ${tokens.toLocaleString()} Token，保存 ${minutes} 分鐘${price}。此估計不含建立、讀取與其他費用。`);
    } catch (error) { status(error.message || '查詢失敗，沒有建立快取。'); }
    finally { busy = false; refresh(); }
  };
  const create = async () => {
    if (busy) return;
    const cfg = configNow(), before = preview;
    if (!cfg || !before || before.story !== story() || before.model !== cfg.model || before.baseUrl !== cfg.baseUrl ||
        before.keyHash !== await fingerprint(cfg.key)) { preview = null; status('故事、金鑰或模型已改變，請重新檢查。'); refresh(); return; }
    const minutes = Number($('bao-gemini-cache-ttl')?.value || 30);
    if (![15, 30, 60].includes(minutes)) return;
    if (Date.now() - before.checkedAt > 120000) { preview = null; status('預覽已過期，請重新檢查費用。'); refresh(); return; }
    if (current()?.expires > Date.now()) { status('已有有效快取；請先刪除再建立。'); return; }
    try {
      const messages = await App.buildMessages(App.config);
      if (systemOf(messages) !== before.system) { preview = null; status('固定設定已變更，請重新檢查。'); refresh(); return; }
    } catch (error) { status(`無法檢查最新設定：${error.message}`); return; }
    if (!confirm(`要在你的 Google API 專案建立 ${minutes} 分鐘付費快取嗎？\n約 ${before.tokens.toLocaleString()} Token，保管按時間計費，建立與讀取也可能計費；不保證比自動快取便宜。`)) return;
    busy = true; refresh(); status('正在建立付費快取，請勿重複操作……');
    try {
      const result = await google(`${BASE}/cachedContents`, { method: 'POST', body: JSON.stringify({ model: `models/${cfg.model}`,
        systemInstruction: { parts: [{ text: before.system }] }, ttl: `${minutes * 60}s`, displayName: 'BAO-LAB personal story cache' }) }, cfg);
      if (!/^cachedContents\/[A-Za-z0-9_-]+$/.test(result.name || '')) throw new Error('未收到有效快取 ID，請到 Google 控制台確認是否已建立。');
      records.set(before.story, { ...before, name: result.name, expires: Date.parse(result.expireTime) || Date.now() + minutes * 60000,
        tokens: Number(result.usageMetadata?.totalTokenCount || before.tokens) });
      preview = null; status(description(current()));
    } catch (error) { status(`建立失敗：${error.message}。如網路中斷，請至 Google 控制台確認帳單。`); }
    finally { busy = false; refresh(); }
  };
  const remove = async () => {
    if (busy) return;
    const cfg = configNow(), record = current(), s = story();
    if (!cfg || !record || !s) return;
    if (record.keyHash !== await fingerprint(cfg.key)) { status('請切回建立時的 API Key 才能刪除；否則等待原定時間到期。'); return; }
    if (!confirm('確定刪除這份 Google 顯式快取？刪除後無法恢復。')) return;
    busy = true; refresh(); status('正在向 Google 刪除快取……');
    try {
      let response;
      try { response = await fetch(`${BASE}/${record.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': cfg.key }, signal: cfg.signal }); }
      catch (error) { throw API.networkError(error); }
      if (!response.ok && response.status !== 404) throw new Error(API.friendlyError(response.status, await API.readJSON(response), 'Gemini 快取'));
      records.delete(s); preview = null; status('已刪除，後續使用一般 Gemini 請求。');
    } catch (error) { status(`刪除失敗：${error.message}。快取仍可能計費至到期。`); }
    finally { busy = false; refresh(); }
  };
  const original = API.sendGemini.bind(API);
  API.sendGemini = async function(cfg, messages) {
    const s = story(), record = current();
    if (!record || cfg.__memoryTask || App.config?.memory?.cache === false || !configNow() ||
        cfg.model !== App.config?.api?.model || cfg.key !== App.config?.api?.key ||
        record.model !== cfg.model || record.baseUrl !== cfg.baseUrl || record.expires <= Date.now() ||
        record.system !== systemOf(messages) || record.keyHash !== await fingerprint(cfg.key) || story() !== s) return original(cfg, messages);
    const stream = API.shouldStream(cfg);
    const url = `${BASE}/models/${encodeURIComponent(cfg.model)}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: API.contentToText(m.content) }] }));
    if (!contents.length) return original(cfg, messages);
    const body = { cachedContent: record.name, contents };
    if (Number(cfg.maxOutputTokens) > 0) body.generationConfig = { maxOutputTokens: Math.floor(Number(cfg.maxOutputTokens)) };
    let response;
    try { response = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': cfg.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: cfg.signal || API.activeSignal }); }
    catch (error) { throw API.networkError(error); }
    if (response.status === 404) { records.delete(s); status('Google 快取已失效，改用一般請求。'); refresh(); return original(cfg, messages); }
    if (stream && response.ok && API.isEventStream(response)) return API.readGeminiStream(response, cfg);
    const data = await API.readJSON(response);
    if (!response.ok) throw new Error(API.friendlyError(response.status, data, 'Gemini 快取'));
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join('\n');
    return { text: text || API.geminiEmptyResponseMessage(data), usage: API.normalizeUsage(data?.usageMetadata || {}, 'gemini') };
  };
  const open = () => {
    status(configNow() ? description(current()) : '僅支援玩家自己的 Google 官方 Gemini API，不支援中轉。');
    $('bao-gemini-cache-dialog')?.showModal(); refresh();
  };
  const init = () => {
    if ($('bao-gemini-cache-dialog')) return;
    const style = document.createElement('style');
    style.textContent = '#bao-gemini-cache-dialog{max-width:min(520px,94vw);width:100%;max-height:88vh;overflow:auto;background:#1a2230;color:#f5f1e9;border:1px solid #526171;border-radius:16px;padding:22px;box-sizing:border-box}#bao-gemini-cache-dialog::backdrop{background:#000a}#bao-gemini-cache-dialog button,#bao-gemini-cache-dialog select{min-height:40px;margin:4px;border-radius:9px}#bao-gemini-cache-dialog .bao-cache-actions{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}#bao-gemini-cache-dialog a{color:#8de7d6}';
    document.head.append(style);
    const dialog = document.createElement('dialog'); dialog.id = 'bao-gemini-cache-dialog';
    dialog.innerHTML = `<h3>Gemini 顯式快取（進階）</h3><p>須自行確認建立，才會產生快取保管費。保存的是目前故事完整系統設定，不含聊天歷史；設定變更後會自動改用一般請求，需手動刪除並重建。使用你自己的 Google API Key，快取不包含在故事備份中。</p><p>Google 自動快取仍正常運作；顯式快取不保證更便宜。重新整理或換裝置後，此頁將失去快取 ID，但 Google 仍保存至到期。設定中可能含玩家 Persona，請確認願意由 Google 在快取有效期內保存。</p><label>保留時間 <select id="bao-gemini-cache-ttl"><option value="15">15 分鐘</option><option value="30" selected>30 分鐘</option><option value="60">60 分鐘</option></select></label><p id="bao-gemini-cache-status" role="status" aria-live="polite"></p><div class="bao-cache-actions"><button id="bao-gemini-cache-check" type="button">檢查固定設定 Token</button><button id="bao-gemini-cache-create" type="button" disabled>確認建立（可能收費）</button><button id="bao-gemini-cache-remove" type="button">刪除快取</button><button id="bao-gemini-cache-close" type="button">關閉</button></div><small>保管按 Token × 時間計費，建立及讀取另依 Google 定價。請參考 <a target="_blank" rel="noopener noreferrer" href="${PRICING}">Google 官方定價</a>。未達門檻不會建立。</small>`;
    document.body.append(dialog);
    $('bao-gemini-cache-check').onclick = inspect;
    $('bao-gemini-cache-create').onclick = create;
    $('bao-gemini-cache-remove').onclick = remove;
    $('bao-gemini-cache-close').onclick = () => dialog.close();
    $('bao-gemini-cache-ttl').onchange = () => { preview = null; status('已調整保留時間，請重新檢查 Token 與費用。'); refresh(); };
    const entry = () => { const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Gemini 顯式快取'; button.dataset.baoGeminiCacheOpen = '1'; button.className = 'secondary'; button.addEventListener('click', open); return button; };
    document.querySelector('#chat-view .chat-layout > aside')?.append(entry());
    document.querySelector('#builder-view [data-step-panel="4"]')?.append(entry());
    const addDrawer = () => {
      const body = document.querySelector('#bao-chat-tool-drawer .bao-chat-tool-dialog-body');
      if (body && !body.querySelector('[data-bao-gemini-cache-open]')) body.append(entry());
    };
    new MutationObserver(mutations => { if (mutations.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.id === 'bao-chat-tool-drawer' || n.querySelector?.('#bao-chat-tool-drawer'))))) addDrawer(); }).observe(document.body, { childList: true, subtree: true });
    addDrawer(); status(description(current())); refresh();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.BAOGeminiExplicitCache = { open, inspect, create, remove };
})();
