(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;

  const MEMORY_HEADERS = new Set(["玩家手動記憶", "Context Pack · 玩家已確認的前情", "Canon Core · 玩家已確認"]);
  const DYNAMIC_HEADERS = new Set(["本輪動態角色規則", "目前核心狀態", "本輪相關世界資料", "本輪人物狀態", "本輪相關 Canon"]);
  const headerOf = block => String(block.match(/^【([^】]+)】/)?.[1] || "").trim();
  const cacheMetricKnown = usage => usage?.cached_tokens !== null && usage?.cached_tokens !== undefined && Number.isFinite(Number(usage.cached_tokens));

  const partitionSystemPrompt = prompt => {
    const blocks = String(prompt || "").split(/\n{2,}(?=【[^】]+】)/).map(value => value.trim()).filter(Boolean);
    const stable = [], memory = [], dynamic = [];
    blocks.forEach(block => {
      const header = headerOf(block);
      if (MEMORY_HEADERS.has(header)) memory.push(block);
      else if (DYNAMIC_HEADERS.has(header)) dynamic.push(block);
      else stable.push(block);
    });
    return { stable: stable.join("\n\n"), memory: memory.join("\n\n"), dynamic: dynamic.join("\n\n") };
  };

  const storySessionId = () => {
    if (!window.GameState?.current) return "";
    if (!GameState.current.storySessionId) {
      const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      GameState.current.storySessionId = `bao-lab:${App.activeCharacter?.id || "story"}:${random}`;
    }
    return GameState.current.storySessionId;
  };

  const patchCacheUsageAccounting = () => {
    if (Chat.__cacheUsageAccountingPatched) return;
    const originalAddUsage = typeof Chat.addUsage === "function" ? Chat.addUsage.bind(Chat) : null;
    const originalReset = typeof Chat.reset === "function" ? Chat.reset.bind(Chat) : null;
    const originalRenderUsage = typeof Chat.renderUsage === "function" ? Chat.renderUsage.bind(Chat) : null;
    if (originalAddUsage) Chat.addUsage = function(usage = {}, kind = "all") {
      this.usage = this.usage || {};
      if (!cacheMetricKnown(usage)) this.usage.cachedUnknown = true;
      return originalAddUsage(usage, kind);
    };
    if (originalReset) Chat.reset = function(...args) {
      const result = originalReset(...args);
      this.usage = this.usage || {};
      this.usage.cachedUnknown = false;
      return result;
    };
    if (originalRenderUsage) Chat.renderUsage = function(lastUsage = {}) {
      const result = originalRenderUsage(lastUsage);
      const cacheTotal = document.getElementById("usage-cache-total");
      if (cacheTotal && this.usage?.cachedUnknown) cacheTotal.textContent = "未知";
      return result;
    };
    Chat.__cacheUsageAccountingPatched = true;
  };

  App.buildMessages = async function(config = this.config) {
    const context = await Chat.context(config);
    const latestIndex = context.length - 1;
    const hasLatestUser = latestIndex >= 0 && context[latestIndex]?.role === "user";
    const latest = hasLatestUser ? context[latestIndex] : null;
    const earlier = hasLatestUser ? context.slice(0, latestIndex) : context.slice();
    const parts = partitionSystemPrompt(this.buildSystemPrompt());
    const memorySystems = [];
    const history = [];
    if (parts.memory) memorySystems.push(parts.memory);
    earlier.forEach(message => {
      if (message.role === "system") memorySystems.push(String(message.content || ""));
      else history.push({ role: message.role, content: String(message.content || "") });
    });
    const messages = [{ role: "system", content: parts.stable }];
    if (memorySystems.length) messages.push({ role: "system", content: memorySystems.join("\n\n") });
    messages.push(...history);
    if (latest) {
      const content = [parts.dynamic, `【玩家最新輸入】\n${String(latest.content || "")}`].filter(Boolean).join("\n\n");
      messages.push({ role: "user", content });
    } else if (parts.dynamic) messages.push({ role: "user", content: parts.dynamic });
    return messages;
  };

  App.applyProviderContext = function(apiConfig = {}) {
    const preset = this.getSelectedPreset?.();
    const presetModelMatches = Boolean(preset?.model && preset.model === apiConfig.model);
    const verifiedPreset = presetModelMatches && (preset?.explicit_cache === true || (preset?.route === "official" && preset?.protocol === "anthropic" && preset?.cache === "explicit"));
    const persistedVerification = Boolean(apiConfig.explicitCacheModel && apiConfig.explicitCacheModel === apiConfig.model && apiConfig.cacheMode === "explicit");
    const verifiedExplicit = verifiedPreset || persistedVerification;
    const effective = {
      ...apiConfig,
      route: apiConfig.route || (presetModelMatches ? preset?.route : "custom") || "custom",
      cacheMode: verifiedExplicit ? "explicit" : (apiConfig.cacheMode === "explicit" ? "unknown" : (apiConfig.cacheMode || preset?.cache || "unknown")),
      explicitCacheModel: verifiedExplicit ? apiConfig.model : "",
      cacheEnabled: this.config?.memory?.cache !== false
    };
    if (API.isOpenRouter(effective)) effective.sessionId = storySessionId();
    return effective;
  };

  // Install one permanent wrapper. Never swap API.send while another request is in flight.
  // WeakMap entries contain only sanitized failure metadata, not provider errors or credentials.
  const patchMemoryRequestGuard = () => {
    if (Chat.__memoryRequestGuardPatched || typeof API?.send !== "function" || typeof Chat.maybeSummarize !== "function") return;
    const originalSend = API.send.bind(API);
    const originalSummarize = Chat.maybeSummarize;
    const cooldowns = new WeakMap();
    const failures = new WeakMap();
    const activeStories = new WeakSet();
    const TIMEOUT_MS = 45000;
    const COOLDOWN_MS = 5 * 60 * 1000;
    const AUTH_COOLDOWN_MS = 30 * 60 * 1000;
    const notice = message => {
      const element = document.getElementById("usage-guard");
      if (element) element.title = message;
    };

    API.send = async function(config, messages) {
      if (!config?.__memoryTask) return originalSend(config, messages);
      const story = window.GameState?.current;
      const controller = new AbortController();
      const previousSignal = config.signal;
      const relayAbort = () => controller.abort();
      if (previousSignal?.aborted) controller.abort();
      else previousSignal?.addEventListener?.("abort", relayAbort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
      try {
        return await originalSend({ ...config, signal: controller.signal }, messages);
      } catch (error) {
        const authFailure = /(?:API Key 無效|驗證失敗|沒有使用此模型或 API 的權限|額度|餘額|rate limit|quota)/i.test(String(error?.message || ""));
        if (story) failures.set(story, { authFailure });
        const safeError = new Error(timedOut ? "記憶整理逾時，已暫停背景整理。" : "記憶整理請求失敗，已暫停背景整理。");
        safeError.memoryFailure = true;
        throw safeError;
      } finally {
        clearTimeout(timer);
        previousSignal?.removeEventListener?.("abort", relayAbort);
      }
    };

    Chat.maybeSummarize = async function(config, force = false, recentRounds = null) {
      const story = window.GameState?.current;
      if (!story || activeStories.has(story)) return;
      const blockedUntil = cooldowns.get(story) || 0;
      if (blockedUntil > Date.now()) {
        notice(`記憶整理暫停中，約 ${Math.ceil((blockedUntil - Date.now()) / 60000)} 分鐘後再試。原始對話仍保留。`);
        return;
      }
      activeStories.add(story);
      failures.delete(story);
      const priorSummary = this.summary;
      const priorCursor = this.summarizedUntil;
      try {
        await originalSummarize.call(this, config, force, recentRounds);
        const failure = failures.get(story);
        if (failure) {
          const delay = failure.authFailure ? AUTH_COOLDOWN_MS : COOLDOWN_MS;
          cooldowns.set(story, Date.now() + delay);
          notice(`記憶整理失敗，已暫停 ${Math.ceil(delay / 60000)} 分鐘；原始對話仍保留。`);
        } else if (this.summary !== priorSummary || this.summarizedUntil !== priorCursor) {
          cooldowns.delete(story);
          notice("");
        }
      } finally {
        failures.delete(story);
        activeStories.delete(story);
      }
    };
    Chat.__memoryRequestGuardPatched = true;
  };

  patchCacheUsageAccounting();
  patchMemoryRequestGuard();
  window.BAOPromptCache = { partitionSystemPrompt, storySessionId, cacheMetricKnown };
  // The small Node unit-test DOM has no querySelector/head; load only inside real browsers.
  if (typeof document.querySelector === 'function' && document.head && !document.querySelector('script[src="js/gemini-explicit-cache.js"]')) {
    const script = document.createElement('script');
    script.src = 'js/gemini-explicit-cache.js';
    script.onerror = () => console.warn('BAO/LAB optional Gemini cache controls failed to load');
    document.head.appendChild(script);
  }
})();
