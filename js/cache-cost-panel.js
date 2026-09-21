/* Read-only cache and cost explanation. Never stores API keys or conversation content. */
(() => {
  'use strict';
  if (window.BAOCacheCostPanel || !window.Chat) return;
  const $ = id => document.getElementById(id);
  const known = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const fmt = value => value === null ? '未回報' : value.toLocaleString('zh-TW') + ' Token';
  let last = null;

  const describeCache = (cfg = {}) => {
    let host = '';
    try { host = new URL(cfg.baseUrl || '').hostname.toLowerCase(); } catch (_) { /* Unknown route. */ }
    if (cfg.protocol === 'gemini' && host === 'generativelanguage.googleapis.com' && cfg.type === 'gemini')
      return { label: 'Gemini 官方 API', mode: '自動快取；也可自行建立付費顯式快取', gemini: true };
    if (host === 'api.anthropic.com' && cfg.protocol === 'anthropic')
      return { label: 'Claude 官方 API', mode: '提示前綴快取（依模型及請求設定）', gemini: false };
    if (host === 'openrouter.ai')
      return { label: 'OpenRouter', mode: '依選用模型、路由及供應商決定', gemini: false };
    if (host === 'api.openai.com')
      return { label: 'OpenAI 官方 API', mode: '支援模型可能自動快取；依用量回報確認', gemini: false };
    if (cfg.type === 'custom' || cfg.protocol === 'openai')
      return { label: '自訂／相容 API', mode: '依實際服務商決定；不保證有快取折扣', gemini: false };
    return { label: '目前的 AI 連線', mode: '依模型與服務商決定', gemini: false };
  };

  const estimateDifference = (usage, price) => {
    const input = known(usage?.input_tokens ?? usage?.prompt_tokens);
    const cached = known(usage?.cached_tokens);
    const normalRate = known(price?.inputPerMillion);
    const cacheRate = known(price?.cachePerMillion);
    if (input === null || cached === null || cached > input || normalRate === null || cacheRate === null || normalRate <= 0 || cacheRate <= 0 || cacheRate > normalRate) return null;
    return cached * (normalRate - cacheRate) / 1000000;
  };

  const capture = usage => {
    const story = window.GameState?.current;
    if (!story) return;
    const cfg = window.App?.config?.api || {};
    last = {
      story,
      provider: describeCache(cfg),
      model: String(cfg.model || ''),
      usage: {
        input_tokens: known(usage?.input_tokens ?? usage?.prompt_tokens),
        cached_tokens: known(usage?.cached_tokens),
        cache_write_tokens: known(usage?.cache_write_tokens),
        output_tokens: known(usage?.output_tokens ?? usage?.completion_tokens)
      }
    };
    render();
  };
  const current = () => last?.story && last.story === window.GameState?.current ? last : null;
  const text = (id, value) => { const node = $(id); if (node) node.textContent = value; };

  const render = () => {
    if (!$('bao-cache-cost-dialog')) return;
    const record = current();
    const cfg = window.App?.config?.api || {};
    const type = record?.provider || describeCache(cfg);
    const usage = record?.usage;
    const prices = window.App?.config?.cost || {};
    const saved = usage ? estimateDifference(usage, prices) : null;
    text('bao-cache-provider', type.label + (cfg.model ? ' · ' + cfg.model : ''));
    text('bao-cache-mode', type.mode);
    text('bao-cache-input', usage ? fmt(usage.input_tokens) : '尚無本輪主劇情回覆');
    text('bao-cache-hit', usage ? fmt(usage.cached_tokens) : '尚無本輪主劇情回覆');
    text('bao-cache-write', usage ? fmt(usage.cache_write_tokens) : '尚無本輪主劇情回覆');
    text('bao-cache-output', usage ? fmt(usage.output_tokens) : '尚無本輪主劇情回覆');
    const total = window.Chat?.usage || {};
    text('bao-cache-cumulative', !window.GameState?.current ? '尚未開始故事' : total.cachedUnknown ? '不完整：部分 API 沒有回報快取用量' : Number(total.cached || 0).toLocaleString('zh-TW') + ' Token（含輔助請求）');
    text('bao-cache-difference', saved === null ? '無法估算（需本輪回報及正確的兩種輸入單價）' : '約 US$' + saved.toFixed(6) + '（僅本輪快取讀取的輸入費差額）');
    text('bao-cache-disclaimer', '價格由玩家手動填寫，非供應商帳單；不包含快取建立／寫入、Gemini 保管費、模型切換、輔助模型或中轉站附加費，不能當成淨節省金額。未回報不等於零。');
    const button = $('bao-cache-open-gemini');
    if (button) button.hidden = !type.gemini;
  };

  const open = () => {
    render();
    const dialog = $('bao-cache-cost-dialog');
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  };
  const init = () => {
    if ($('bao-cache-cost-dialog')) return;
    const style = document.createElement('style');
    style.textContent = '#bao-cache-cost-dialog{max-width:min(550px,94vw);width:100%;max-height:85vh;overflow:auto;box-sizing:border-box;border:1px solid #596675;border-radius:16px;background:#19232f;color:#f6f2eb;padding:22px}#bao-cache-cost-dialog::backdrop{background:#000a}#bao-cache-cost-dialog .bao-cache-row{display:flex;justify-content:space-between;gap:14px;padding:8px 0;border-bottom:1px solid #59667555;flex-wrap:wrap}#bao-cache-cost-dialog .bao-cache-row strong{text-align:right;overflow-wrap:anywhere}#bao-cache-cost-dialog button{margin:6px;min-height:38px}#bao-cache-cost-dialog .bao-cache-note{font-size:.86em;opacity:.83;line-height:1.5}#bao-cache-cost-entry{width:auto;min-width:0;padding:6px 10px;white-space:normal}';
    document.head.append(style);
    const dialog = document.createElement('dialog');
    dialog.id = 'bao-cache-cost-dialog';
    dialog.setAttribute('aria-label', '快取與費用管理');
    dialog.innerHTML = '<h3>快取與費用管理</h3><p class="bao-cache-note">只顯示已收到的 API 用量；不會讀取服務商帳單，也不會上傳聊天紀錄。</p><div class="bao-cache-row"><span>服務商／模型</span><strong id="bao-cache-provider">—</strong></div><div class="bao-cache-row"><span>快取方式</span><strong id="bao-cache-mode">—</strong></div><div class="bao-cache-row"><span>本輪輸入</span><strong id="bao-cache-input">—</strong></div><div class="bao-cache-row"><span>本輪快取命中</span><strong id="bao-cache-hit">—</strong></div><div class="bao-cache-row"><span>本輪快取寫入</span><strong id="bao-cache-write">—</strong></div><div class="bao-cache-row"><span>本輪輸出</span><strong id="bao-cache-output">—</strong></div><div class="bao-cache-row"><span>故事累積快取命中</span><strong id="bao-cache-cumulative">—</strong></div><div class="bao-cache-row"><span>快取讀取費差估算</span><strong id="bao-cache-difference">—</strong></div><p class="bao-cache-note" id="bao-cache-disclaimer"></p><div><button type="button" id="bao-cache-open-gemini" class="secondary" hidden>管理 Gemini 付費快取</button><button type="button" id="bao-cache-close" class="secondary">關閉</button></div>';
    document.body.append(dialog);
    $('bao-cache-close').addEventListener('click', () => { if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open'); });
    $('bao-cache-open-gemini').addEventListener('click', () => {
      if (typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
      if (window.BAOGeminiExplicitCache?.open) window.BAOGeminiExplicitCache.open();
      else window.alert('Gemini 顯式快取功能尚在載入，請稍後再試。');
    });
    const bar = document.querySelector('#chat-view .usage-bar');
    if (bar && !$('bao-cache-cost-entry')) {
      const button = document.createElement('button');
      button.id = 'bao-cache-cost-entry';
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = '快取與費用';
      button.addEventListener('click', open);
      bar.append(button);
    }
    render();
  };
  const previousTurn = typeof Chat.renderTurnUsage === 'function' ? Chat.renderTurnUsage : null;
  if (previousTurn) Chat.renderTurnUsage = function(usage = {}) { const result = previousTurn.call(this, usage); capture(usage); return result; };
  const previousReset = typeof Chat.reset === 'function' ? Chat.reset : null;
  if (previousReset) Chat.reset = function(...args) { last = null; const result = previousReset.apply(this, args); render(); return result; };
  const previousUsage = typeof Chat.renderUsage === 'function' ? Chat.renderUsage : null;
  if (previousUsage) Chat.renderUsage = function(...args) { const result = previousUsage.apply(this, args); if ($('bao-cache-cost-dialog')?.open) render(); return result; };
  window.BAOCacheCostPanel = { describeCache, estimateDifference, open, render };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();