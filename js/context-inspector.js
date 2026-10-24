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
    const entry = {
      at: new Date().toISOString(), model: String(config?.model || ''), status: 'pending', kind,
      layers: src?.signature === signature() ? structuredClone(src.layers) : {},
      efficiency,
      settingsEffects,
      anchors,
      messages: (Array.isArray(messages) ? messages : []).map(m => ({role:m.role,chars:(typeof m.content==='string'?m.content:JSON.stringify(m.content ?? '')).length}))
    };
    if (revision) {
      const index = Chat.messages.findLastIndex(m => m?.role === 'assistant');
      if (index >= 0) revisionTargets.set(entry, {message:Chat.messages[index],index,token:config.__storyRevisionToken});
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
  const commitRevision = (message, token) => {
    const state = owner(), entry = state && requests.get(state), target = entry && revisionTargets.get(entry);
    if (!target || !token || target.token !== token || entry.status !== 'success' || target.message !== message || Chat.messages[target.index] !== message) return;
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
  // Compatibility route only. Player UI never renders request payloads or source decisions.
  const open = () => window.BAOStoryControlCenter?.open?.({effects:true});
  const reset = Chat.reset.bind(Chat);
  Chat.reset = function(...args) { const state = owner(); if (state) { requests.delete(state); sources.delete(state); lastCompleted.delete(state); } return reset(...args); };
  window.BAOContextInspector = Object.freeze({ record, snapshot, open, commitRevision });
})();
