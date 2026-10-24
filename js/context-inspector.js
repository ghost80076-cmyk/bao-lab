/* Last request, captured after prompt transforms and before provider serialization.
   Memory-only: never stored in saves, exports or telemetry. */
(() => {
  'use strict';
  if (window.BAOContextInspector || !API.wrapSend) return;
  const requests = new WeakMap(), sources = new WeakMap(), lastCompleted = new WeakMap(), revisionTargets = new WeakMap();
  const owner = () => GameState.current && (window.BAOStoryRevisionState?.contextIdentity?.() || GameState.current);
  const kindLabel = kind => ({story:'一般故事回覆',regenerate:'重新生成',rewrite:'AI 改寫'})[kind] || '一般故事回覆';
  const signature = () => JSON.stringify(Chat.messages.map(m => [m.id, m.role, m.content, m.context_content || '']));
  const esc = value => App.escapeHTML(String(value ?? ''));
  const record = (layer, decisions) => {
    const state = owner(), active = state && sources.get(state);
    if (!active || active.signature !== signature()) return;
    active.layers[layer] = decisions.slice(0, 150).map(item => ({ ...item }));
  };
  App.wrapBuildMessages('context-inspector:sources', async function(next, ...args) {
    const state = owner();
    if (state) sources.set(state, { signature: signature(), layers: {} });
    return next(...args);
  });
  API.wrapSend('context-inspector:request', async (next, config, messages, ...rest) => {
    const state = owner();
    const revision = config?.__storyTool && ['regenerate','rewrite'].includes(config?.__storyRevision) && !config?.__inspirationTask;
    if (!state || config?.__memoryTask || config?.__stateTask || config?.__connectionTest || (config?.__storyTool && !revision) || config?.__auxiliaryTask || config?.__inspirationTask) return next(config, messages, ...rest);
    const kind = revision ? config.__storyRevision : 'story';
    const anchors = Chat.messages.map(m => [m.id, m.role, m.content, m.context_content || '']);
    const src = sources.get(state);
    let efficiency = null;
    try {
      efficiency = window.BAOContextEfficiencyCore?.analyze?.(messages, revision ? null : lastCompleted.get(state)) || null;
    } catch (_) { /* Never let optional local analytics block a story request. */ }
    let settingsEffects = null;
    try { settingsEffects = window.BAOSettingsEffects?.capture?.(messages, {kind}) || null; }
    catch (_) { /* Optional diagnostics never change or block a request. */ }
    const latestUser = messages.findLastIndex(m => m?.role === 'user');
    const dynamicUser = kind === 'rewrite' ? messages.slice(0,latestUser).findLastIndex(m => m?.role === 'user') : latestUser;
    let remaining = 200000;
    const entry = {
      at: new Date().toISOString(), model: String(config?.model || ''), status: 'pending', kind,
      layers: src?.signature === signature() ? structuredClone(src.layers) : {},
      efficiency,
      settingsEffects,
      anchors,
      messages: (Array.isArray(messages) ? messages : []).map((m, i) => {
        const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
        const content = text.slice(0, remaining); remaining -= content.length;
        return { role: m.role, label: i === 0 && m.role === 'system' ? '固定前綴候選' : m.role === 'system' ? '記憶／系統資料' : kind === 'rewrite' && i === latestUser ? '改寫要求與原回覆' : i === dynamicUser ? '本輪輸入與動態資料' : '近期對話',
          chars: text.length, content, truncated: content.length < text.length };
      })
    };
    if (revision) {
      const index = Chat.messages.findLastIndex(m => m?.role === 'assistant');
      if (index >= 0) revisionTargets.set(entry, {message:Chat.messages[index],index});
    }
    requests.set(state, entry);
    try {
      const result = await next(config, messages, ...rest);
      entry.status = 'success';
      if (!revision && requests.get(state) === entry && efficiency) lastCompleted.set(state, { totalChars: efficiency.totalChars });
      // Copy numeric provider usage only; never retain config, keys or response text.
      entry.usage = Object.fromEntries(['input_tokens','cached_tokens','output_tokens'].map(key =>
        [key, typeof result?.usage?.[key] === 'number' ? result.usage[key] : null]));
      return result;
    } catch (error) { entry.status = 'failed'; throw error; }
  });
  // Only the real revision caller can bind the captured request to its committed
  // variant. Do not retain the provider response or silently accept a new branch.
  const commitRevision = message => {
    const state = owner(), entry = state && requests.get(state), target = entry && revisionTargets.get(entry);
    if (!target || entry.status !== 'success' || target.message !== message || Chat.messages[target.index] !== message) return;
    if (Chat.messages.length !== entry.anchors.length || target.index !== Chat.messages.length - 1) return;
    const prefix = Chat.messages.slice(0,target.index).map(m => [m.id,m.role,m.content,m.context_content || '']);
    if (JSON.stringify(prefix) !== JSON.stringify(entry.anchors.slice(0,target.index))) return;
    entry.anchors = Chat.messages.map(m => [m.id,m.role,m.content,m.context_content || '']);
    revisionTargets.delete(entry);
  };
  const snapshot = () => {
    const state = owner(), entry = state && requests.get(state);
    if (!entry) return null;
    const current = Chat.messages.slice(0, entry.anchors.length).map(m => [m.id, m.role, m.content, m.context_content || '']);
    if (JSON.stringify(current) !== JSON.stringify(entry.anchors)) return null;
    const { anchors, ...view } = entry;
    return structuredClone(view);
  };
  const open = () => {
    if (!document.querySelector('link[href^="css/context-health.css"]')) {
      const link = document.createElement('link'); link.rel = 'stylesheet';
      link.href = 'css/context-health.css?v=5'; document.head.appendChild(link);
    }
    document.querySelector('[data-context-inspector]')?.remove();
    const data = snapshot();
    const root = document.createElement('div');
    root.className = 'context-health-backdrop'; root.dataset.contextInspector = '';
    const reason = {included:'已加入',knowledge:'知情篩選排除',evidence:'來源失效',retracted:'已撤回／被更正',duplicate:'已有相同內容',irrelevant:'未命中',budget:'預算／數量上限',disabled:'未啟用',condition:'條件未滿足',world:'世界不符',review:'待審核',matrix:'知情矩陣不直接加入',display:'僅供界面顯示'};
    const tok = n => n == null ? '未知' : n.toLocaleString() + ' tok';
    root.innerHTML = `<section class="context-health-panel" role="dialog" aria-modal="true" aria-label="本輪上下文檢視器">
      <header class="context-health-head"><div><h2>本輪上下文檢視器</h2><p>送出前的訊息快照；服務商仍可能轉換協定格式。字數不等於 Token，固定前綴候選不等於實際快取命中。</p></div><button type="button" class="context-health-close" aria-label="關閉檢視器">×</button></header>
      ${data ? `<p>${esc(kindLabel(data.kind))} · ${esc(data.at)} · ${esc(data.model)} · ${esc(data.status)}</p><p>Provider 回報：輸入 ${esc(tok(data.usage?.input_tokens))} · 快取讀取 ${esc(tok(data.usage?.cached_tokens))} · 輸出 ${esc(tok(data.usage?.output_tokens))}</p>
      ${window.BAOSettingsEffects?.renderCaptured?.(data.settingsEffects, data.status, data.at, data.kind) || ""}
      ${Object.entries(data.layers).map(([layer, items]) => `<details class="context-health-advanced"><summary>${esc(layer)} · ${items.length} 筆決策</summary>${items.map(item => `<p><b>${esc(item.title || item.id)}</b> · ${esc(reason[item.reason] || item.reason)}${item.score == null ? '' : ' · 排序分數 ' + esc(item.score)}${item.match === 'trust-tag' ? ' · 人際信任標籤對應' : ''}</p>`).join('')}</details>`).join('')}
      ${data.messages.map((m,i) => `<details class="context-health-advanced"><summary>${i+1}. ${esc(m.label)} · ${esc(m.role)} · ${m.chars.toLocaleString()} 字元${m.truncated ? '（顯示節錄）' : ''}</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%">${esc(m.content)}</pre></details>`).join('')}` : '<p>目前沒有可用的送出快照。送出一般故事回覆、重新生成或 AI 改寫後即可查看；重新載入或更改分支原文後需再次送出。</p>'}
    </section>`;
    const close = () => { root.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    root.querySelector('button').addEventListener('click', close);
    root.addEventListener('click', e => { if (e.target === root) close(); });
    document.addEventListener('keydown', onKey); document.body.appendChild(root); root.querySelector('button').focus();
  };
  const reset = Chat.reset.bind(Chat);
  Chat.reset = function(...args) { const state = owner(); if (state) { requests.delete(state); sources.delete(state); lastCompleted.delete(state); } return reset(...args); };
  window.BAOContextInspector = Object.freeze({ record, snapshot, open, commitRevision });
})();
