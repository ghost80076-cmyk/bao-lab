/* Shared, provider-neutral memory planning. No storage or network side effects. */
(function(root, factory) {
  const core = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.BAOMemoryCore = core;
})(typeof window !== 'undefined' ? window : globalThis, function(root) {
  'use strict';
  const defaults = Object.freeze({ summary: 8192, notes: 4096, 'canon-extract': 2200, 'canon-merge': 2600, 'canon-final': 3200, 'context-pack': 4096, repair: 1400 });
  const positive = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0;
  const url = value => String(value || '').trim().replace(/\/+$/, '');
  const bytes = value => {
    let count = 0;
    for (const char of String(value || '')) {
      const point = char.codePointAt(0);
      count += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
    }
    return count;
  };
  // A conservative planning estimate, never a claim about a model's tokenizer.
  const tokens = value => Math.ceil(bytes(typeof value === 'string' ? value : JSON.stringify(value)) / 2);
  const fingerprint = value => {
    const text = String(value || '');
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ text.charCodeAt(i); }
    return `${text.length}:${a >>> 0}:${b >>> 0}`;
  };
  function resolve(story = {}) {
    const main = story.api || {};
    const memory = story.memory || {};
    if (String(memory.summaryApiMode || '').trim() === 'same') return { ...main };
    const route = memory.summaryApi;
    if (!route?.model || !route?.baseUrl) {
      if (memory.summaryApiMode === 'separate') throw new Error('獨立記憶模型尚未設定完成，請重新連接。');
      return { ...main };
    }
    const protocol = route.protocol || (route.type === 'gemini' ? 'gemini' : route.type === 'anthropic' ? 'anthropic'
      : url(route.baseUrl) === url(main.baseUrl) ? main.protocol || 'openai' : 'openai');
    const sameEndpoint = url(route.baseUrl) === url(main.baseUrl) && protocol === (main.protocol || 'openai');
    const transport = sameEndpoint && !route.type && !route.route && route.local === undefined ? main : route;
    const local = transport.local === true || transport.type === 'lmstudio' || transport.route === 'local';
    if (!sameEndpoint && (!route.key || (main.key && route.key === main.key)) && !local)
      throw new Error('獨立記憶 API 尚未連接自己的 Key，請到故事 API 設定重新輸入。');
    return { ...route, type: transport.type || (local ? 'lmstudio' : 'custom'), protocol,
      route: transport.route || (local ? 'local' : ''), local,
      key: route.key || (sameEndpoint ? main.key : '') };
  }
  function config(story, kind, presets = [], options = {}) {
    const route = resolve(story);
    const preset = presets.find(item => item.model === route.model && url(item.base_url || item.baseUrl) === url(route.baseUrl));
    const bound = route.capabilitiesSource;
    const matches = !bound || (bound.model === route.model && url(bound.baseUrl) === url(route.baseUrl) && (bound.protocol || 'openai') === (route.protocol || 'openai'));
    const capabilities = { ...(preset?.capabilities || {}), ...(matches ? route.capabilities || {} : {}), ...(root?.BAOModelDiscovery?.capabilitiesFor?.(route) || {}) };
    const policy = { ...(preset?.memory_policy || {}), ...(route.memory_policy || {}) };
    const requested = positive(options.maxOutputTokens) || positive(policy.outputTokens?.[kind]) || defaults[kind] || defaults.summary;
    const cap = positive(capabilities.maxOutputTokens);
    const context = positive(capabilities.contextWindowTokens);
    return { ...route, ...options, __memoryTask: true, __memoryTaskKind: kind, __memoryRouteResolved: true,
      __memoryContextTokens: context,
      __memoryInputTokens: Math.min(positive(policy.inputTokens) || 12000, positive(capabilities.maxInputTokens) || Infinity),
      __memoryThinking: policy.thinking || null,
      __memoryRequestedOutput: requested,
      maxOutputTokens: Math.min(requested, cap || Infinity, context ? Math.max(64, Math.floor(context * .4)) : Infinity),
      cacheEnabled: false };
  }
  function inputLimit(config) {
    const context = positive(config.__memoryContextTokens);
    const input = positive(config.__memoryInputTokens) || 12000;
    return context ? Math.min(input, context - positive(config.maxOutputTokens) - Math.max(128, Math.min(1024, Math.floor(context * .1)))) : input;
  }
  function fits(config, messages) {
    return tokens(messages) <= inputLimit(config) && bytes(JSON.stringify(messages)) <= 180000;
  }
  function sourceBudget(config, messages) {
    const remaining = inputLimit(config) - tokens(messages) - 128;
    if (remaining < 128) throw new Error('記憶指令與既有摘要已佔滿整理預算，請縮短摘要或改用較大容量的整理模型。');
    return remaining;
  }
  function prefix(text, budget) {
    let low = 0, high = Math.min(text.length, Math.max(0, Math.floor(budget * 2)));
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (tokens(text.slice(0, mid)) <= budget) low = mid; else high = mid - 1;
    }
    if (low > 0 && /[\uD800-\uDBFF]/.test(text[low - 1])) low--;
    if (!low && text) throw new Error('記憶整理預算不足以容納來源文字。');
    if (low < text.length) {
      const part = text.slice(0, low), boundary = Math.max(part.lastIndexOf('\n\n'), part.lastIndexOf('。'), part.lastIndexOf('\n'));
      if (boundary >= low * .6) low = boundary + 1;
    }
    return text.slice(0, low);
  }
  function completionError(result) {
    const reason = String(result?.finishReason || '').toUpperCase();
    if (result?.blockReason || /^(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII|CONTENT_FILTER|IMAGE_SAFETY)$/.test(reason))
      return '供應商回報記憶輸出遭阻擋；保留原摘要與原始對話。';
    if (/^(MAX_TOKENS|LENGTH|MAX_OUTPUT_TOKENS|MAX_COMPLETION_TOKENS)$/.test(reason))
      return '記憶輸出已截斷；保留原摘要與原始對話，未標記為已整理。';
    return '';
  }
  function assertCurrent(isCurrent) {
    if (isCurrent && !isCurrent()) throw Object.assign(new Error('故事或整理來源已變更，已停止寫入。'), { code: 'BAO_MEMORY_STALE' });
  }
  async function request(config, messages, send, options = {}) {
    assertCurrent(options.isCurrent);
    if (!fits(config, messages)) throw new Error('本批記憶內容超出整理模型預算；尚未送出，原資料與完成進度保留。');
    const result = await send(config, messages);
    assertCurrent(options.isCurrent);
    const error = completionError(result);
    if (error && !options.allowIncomplete) throw Object.assign(new Error(error), { code: 'BAO_MEMORY_INCOMPLETE' });
    return result;
  }
  function mergeBatch(config, items, makeMessages, max = 6) {
    const batch = [];
    for (const item of items.slice(0, max)) {
      if (!fits(config, makeMessages(batch.concat(item)))) break;
      batch.push(item);
    }
    if (!batch.length || (items.length > 1 && batch.length < 2)) throw new Error('整理稿合併後超出模型預算，請縮短整理稿或改用較大容量的整理模型；完成進度保留。');
    return batch;
  }
  async function foldText({ source, config, checkpoint = {}, makeMessages, send, normalize, save, isCurrent, onProgress = () => {}, maxCalls = 8 }) {
    let offset = positive(checkpoint.offset), summary = String(checkpoint.summary || ''), completed = positive(checkpoint.completed);
    if (offset > source.length || (offset > 0 && !summary)) throw new Error('整理進度與來源不一致，請重新選擇來源範圍。');
    let calls = 0;
    while (offset < source.length && calls < maxCalls) {
      assertCurrent(isCurrent);
      let budget = sourceBudget(config, makeMessages('', summary));
      let chunk = prefix(source.slice(offset), budget);
      while (!fits(config, makeMessages(chunk, summary))) {
        budget = Math.floor(budget / 2);
        chunk = prefix(source.slice(offset), budget);
      }
      onProgress({ completed, offset, total: source.length });
      const result = await request(config, makeMessages(chunk, summary), send, { isCurrent });
      const next = await normalize(result);
      assertCurrent(isCurrent);
      if (!next) throw new Error('模型沒有產生完整可用的整理稿；完成進度保留。');
      offset += chunk.length; summary = next; completed++; calls++;
      await save({ offset, summary, completed });
    }
    return { offset, summary, completed, complete: offset === source.length };
  }
  return { resolve, config, tokens, bytes, fingerprint, fits, inputLimit, sourceBudget, prefix, completionError, request, mergeBatch, foldText };
});
