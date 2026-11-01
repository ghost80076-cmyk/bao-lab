/* Per-story and per-model provider policy circuit breaker.
 * This only pauses automatic auxiliary model calls. It neither refunds a
 * verified upstream request nor prevents a player from sending a story turn.
 * No story text, credentials, or raw endpoint URLs are persisted here.
 */
(() => {
  'use strict';
  if (typeof API === 'undefined' || !window || window.BAOProviderPolicyGuard) return;

  const POLICY_REASONS = new Set([
    'SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'CONTENT_FILTER'
  ]);
  const keyFor = config => {
    const model = String(config?.model || '').trim().slice(0, 160);
    // The helper router may fill in type='custom'; keep the identity stable
    // between its preflight route and the effective routed request.
    const provider = String(config?.route ||
      ((config?.type && config.type !== 'custom') ? config.type : (config?.protocol || 'openai'))).trim().slice(0, 48);
    let host = '';
    try { host = new URL(String(config?.baseUrl || '')).host.toLowerCase().slice(0, 100); }
    catch (_) { /* An incomplete BYOK route must not poison the key. */ }
    return { model, provider, host };
  };
  const sameRoute = (entry, key) =>
    entry.model === key.model && entry.provider === key.provider && entry.host === key.host;
  const entriesFor = (owner, create = false) => {
    if (!owner || typeof owner !== 'object') return [];
    if (owner.providerPolicyGuard?.version === 1 && Array.isArray(owner.providerPolicyGuard.entries)) {
      return owner.providerPolicyGuard.entries;
    }
    if (!create) return [];
    owner.providerPolicyGuard = { version: 1, entries: [] };
    return owner.providerPolicyGuard.entries;
  };
  const recordFor = (owner, config, create = false) => {
    const key = keyFor(config);
    if (!key.model) return null;
    const entries = entriesFor(owner, create);
    let item = entries.find(entry => sameRoute(entry, key));
    if (!item && create) {
      item = { ...key, strikes: 0, paused: false, lastBlockAt: '' };
      entries.push(item);
      // Prevent unbounded growth in a long-lived story or imported save.
      if (entries.length > 8) entries.splice(0, entries.length - 8);
    }
    return item || null;
  };
  const isPaused = (owner, config) => Boolean(recordFor(owner, config)?.paused);
  const pausedForStory = owner => entriesFor(owner).filter(entry => entry.paused).map(entry => ({
    model: entry.model, provider: entry.provider
  }));
  const refreshNotice = () => window.BAOChatSystemNotices?.sync?.();
  const onBlocked = (owner, config) => {
    const entry = recordFor(owner, config, true);
    if (!entry) return false;
    entry.strikes = Math.min(2, Math.max(0, Number(entry.strikes) || 0) + 1);
    entry.lastBlockAt = new Date().toISOString();
    entry.paused = entry.strikes >= 2;
    refreshNotice();
    return entry.paused;
  };
  const onSuccess = (owner, config) => {
    const entry = recordFor(owner, config);
    if (!entry || (!entry.strikes && !entry.paused)) return;
    entry.strikes = 0;
    entry.paused = false;
    refreshNotice();
  };
  const reasonFor = result => {
    const reason = String(result?.blockReason || result?.finishReason || result?.finish_reason || '').trim().toUpperCase();
    return POLICY_REASONS.has(reason) ? reason : '';
  };
  // Only the background summary and separate per-turn state tracking are
  // suppressed. Manually invoked notes, Canon, history scans, state rebuilds,
  // and player story turns stay explicit choices (and may incur provider fees).
  const isAutomatic = config => Boolean(config?.__automaticPolicyTask ||
    (config?.__stateTask && !config?.__stateRebuild && !config?.__connectionTest));
  const pausedMessage = model =>
    '供應商已連續兩次阻擋此故事使用的 ' + (model || '模型') +
    '；自動記憶與世界狀態整理已暫停，不會繼續自動呼叫此模型。' +
    '可以修改故事內容、切換整理模型，或自行決定是否手動整理（手動呼叫可能產生費用）。';
  const pauseError = model => {
    const error = new Error(pausedMessage(model));
    error.code = 'BAO_POLICY_CIRCUIT_OPEN';
    return error;
  };
  const wrapper = async (next, config, messages, ...rest) => {
    const owner = window.GameState?.current;
    const key = keyFor(config);
    if (owner && isAutomatic(config) && isPaused(owner, config)) {
      API.noteRequest?.(config?.__memoryTask ? 'memory' : 'state', 'provider-policy-paused');
      throw pauseError(key.model);
    }
    let result;
    try {
      result = await next(config, messages, ...rest);
    } catch (error) {
      if (owner && owner === window.GameState?.current && !config?.__connectionTest &&
          error?.code === 'BAO_PROVIDER_BLOCKED') {
        if (onBlocked(owner, config)) {
          error.message = String(error.message || '供應商拒絕內容。') + '\n' + pausedMessage(key.model);
        }
      }
      throw error;
    }
    if (!owner || owner !== window.GameState?.current || config?.__connectionTest) return result;
    const reason = reasonFor(result);
    if (reason) {
      const paused = onBlocked(owner, config);
      // Some providers supply a real story segment before reporting a safety
      // finish reason. Preserve that visible narration and let the existing
      // merged-state checker reject its incomplete appendix; do not silently
      // discard a paid, readable turn. Synthetic empty-response fallback text
      // must never be mistaken for a valid story.
      const text = String(result?.text || '').trim();
      const placeholder = /^(?:Gemini (?:未產生內容|未產生文字內容|沒有回傳文字內容)|模型沒有回傳內容)/.test(text);
      if (!isAutomatic(config) && !config?.__memoryTask && !config?.__stateTask && text && !placeholder) {
        return result;
      }
      const error = new Error('供應商已拒絕此次內容（' + reason + '），本次不會當成成功的故事或整理結果。' +
        (paused ? '\n' + pausedMessage(key.model) : ''));
      error.code = 'BAO_PROVIDER_BLOCKED';
      error.finishReason = reason;
      throw error;
    }
    if (typeof result?.text === 'string' && result.text.trim()) onSuccess(owner, config);
    return result;
  };
  if (typeof API.wrapSend === 'function') {
    API.wrapSend('provider-policy-guard:circuit', wrapper);
  } else {
    const previous = API.send.bind(API);
    API.send = (config, messages, ...rest) => wrapper(previous, config, messages, ...rest);
  }
  window.BAOProviderPolicyGuard = Object.freeze({
    isPaused, pausedForStory, isAutomatic, pausedMessage
  });
})();
