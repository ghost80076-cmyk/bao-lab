/* Optional, per-story Gemini explicit cache. Never store API keys or cache names in story saves. */
(() => {
  'use strict';
  if (window.BAOGeminiExplicitCache || !window.API || !window.App) return;
  const records = new WeakMap();
  const PRICING = 'https://ai.google.dev/gemini-api/docs/pricing';
  const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta';
  const rates = { 'gemini-3.1-pro-preview': 4.5, 'gemini-3.1-pro-preview-customtools': 4.5 };
  let preview = null;
  let busy = false;
  const $ = id => document.getElementById(id);
  const story = () => window.GameState?.current;
  const modelConfig = () => {
    const config = App.config?.api;
    if (!config || config.protocol !== 'gemini' || config.type !== 'gemini' || !config.key || !config.model) return null;
    try {
      const url = new URL(config.baseUrl);
      if (url.origin !== 'https://generativelanguage.googleapis.com' || url.pathname.replace(/\/$/, '') !== '/v1beta/models') return null;
    } catch (_) { return null; }
    return config;
  };
  const systemOf = messages => messages.filter(m => m.role === 'system').map(m => API.contentToText(m.content)).filter(Boolean).join('\n\n');
  const hashKey = async key => {
    if (!crypto?.subtle) throw new Error('需要安全的 HTTPS 網頁才能建立顯式快取。');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const isMatching = async (record, config, messages) => Boolean(record && record.expires > Date.now() &&
    record.model === config.model && record.baseUrl === config.baseUrl && record.system === systemOf(messages) &&
    record.keyHash === await hashKey(config.key));
  const setStatus = text => { const el = $('bao-gemini-cache-status'); if (el) el.textContent = text; };
  const active = () => story() && records.get(story());
  const description = record => !record ? '尚未建立。一般 Gemini 請求仍可使用 Google 自動快取。' :
    record.expires <= Date.now() ? '快取已到期，不再引用；可重新建立。' :
    `已建立 ${record.tokens.toLocaleString()} Token，${new Date(record.expires).toLocaleString('zh-TW')} 到期。`;
  const show = () => {
    const record = active();
    const config = modelConfig();
    const status = $('bao-gemini-cache-status');
    if (status) status.textContent = config ? description(record) : '僅支援玩家自己的 Google 官方 Gemini API（不是中轉或其他模型）。';
    const create = $('bao-gemini-cache-create');
    const check = $('bao-gemini-cache-check');
    const remove = $('bao-gemini-cache-remove');
    if (create) create.disabled = busy || !config || !story() || !preview || preview.story !== story() || preview.model !== config.model;
    if (check) check.disabled = busy || !config || !story();
    if (remove) remove.disabled = busy || !record || !config;
  };
  const apiCall = async (url, options, config) => {
    let response;
    try {
      response = await fetch(url, { ...options, headers: { 'x-goog-api-key': config.key, 'Content-Type': 'application/json' }, signal: options.signal || config.signal });
    } catch (error) { throw API.networkError(error); }
    const result = await API.readJSON(response);
    if (!response.ok) throw new Error(API.friendlyError(response.status, result, 'Gemini 快取'));
    return result;
  };
  const buildPreview = async () => {
    const config = modelConfig();
    if (!config || !story()) throw new Error('請先使用 Google 官方 Gemini API 開始故事。');
    const messages = await App.buildMessages(App.config);
    const system = systemOf(messages);
    if (!system.trim()) throw new Error('目前沒有固定設定可供建立快取。');
    const counted = await apiCall(`${URL_BASE}/models/${encodeURIComponent(config.model)}:countTokens`, {
      method: 'POST', body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: '計算快取長度' }] }] })
    }, config);
    const tokens = Number(counted.totalTokens || 0);
    const minimum = /^gemini-2\.5-(?:pro|flash)/.test(config.model) ? 2048 : 4096;
    if (tokens < minimum) throw new Error(`固定設定約 ${tokens.toLocaleString()} Token，未達此模型約 ${minimum.toLocaleString()} Token 的快取門檻。繼續使用自動快取即可。`);
    return { story: story(), model: config.model, baseUrl: config.baseUrl, system,
      keyHash: await hashKey(config.key), tokens, checkedAt: Date.now() };
  };
  const inspect = async () => {
    busy = true; preview = null; show(); setStatus('正在向 Google 查詢固定設定的 Token 數……');
    try {
      preview = await buildPreview();
      const minutes = Number($('bao-gemini-cache-ttl')?.value || 30);
      const hourly = rates[preview.model];
      const estimate = hourly ? `；估計保管費約 US$${(preview.tokens / 1e6 * hourly * minutes / 60).toFixed(5)}` : '；此模型的保管費請以 Google 官方定價為準';
      setStatus(`固定設定約 ${preview.tokens.toLocaleString()} Token；保存 ${minutes} 分鐘${estimate}。僅為保管費估計，不含建立與讀取費。`);
    } catch (error) { setStatus(error.message || '無法查詢 Token，尚未建立快取。'); }
    finally { busy = false; show(); }
  };
  const create = async () => {
    const config = modelConfig();
    if (!preview || !config || preview.story !== story() || preview.model !== config.model || preview.baseUrl !== config.baseUrl ||
        preview.keyHash !== await hashKey(config.key)) { setStatus('模型、金鑰或故事已改變，請重新檢查 Token。'); preview = null; show(); return; }
    const minutes = Number($('bao-gemini-cache-ttl')?.value || 30);
    if (![15, 30, 60].includes(minutes)) return;
    if (Date.now() - preview.checkedAt > 120000) { preview = null; setStatus('預覽已逾時，請重新檢查。'); show(); return; }
    const current = await App.buildMessages(App.config);
    if (systemOf(current) !== preview.system) { preview = null; setStatus('固定設定已改變，請重新檢查。'); show(); return; }
    if (active()?.expires > Date.now()) { setStatus('已有有效快取，請先刪除再建立。'); return; }
    if (!confirm(`確定要在你的 Google API 專案建立 ${minutes} 分鐘的付費快取？\n約 ${preview.tokens.toLocaleString()} Token，保管費按時間計算，建立及讀取也可能另計費；不保證比自動快取便宜。`)) return;
    busy = true; show(); setStatus('建立中，請勿重複按下……');
    try {
      const result = await apiCall(`${URL_BASE}/cachedContents`, { method: 'POST', body: JSON.stringify({
        model: `models/${config.model}`, systemInstruction: { parts: [{ text: preview.system }] },
        ttl: `${minutes * 60}s`, displayName: 'BAO-LAB personal story cache'
      }) }, config);
      if (!/^cachedContents\/[A-Za-z0-9_-]+$/.test(result.name || '')) throw new Error('Google 未回傳有效快取識別碼，請前往 Google 控制台檢查帳單。');
      records.set(story(), { ...preview, name: result.name, expires: Date.parse(result.expireTime) || Date.now() + minutes * 60000,
        tokens: Number(result.usageMetadata?.totalTokenCount || preview.tokens) });
      preview = null;
      setStatus(description(active()));
    } catch (error) { setStatus(`建立失敗：${error.message}。若網路中斷，請到 Google 控制台確認是否已建立。`); }
    finally { busy = false; show(); }
  };
  const remove = async () => {
    const record = active(), config = modelConfig();
    if (!record || !config) return;
    if (record.keyHash !== await hashKey(config.key)) { setStatus('請切回建立快取時的 API Key 才能刪除，或等待原定時間到期。'); return; }
    if (!confirm('確定向 Google 刪除此快取？刪除後無法恢復。')) return;
    busy = true; show(); setStatus('正在刪除 Google 快取……');
    try {
      let response;
      try { response = await fetch(`${URL_BASE}/${record.name}`, { method: 'DELETE', headers: { 'x-goog-api-key': config.key }, signal: config.signal }); }
      catch (error) { throw API.networkError(error); }
      if (!response.ok && response.status !== 404) {
        const data = await API.readJSON(response);
        throw new Error(API.friendlyError(response.status, data, 'Gemini 快取'));
      }
      records.delete(story()); preview = null; setStatus('已刪除，後續使用一般 Gemini 請求。');
    } catch (error) { setStatus(`刪除失敗：${error.message}，快取仍可能持續計費至到期。`); }
    finally { busy = false; show(); }
  };
  const sendOriginal = API.sendGemini.bind(API);
  API.sendGemini = async function(config, messages) {
    const record = active();
    if (!record || config.__memoryTask || App.config?.memory?.cache === false ||
        !modelConfig() || config.model !== App.config?.api?.model || config.key !== App.config?.api?.key ||
        !await isMatching(record, config, messages)) return sendOriginal(config, messages);
    const streaming = API.shouldStream(config);
    const url = `${URL_BASE}/models/${encodeURIComponent(config.model)}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
    const contents = messages.filter(m => m.role !== 'system').map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: API.contentToText(m.content) }] }));
    if (!contents.length) return sendOriginal(config, messages);
    const body = { cachedContent: record.name, contents };
    const limit = Number(config.maxOutputTokens || 0);
    if (limit > 0) body.generationConfig = { maxOutputTokens: Math.floor(limit) };
    let response;
    try { response = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': config.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: config.signal || API.activeSignal }); }
    catch (error) { throw API.networkError(error); }
    if (response.status === 404) { records.delete(story()); show(); return sendOriginal(config, messages); }
    if (streaming && response.ok && API.isEventStream(response)) return API.readGeminiStream(response, config);
    const data = await API.readJSON(response);
    if (!response.ok) throw new Error(API.friendlyError(response.status, data, 'Gemini 快取'));
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => typeof p?.text === 'string' ? p.text : '').filter(Boolean).join('\n');
    return { text: text || API.geminiEmptyResponseMessage(data), usage: API.normalizeUsage(data?.usageMetadata || {}, 'gemini') };
  };
  const open = () => { $('bao-gemini-cache-dialog')?.showModal(); show(); };
  const init = () => {
    if ($('bao-gemini-cache-dialog')) return;
    const style = document.createElement('style');
    style.textContent = '#bao-gemini-cache-dialog{max-width:min(520px,94vw);width:100%;max-height:88vh;overflow:auto;background:#1a2230;color:#f5f1e9;border:1px solid #526171;border-radius:16px;padding:22px;box-sizing:border-box}#bao-gemini-cache-dialog::backdrop{background:#000a}#bao-gemini-cache-dialog button,#bao-gemini-cache-dialog select{min-height:40px;margin:4px;border-radius:9px}#bao-gemini-cache-dialog .bao-cache-actions{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0}#bao-gemini-cache-dialog a{color:#8de7d6}';
    document.head.append(style);
    const dialog = document.createElement('dialog'); dialog.id = 'bao-gemini-cache-dialog';
    dialog.innerHTML = `<h3>Gemini 顯式快取（進階）</h3><p>只有你主動建立才會產生保管費。保存的是目前故事的完整系統設定，不包含聊天歷史；設定改變後自動改用一般請求，需手動重建。每位玩家使用自己的 Google API Key，快取不包含在故事備份中。</p><p>Google 自動快取本來就可使用。顯式快取不保證比較省錢；刷新頁面後本機將失去快取 ID，但 Google 仍會保管至到期。</p><label>保留時間 <select id="bao-gemini-cache-ttl"><option value="15">15 分鐘</option><option value="30" selected>30 分鐘</option><option value="60">60 分鐘</option></select></label><p id="bao-gemini-cache-status" role="status" aria-live="polite"></p><div class="bao-cache-actions"><button id="bao-gemini-cache-check" type="button">檢查固定設定 Token</button><button id="bao-gemini-cache-create" type="button" disabled>確認建立（可能收費）</button><button id="bao-gemini-cache-remove" type="button">刪除快取</button><button id="bao-gemini-cache-close" type="button">關閉</button></div><small>保管費按 Token × 時間計算，建立、讀取另依 Google 定價。請參考 <a target="_blank" rel="noopener noreferrer" href="${PRICING}">Google 官方定價</a>。若顯示未達門檻，不會建立或產生保管費。</small>`;
    document.body.append(dialog);
    $('bao-gemini-cache-check').onclick = inspect;
    $('bao-gemini-cache-create').onclick = create;
    $('bao-gemini-cache-remove').onclick = remove;
    $('bao-gemini-cache-close').onclick = () => dialog.close();
    $('bao-gemini-cache-ttl').onchange = () => { preview = null; setStatus('保存時間已改變，請重新檢查費用。'); show(); };
    const entry = () => { const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Gemini 顯式快取'; button.dataset.baoGeminiCacheOpen = '1'; button.className = 'secondary'; button.addEventListener('click', open); return button; };
    const aside = document.querySelector('#chat-view .chat-layout > aside');
    if (aside) aside.append(entry());
    const apiBuilder = document.querySelector('#builder-view [data-step-panel="4"]');
    if (apiBuilder) { const button = entry(); button.className = 'secondary'; apiBuilder.append(button); }
    const addDrawer = () => {
      const body = document.querySelector('#bao-chat-tool-drawer .bao-chat-tool-dialog-body');
      if (body && !body.querySelector('[data-bao-gemini-cache-open]')) body.append(entry());
    };
    new MutationObserver(mutations => { if (mutations.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && (n.id === 'bao-chat-tool-drawer' || n.querySelector?.('#bao-chat-tool-drawer'))))) addDrawer(); }).observe(document.body, { childList: true });
    addDrawer(); show();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
  window.BAOGeminiExplicitCache = { open, inspect, create, remove };
})();
