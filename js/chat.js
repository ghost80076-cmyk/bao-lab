const Chat = {
  messages: [],
  usage: { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0 },
  summary: "",
  summarizedUntil: 0,
  summarizing: false,
  summaryTask: null,
  lastStoryPromptTokens: 0,
  contextGuard: { level: "normal", ratio: 0, recentRounds: 0 },
  memoryHealth: { phase: "idle", message: "尚未需要摘要", lastSuccessAt: "", lastFailureAt: "", lastModel: "", repaired: false },
  usageByKind: {},
  usageLedger: [],

  reset() {
    this.messages = [];
    this.usage = { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0 };
    this.summary = "";
    this.summarizedUntil = 0;
    this.summarizing = false;
    this.summaryTask = null;
    this.lastStoryPromptTokens = 0;
    this.contextGuard = { level: "normal", ratio: 0, recentRounds: 0 };
    this.memoryHealth = { phase: "idle", message: "尚未需要摘要", lastSuccessAt: "", lastFailureAt: "", lastModel: "", repaired: false };
    this.usageByKind = {};
    this.usageLedger = [];
    this.renderGuard();
  },

  createMessageId() {
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return `msg-${random}`;
  },
  normalizeMessage(message = {}) {
    const createdAt = String(message.createdAt || '').trim();
    return {
      ...message,
      id: String(message.id || this.createMessageId()),
      role: String(message.role || "assistant"),
      content: String(message.content || ""),
      createdAt: Number.isNaN(Date.parse(createdAt)) ? new Date().toISOString() : createdAt
    };
  },
  ensureMessageIds(messages = this.messages) {
    const seen = new Set();
    const normalized = (Array.isArray(messages) ? messages : []).map(message => {
      const next = this.normalizeMessage(message);
      if (seen.has(next.id)) next.id = this.createMessageId();
      seen.add(next.id);
      return next;
    });
    if (messages === this.messages) this.messages = normalized;
    return normalized;
  },
  add(role, content) {
    const message = this.normalizeMessage({ role, content });
    this.messages.push(message);
    return message;
  },
  modelContent(message = {}) {
    const semantic = String(message?.context_content || "").trim();
    return semantic || String(message?.content || "");
  },
  modelMessages(messages = []) {
    return (Array.isArray(messages) ? messages : []).map(message => {
      if (message?.role !== "assistant" || !String(message?.context_content || "").trim()) return message;
      return { ...message, content: this.modelContent(message) };
    });
  },
  turnCount(messages = this.messages) { return (Array.isArray(messages) ? messages : []).filter(message => message?.role === "user").length; },
  recent(maxRounds, mode) { if (mode === "full") return this.messages; return this.messages.slice(-Math.max(1, maxRounds) * 2); },
  pressure(config) { const limit = Math.max(1, Number(config?.memory?.maxContext || 64000)); return this.lastStoryPromptTokens > 0 ? this.lastStoryPromptTokens / limit : 0; },

  protectedRounds(config) {
    const configured = Math.max(4, Number(config?.memory?.maxRounds || 20));
    const ratio = this.pressure(config);
    let rounds = configured;
    let level = "normal";
    if (ratio >= 0.92) { rounds = Math.max(4, Math.floor(configured * 0.25)); level = "critical"; }
    else if (ratio >= 0.82) { rounds = Math.max(6, Math.floor(configured * 0.45)); level = "high"; }
    else if (ratio >= 0.70) { rounds = Math.max(8, Math.floor(configured * 0.7)); level = "watch"; }
    this.contextGuard = { level, ratio, recentRounds: rounds };
    this.renderGuard();
    return rounds;
  },

  async context(config) {
    const mode = config?.memory?.mode || "rounds";
    const configuredRounds = Math.max(1, Number(config?.memory?.maxRounds || 20));
    if (mode === "full") {
      this.contextGuard = { level: "manual", ratio: this.pressure(config), recentRounds: configuredRounds };
      this.renderGuard();
      return this.modelMessages(this.messages);
    }
    if (mode === "rounds") return this.modelMessages(this.messages.slice(-this.protectedRounds(config) * 2));
    const rounds = this.protectedRounds(config);
    // Integrity invariant: raw source may be omitted only after a successful
    // summary covers it. Under pressure we prefer a larger request (or an
    // explicit provider size error) over silently forgetting unsummarized text.
    const buffer = Math.max(2, Number(config?.memory?.summaryInterval || 4)) * 2;
    const targetStart = Math.max(0, this.messages.length - rounds * 2 - buffer);
    const coveredUntil = this.summary
      ? Math.max(0, Math.min(Number(this.summarizedUntil || 0), this.messages.length))
      : 0;
    const start = Math.min(targetStart, coveredUntil);
    const recent = this.messages.slice(start);
    this.contextGuard = {
      ...this.contextGuard,
      rawStart: start,
      coveredUntil,
      unsummarizedMessages: Math.max(0, this.messages.length - coveredUntil)
    };
    this.renderGuard();
    const result = [];
    if (this.summary) result.push({ role: "system", content: `【長期記憶摘要】\n以下內容是較早對話的壓縮記憶，請保持人物關係、重要事件、承諾、偏好與未解決事項的一致性。\n${this.summary}` });
    result.push(...this.modelMessages(recent));
    return result;
  },

  memoryDiagnostics(config = App?.config) {
    const maxRounds = Math.max(4, Number(config?.memory?.maxRounds || 20));
    const cursor = this.summary ? Math.max(0, Math.min(Number(this.summarizedUntil || 0), this.messages.length)) : 0;
    const eligibleEnd = Math.max(0, this.messages.length - maxRounds * 2);
    const coveredRounds = this.turnCount(this.messages.slice(0, cursor));
    const pendingRounds = this.turnCount(this.messages.slice(cursor, eligibleEnd));
    const recentRounds = this.turnCount(this.messages.slice(cursor));
    return {
      totalRounds: this.turnCount(),
      maxRounds,
      coveredMessages: cursor,
      coveredRounds,
      pendingMessages: Math.max(0, eligibleEnd - cursor),
      pendingRounds,
      recentRounds,
      hasSummary: Boolean(this.summary),
      health: { ...(this.memoryHealth || {}) },
      model: config?.memory?.summaryApiMode !== "same" && config?.memory?.summaryApi?.model && config?.memory?.summaryApi?.baseUrl
        ? config.memory.summaryApi.model : (config?.api?.model || "")
    };
  },

  memoryCompletionError(result) {
    if (window.BAOMemoryCore) return window.BAOMemoryCore.completionError(result);
    const finish = String(result?.finishReason || '').toUpperCase();
    if (result?.blockReason || /^(SAFETY|PROHIBITED_CONTENT|BLOCKLIST|SPII|CONTENT_FILTER|IMAGE_SAFETY)$/.test(finish))
      return '供應商回報記憶輸出遭阻擋；保留原摘要與原始對話。';
    if (/^(MAX_TOKENS|LENGTH|MAX_OUTPUT_TOKENS|MAX_COMPLETION_TOKENS)$/.test(finish))
      return '記憶輸出已截斷；保留原摘要與原始對話，未標記為已整理。';
    return '';
  },

  async normalizeMemoryResult(summaryConfig, raw, isCurrent = null) {
    const first = window.BAOHelperData.memoryText(raw || "");
    if (first) return { summary: first, repaired: false, error: "" };
    const source = String(raw || "").trim();
    if (!source || /沒有回傳(?:可顯示的)?(?:文字)?內容|沒有回傳整理內容/.test(source)) {
      return { summary: "", repaired: false, error: "模型沒有回傳可用的記憶內容。" };
    }
    try {
      const repairConfig = { ...summaryConfig, __memoryTask: true, __memoryTaskKind: 'repair', __memoryRepairTask: true, cacheEnabled: false, maxOutputTokens: Math.min(1400, Number(summaryConfig?.maxOutputTokens || 1400)) };
      const repairMessages = [
          { role: "system", content: "你是 JSON 修復器。只修正格式，不新增、不推測任何故事事實。" },
          { role: "user", content: `請把以下內容轉成指定 JSON；只輸出 JSON。\n\n${window.BAOHelperData.memoryRules}\n\n【待修復輸出】\n${source.slice(0, 12000)}` }
        ];
      const repair = window.BAOMemoryCore
        ? await window.BAOMemoryCore.request(repairConfig, repairMessages, (...args) => API.send(...args), { isCurrent })
        : await API.send(repairConfig, repairMessages);
      const completionError = this.memoryCompletionError(repair);
      if (completionError) return { summary: '', repaired: true, error: completionError };
      const repaired = window.BAOHelperData.memoryText(repair?.text || "");
      return repaired
        ? { summary: repaired, repaired: true, error: "" }
        : { summary: "", repaired: true, error: "模型回覆仍不符合記憶 JSON 格式。" };
    } catch (error) {
      return { summary: "", repaired: true, error: String(error?.message || "記憶 JSON 修復失敗。") };
    }
  },

  async maybeSummarize(config, force = false, recentRounds = null) {
    if (this.summarizing || config?.demoMode) { API.noteRequest?.('memory',config?.demoMode?'local-preview':'busy'); return; }
    const configuredRounds = Math.max(4, Number(config?.memory?.maxRounds || 20));
    const rounds = Math.max(4, Number(recentRounds || configuredRounds));
    const keepMessages = rounds * 2;
    const overflow = this.messages.length - keepMessages;
    const interval = Math.max(2, Number(config?.memory?.summaryInterval || 4)) * 2;
    if (overflow - this.summarizedUntil < (force ? 4 : interval)) { API.noteRequest?.('memory','threshold'); return; }
    // A saved summaryModel without an explicit separate route is legacy metadata.
    // In "same" mode it must never overwrite the active provider's model ID.
    const separateMemory = config?.memory?.summaryApiMode !== "same" &&
      Boolean(config?.memory?.summaryApi?.model && config?.memory?.summaryApi?.baseUrl);
    let memoryApi;
    try { memoryApi = window.BAOMemoryCore ? window.BAOMemoryCore.resolve(config) : separateMemory ? config.memory.summaryApi : config?.api; }
    catch (error) {
      this.memoryHealth = { ...(this.memoryHealth || {}), phase: 'failed', message: error.message, lastFailureAt: new Date().toISOString() };
      return;
    }
    window.BAOCreditsPilot?.prepareAccountConfig?.(memoryApi);
    if (!memoryApi?.key && !window.BAOCreditsPilot?.isAccountReady?.(memoryApi)) {
      API.noteRequest?.('memory','not-connected');
      this.memoryHealth = {
        ...(this.memoryHealth || {}),
        phase: "failed",
        message: "記憶整理模型尚未連線；原始對話仍完整保留。",
        lastFailureAt: new Date().toISOString(),
        lastModel: memoryApi?.model || ""
      };
      return;
    }
    let end = Math.max(this.summarizedUntil, this.messages.length - keepMessages);
    if (force && end <= this.summarizedUntil && this.messages.length > 12) end = Math.max(this.summarizedUntil, this.messages.length - Math.max(8, keepMessages));
    const start = this.summarizedUntil;
    const owner = window.GameState?.current;
    const previousSummary = this.summary;
    // Bound each incremental request; never advance past unprocessed source.
    const charBudget = Math.max(4000, Number(config?.memory?.summaryChunkChars || 24000));
    let chars = 0;
    let boundedEnd = start;
    // Only summarize fully observed turns. Truncating after a player action
    // but before the assistant result can turn an attempt into a false fact.
    // Keep the source in raw context when the next completed turn is too large
    // for the configured budget; never silently advance the summary cursor.
    for (let i = start; i < end; i++) {
      const size = this.modelContent(this.messages[i]).length;
      if (i > start && chars + size > charBudget) break;
      chars += size;
      if (this.messages[i]?.role === "assistant") boundedEnd = i + 1;
    }
    if (boundedEnd === start) {
      this.memoryHealth = {
        ...(this.memoryHealth || {}),
        phase: "failed",
        message: "本輪完整對話超出記憶整理預算；未裁切未完成的行動及結果，原始對話會繼續保留。",
        lastFailureAt: new Date().toISOString(),
        lastModel: memoryApi?.model || ""
      };
      return;
    }
    end = boundedEnd;
    this.ensureMessageIds();
    let chunk = this.messages.slice(start, end);
    let sourceSignature = JSON.stringify(chunk.map(m => [m.id, m.content, m.context_content || ""]));
    if (!chunk.length) return;
    // Both story ownership and the active task matter: reset may start another
    // summary before an old provider request (or its repair) settles.
    const task = {};
    this.summaryTask = task;
    const isCurrent = () => this.summaryTask === task && window.GameState?.current === owner
      && this.summary === previousSummary && this.summarizedUntil === start
      && JSON.stringify(this.messages.slice(start, end).map(m => [m.id, m.content, m.context_content || ""])) === sourceSignature;
    this.summarizing = true;
    this.memoryHealth = {
      ...(this.memoryHealth || {}),
      phase: "running",
      message: `正在整理 ${this.turnCount(chunk)} 輪舊對話。`,
      lastModel: memoryApi?.model || "",
      repaired: false
    };
    const progress = window.BAOChatSystemNotices?.beginMemoryProgress?.('正在整理較早劇情；成功後會更新自動摘要，原始對話仍保留。', owner);
    try {
      let result;
      let summaryConfig;
      for (let attempt = 0; attempt < 3; attempt++) {
        const transcript = chunk.map(m => `[${m.id}] ${m.role === "user" ? "玩家" : "角色/系統"}：${m.role === "assistant" ? this.modelContent(m) : m.content}`).join("\n\n");
        const prompt = [
          "你是角色扮演長期記憶整理器。",
          "請把舊對話壓縮成精簡但可延續劇情的記憶。",
          "保留已發生事件、已知資訊、明確關係、承諾、物品與目標。玩家偏好只能記錄玩家明說的內容；不得把 AI 推測的心理當作事實。",
          window.BAOHelperData.memoryRules,
          config?.memory?.episodicRecall === false ? "" : window.BAOEpisodicMemory?.rules,
          config?.memory?.episodicRecall === false || !window.BAOEpisodicMemory ? "" : `【近期事件索引（僅供明確更正時引用 ID，不可當作本次新證據）】\n${JSON.stringify(window.BAOEpisodicMemory.updateContext(owner))}`,
          "刪除重複修辭、寒暄與不影響後續的細節。不要加入原文沒有的資訊，不要寫分析過程。",
          `【本次完整 JSON 輸出預算】四類長期摘要各最多 ${attempt ? 6 : 8} 項、每項最多 80 字；episodes 與 knowledgeUpdates 各最多 ${attempt ? 2 : 4} 筆。每筆事件的 knowledge 最多 2 筆，每筆 text／claim 最多 60 字，entities／keywords／evidenceIds 各最多 3 項。無新證據可用空陣列。這些上限優先於前述格式的較寬上限；精簡重複內容，保留仍有效的重要事實，必須完成整個 JSON，不可只輸出開頭。`,
          this.summary ? `【既有摘要】\n${this.summary}` : "",
          `【待整理舊對話】\n${transcript}`,
          force ? "目前 Context 使用率偏高，請進一步壓縮，輸出新的完整摘要，盡量控制在 600～1200 字。" : "請輸出新的完整長期記憶摘要，建議 800～1600 字以內。"
        ].filter(Boolean).join("\n\n");
        summaryConfig = { ...(window.BAOMemoryCore ? window.BAOMemoryCore.config(config, 'summary', App.modelPresets || []) : { ...memoryApi, __memoryTask: true, cacheEnabled: false, maxOutputTokens: 8192 }),
          ...(config?.memory?.episodicRecall !== false && window.BAOEpisodicMemory ? { __responseSchema: window.BAOEpisodicMemory.schema } : {}) };
        window.BAOCreditsPilot?.prepareAccountConfig?.(summaryConfig);
        const requestMessages = [{ role: "system", content: "你是 Observer，不是作者。只輸出記憶規格 JSON，不要續寫故事或模仿正文文風。" }, { role: "user", content: prompt }];
        if (window.BAOMemoryCore && !window.BAOMemoryCore.fits(summaryConfig, requestMessages)) {
          const completed = chunk.map((m, i) => m.role === 'assistant' ? i + 1 : 0).filter(n => n > 0 && n < chunk.length);
          const smaller = completed.filter(n => n <= Math.ceil(chunk.length / 2)).pop();
          if (!smaller) throw new Error('本輪完整對話與既有摘要超出整理模型預算；原文與進度保留。');
          end = start + smaller; chunk = this.messages.slice(start, end);
          sourceSignature = JSON.stringify(chunk.map(m => [m.id, m.content, m.context_content || ""]));
          attempt--; continue;
        }
        result = window.BAOMemoryCore
          ? await window.BAOMemoryCore.request(summaryConfig, requestMessages, (...args) => API.send(...args), { allowIncomplete: true, isCurrent })
          : await API.send(summaryConfig, requestMessages);
        if (!isCurrent()) return;
        this.memoryHealth = {
          ...this.memoryHealth,
          lastFinishReason: String(result?.finishReason || '未回報').slice(0, 40),
          lastRequestedOutputTokens: summaryConfig.maxOutputTokens,
          lastEffectiveOutputTokens: result?.outputBudget?.effective ?? null,
          lastBudgetSource: result?.outputBudget?.source || '未回報',
          lastReasoningTokens: result?.usage?.reasoning_tokens ?? result?.credits?.reasoning_tokens ?? null,
          lastRequestId: String(result?.credits?.request_id || '').slice(0, 80),
          lastOutputTokens: result?.usage?.output_tokens ?? result?.usage?.completion_tokens ?? null,
          lastResponseChars: String(result?.text || '').length,
          lastChunkTurns: this.turnCount(chunk),
          lastAttempt: attempt + 1
        };
        const completionError = this.memoryCompletionError(result);
        if (!completionError) break;
        const truncated = /^(MAX_TOKENS|LENGTH|MAX_OUTPUT_TOKENS|MAX_COMPLETION_TOKENS)$/.test(String(result?.finishReason || '').toUpperCase());
        if (!truncated || attempt === 2) throw new Error(completionError);
        // Retry only complete exchanges; a rejected output never advances coverage.
        const completed = chunk.map((m, i) => m.role === "assistant" ? i + 1 : 0).filter(Boolean);
        const smaller = completed.filter(n => n < chunk.length && n <= Math.ceil(chunk.length / 2)).pop();
        if (!smaller) throw new Error(completionError);
        end = start + smaller;
        chunk = this.messages.slice(start, end);
        sourceSignature = JSON.stringify(chunk.map(m => [m.id, m.content, m.context_content || ""]));
        this.memoryHealth = { ...this.memoryHealth, message: `摘要輸出截斷，正在縮小範圍重試（${attempt + 1}/2）。` };
      }
      const normalized = await this.normalizeMemoryResult(summaryConfig, result?.text || "", isCurrent);
      if (!isCurrent()) return;
      const summary = normalized.summary;
      if (!summary) {
        API.noteRequest?.('memory','invalid-output');
        this.memoryHealth = {
          ...(this.memoryHealth || {}),
          phase: "failed",
          message: normalized.error || "記憶整理沒有產生可用摘要；原始對話仍完整保留。",
          lastFailureAt: new Date().toISOString(),
          lastModel: summaryConfig.model || config?.api?.model || "",
          repaired: Boolean(normalized.repaired)
        };
        return;
      }
      // Event indexing is optional. A malformed episode must not invalidate
      // an otherwise valid paid summary and cause the same chunk to be billed
      // again on the next turn. Retain the existing event index on error.
      let episodeWarning = "";
      if (owner && !normalized.repaired && config?.memory?.episodicRecall !== false) {
        try {
          window.BAOEpisodicMemory?.ingest(owner, window.BAOHelperData.parse(result?.text || ""), chunk);
        } catch (episodeError) {
          episodeWarning = "事件索引暫時未更新；長期摘要仍已保存。";
          console.warn("BAO/LAB episode indexing failed:", episodeError);
        }
      }
      this.summary = summary;
      this.summarizedUntil = end;
      this.memoryHealth = {
        ...(this.memoryHealth || {}),
        phase: "success",
        message: `摘要成功，已覆蓋 ${this.turnCount(this.messages.slice(0, end))} 輪。${episodeWarning ? " " + episodeWarning : ""}`,
        lastSuccessAt: new Date().toISOString(),
        lastModel: summaryConfig.model || config?.api?.model || "",
        repaired: Boolean(normalized.repaired)
      };
      if (owner) owner.memory = [summary];
    } catch (err) {
      if (!isCurrent()) return;
      this.memoryHealth = {
        ...(this.memoryHealth || {}),
        phase: "failed",
        message: String(err?.message || "記憶整理失敗；原始對話仍完整保留。").slice(0, 220),
        lastFailureAt: new Date().toISOString(),
        lastModel: memoryApi?.model || ""
      };
      console.warn("BAO/LAB memory summary failed:", err);
    }
    finally {
      window.BAOChatSystemNotices?.endMemoryProgress?.(progress);
      if (this.summaryTask === task) {
        this.summaryTask = null;
        this.summarizing = false;
      }
    }
  },

  async afterTurn(config) {
    if (config?.memory?.mode !== "smart" || config?.demoMode) { API.noteRequest?.('memory',config?.demoMode?'local-preview':'memory-mode'); return; }
    const rounds = this.protectedRounds(config);
    await this.maybeSummarize(config, ["high", "critical"].includes(this.contextGuard.level), rounds);
  },

  usageKind(config = {}) {
    if (config?.__memoryTask) return config.__memoryRepairTask ? "memory-repair" : "memory";
    if (config?.__stateTask) return "state";
    if (config?.__inspirationTask) return "action-inspiration";
    if (config?.__storyTool) return "story-tool";
    if (config?.__auxiliaryTask) return "auxiliary";
    return "chat";
  },
  captureUsageContext() {
    return { owner: typeof GameState !== "undefined" ? GameState.current : window.GameState?.current, usage: this.usage,
      usageByKind: this.usageByKind, usageLedger: this.usageLedger };
  },
  isUsageContextCurrent(context) {
    const owner = typeof GameState !== "undefined" ? GameState.current : window.GameState?.current;
    return !context || (owner === context.owner
      && this.usage === context.usage && this.usageByKind === context.usageByKind && this.usageLedger === context.usageLedger);
  },
  addUsage(usage = {}, kind = "all", context = this) {
    const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
    const prompt = known(usage.input_tokens ?? usage.prompt_tokens) ? Number(usage.input_tokens ?? usage.prompt_tokens) : 0;
    const completion = known(usage.output_tokens ?? usage.completion_tokens) ? Number(usage.output_tokens ?? usage.completion_tokens) : 0;
    const cached = known(usage.cached_tokens) ? Number(usage.cached_tokens) : 0;
    const cacheWrite = known(usage.cache_write_tokens) ? Number(usage.cache_write_tokens) : 0;
    const total = known(usage.total_tokens) ? Number(usage.total_tokens) : (prompt + completion);
    context.usage.prompt += prompt; context.usage.completion += completion; context.usage.cached += cached; context.usage.cacheWrite = Number(context.usage.cacheWrite || 0) + cacheWrite; context.usage.total += total;
    if (kind && kind !== "all") {
      const bucket = context.usageByKind[kind] || { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0, calls: 0 };
      bucket.prompt += prompt; bucket.completion += completion; bucket.cached += cached; bucket.cacheWrite += cacheWrite; bucket.total += total; bucket.calls += 1;
      context.usageByKind[kind] = bucket;
    }
    return { ...context.usage };
  },
  recordRequestUsage(config = {}, result = {}, context = this) {
    if (result && result.__baoUsageRecorded) return result.__baoUsageEntry || null;
    const kind = this.usageKind(config);
    const usage = result?.usage || {};
    this.addUsage(usage, kind, context);
    const number = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
    const input = number(usage.input_tokens ?? usage.prompt_tokens);
    const output = number(usage.output_tokens ?? usage.completion_tokens);
    const cached = number(usage.cached_tokens);
    const cacheWrite = number(usage.cache_write_tokens);
    const chargedUsd = number(result?.credits?.charged_usd);
    const chargedMicrousd = number(result?.credits?.charged_microusd);
    const actualUsd = chargedUsd !== null
      ? chargedUsd
      : chargedMicrousd !== null
        ? chargedMicrousd / 1000000
        : number(result?.credits?.actual_cost_usd);
    const entry = {
      kind,
      model: String(config?.model || ""),
      type: String(config?.type || ""),
      route: String(config?.route || ""),
      baseUrl: String(config?.baseUrl || ""),
      input,
      output,
      cached,
      cacheWrite,
      actualUsd,
      pricing: config?.pricing && typeof config.pricing === "object" ? { ...config.pricing } : null,
      at: new Date().toISOString()
    };
    context.usageLedger.push(entry);
    if (context.usageLedger.length > 10000) context.usageLedger.splice(0, context.usageLedger.length - 10000);
    if (result && typeof result === "object") {
      try {
        Object.defineProperty(result, "__baoUsageRecorded", { value: true, configurable: true });
        Object.defineProperty(result, "__baoUsageEntry", { value: entry, configurable: true });
      } catch {
        result.__baoUsageRecorded = true;
        result.__baoUsageEntry = entry;
      }
    }
    return entry;
  },
  recordStoryUsage(usage = {}, config = null) { const input = usage.input_tokens ?? usage.prompt_tokens; if (input !== null && input !== undefined) this.lastStoryPromptTokens = Number(input || 0); if (config) this.protectedRounds(config); },
  renderTurnUsage(usage = {}) {
    const format = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? "未知" : Number(value).toLocaleString();
    const input = usage.input_tokens ?? usage.prompt_tokens;
    const output = usage.output_tokens ?? usage.completion_tokens;
    const cached = usage.cached_tokens;
    const fresh = usage.new_input_tokens ?? (input != null && cached != null ? Math.max(0, Number(input) - Number(cached)) : null);
    const context = document.getElementById("usage-context"), turn = document.getElementById("usage-turn"), cache = document.getElementById("usage-cache");
    if (context) context.textContent = format(input);
    if (turn) turn.textContent = `新增輸入 ${format(fresh)} · 輸出 ${format(output)}`;
    if (cache) cache.textContent = format(cached);
  },
  renderUsage(lastUsage = {}) {
    const total = document.getElementById("usage-total"), input = document.getElementById("usage-input-total"), output = document.getElementById("usage-output-total"), cacheTotal = document.getElementById("usage-cache-total");
    if (total) total.textContent = `${this.usage.total.toLocaleString()} tok`;
    if (input) input.textContent = `${this.usage.prompt.toLocaleString()} tok`;
    if (output) output.textContent = `${this.usage.completion.toLocaleString()} tok`;
    if (cacheTotal) cacheTotal.textContent = `${this.usage.cached.toLocaleString()} tok`;
    const prompt = Number(lastUsage.input_tokens ?? lastUsage.prompt_tokens ?? 0), limit = Number(App?.config?.memory?.maxContext || 0);
    if (prompt && limit) { const percent = Math.min(999, (prompt / limit) * 100); const context = document.getElementById("usage-context"); if (context) context.textContent = `${prompt.toLocaleString()} tok · 夜灣管理預算 ${limit.toLocaleString()} (${percent.toFixed(1)}%)`; }
  },
  renderGuard() {
    const el = document.getElementById("usage-guard"); if (!el) return;
    const { level, ratio, recentRounds } = this.contextGuard, pct = ratio > 0 ? `${(ratio * 100).toFixed(0)}%` : "—";
    const labels = { normal:`正常 · 保留 ${recentRounds || "—"} 輪`, watch:`輸入預算 ${pct} · 準備整理`, high:`輸入預算 ${pct} · 摘要保護 ${recentRounds} 輪`, critical:`輸入預算 ${pct} · 強制摘要；未摘要原文不裁切`, manual:"完整上下文 · 不自動裁切" };
    el.textContent = labels[level] || labels.normal; el.dataset.level = level;
  },
  memoryStatus(maxRounds) {
    const rounds = this.turnCount();
    if (App?.config?.memory?.mode === "smart") {
      const diag = this.memoryDiagnostics(App.config);
      if (this.summarizing || diag.health.phase === "running") return `${rounds} 輪 · 整理中`;
      if (diag.health.phase === "failed") {
        const retryAt = Date.parse(diag.health.cooldownUntil || "");
        return `${rounds} 輪 · ${Number.isFinite(retryAt) && retryAt > Date.now() ? "摘要暫停待重試" : "摘要失敗"}`;
      }
      if (this.summary) return `${rounds} 輪 · 已摘要 ${diag.coveredRounds} 輪`;
      if (diag.pendingRounds > 0) return `${rounds} 輪 · 待整理 ${diag.pendingRounds} 輪`;
      return `${rounds} 輪 · 近期原文`;
    }
    return `${rounds}/${maxRounds}`;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const bar = document.querySelector(".usage-bar");
    if (bar && !document.getElementById("usage-total")) bar.insertAdjacentHTML("beforeend", '<span>累積 <b id="usage-total">0 tok</b></span><span>輸入累積 <b id="usage-input-total">0 tok</b></span><span>輸出累積 <b id="usage-output-total">0 tok</b></span><span>Cache 累積 <b id="usage-cache-total">0 tok</b></span><span>Context Guard <b id="usage-guard">正常</b></span>');
    if (typeof API !== "undefined" && !API.__baoUsageWrapped) {
      const requestUsageWrapper = async (next, config, messages) => {
        const context = Chat.captureUsageContext();
        const storyConfig = App?.config;
        const result = await next(config, messages);
        if (config?.__connectionTest) return result;
        Chat.recordRequestUsage(config || {}, result || {}, context);
        if (!Chat.isUsageContextCurrent(context)) return result;
        Chat.renderUsage(result?.usage || {});
        if (!config?.__memoryTask && !config?.__stateTask && !config?.__auxiliaryTask && !config?.__storyTool) {
          Chat.recordStoryUsage(result?.usage || {}, storyConfig);
        }
        return result;
      };
      if (typeof API.wrapSend === "function") {
        API.wrapSend("chat:request-usage", requestUsageWrapper);
      } else {
        // Compatibility for an older cached api.js without named registration.
        const originalSend = API.send.bind(API);
        API.send = (config, messages) => requestUsageWrapper(originalSend, config, messages);
      }
      API.__baoUsageWrapped = true;
    }
    const apiStep = document.querySelector('[data-step-panel="4"]');
    if (apiStep && !document.getElementById("test-api")) {
      const row = document.createElement("div"); row.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px"; row.innerHTML = '<button id="test-api" type="button" class="secondary">⚡ 測試 API 連線</button><span id="api-test-status" class="note">尚未測試</span>'; apiStep.appendChild(row);
      document.getElementById("test-api").addEventListener("click", async () => {
        const btn = document.getElementById("test-api"), status = document.getElementById("api-test-status"), config = App.collectConfig();
        if (!config.api.model || !config.api.baseUrl || !config.api.key) { status.textContent = "✕ 請先完成模型代號（Model ID）、連線網址（Base URL）與連線金鑰（API Key）"; return; }
        btn.disabled = true; status.textContent = "測試中…";
        try { const result = await API.test(config.api); status.textContent = `✓ 主模型連線成功${result?.usage?.total_tokens ? ` · ${result.usage.total_tokens} tok` : ""}`; }
        catch (err) { status.textContent = `✕ ${String(err.message || err).split("\n")[0]}`; }
        finally { btn.disabled = false; }
      });
    }
  }, 0);
});
