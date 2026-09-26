const Chat = {
  messages: [],
  usage: { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0 },
  summary: "",
  summarizedUntil: 0,
  summarizing: false,
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
    return {
      ...message,
      id: String(message.id || this.createMessageId()),
      role: String(message.role || "assistant"),
      content: String(message.content || "")
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
      return [...this.messages];
    }
    if (mode === "rounds") return this.messages.slice(-this.protectedRounds(config) * 2);
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
    result.push(...recent);
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
      model: config?.memory?.summaryApi?.model || config?.memory?.summaryModel || config?.api?.model || ""
    };
  },

  async normalizeMemoryResult(summaryConfig, raw) {
    const first = window.BAOHelperData.memoryText(raw || "");
    if (first) return { summary: first, repaired: false, error: "" };
    const source = String(raw || "").trim();
    if (!source || /沒有回傳(?:可顯示的)?(?:文字)?內容|沒有回傳整理內容/.test(source)) {
      return { summary: "", repaired: false, error: "模型沒有回傳可用的記憶內容。" };
    }
    try {
      const repair = await API.send(
        { ...summaryConfig, __memoryTask: true, __memoryRepairTask: true, cacheEnabled: false, maxOutputTokens: Math.min(1400, Number(summaryConfig?.maxOutputTokens || 1400)) },
        [
          { role: "system", content: "你是 JSON 修復器。只修正格式，不新增、不推測任何故事事實。" },
          { role: "user", content: `請把以下內容轉成指定 JSON；只輸出 JSON。\n\n${window.BAOHelperData.memoryRules}\n\n【待修復輸出】\n${source.slice(0, 12000)}` }
        ]
      );
      const repaired = window.BAOHelperData.memoryText(repair?.text || "");
      return repaired
        ? { summary: repaired, repaired: true, error: "" }
        : { summary: "", repaired: true, error: "模型回覆仍不符合記憶 JSON 格式。" };
    } catch (error) {
      return { summary: "", repaired: true, error: String(error?.message || "記憶 JSON 修復失敗。") };
    }
  },

  async maybeSummarize(config, force = false, recentRounds = null) {
    if (this.summarizing || config?.demoMode || !config?.api?.key) return;
    const configuredRounds = Math.max(4, Number(config?.memory?.maxRounds || 20));
    const rounds = Math.max(4, Number(recentRounds || configuredRounds));
    const keepMessages = rounds * 2;
    const overflow = this.messages.length - keepMessages;
    const interval = Math.max(2, Number(config?.memory?.summaryInterval || 4)) * 2;
    if (overflow - this.summarizedUntil < (force ? 4 : interval)) return;
    let end = Math.max(this.summarizedUntil, this.messages.length - keepMessages);
    if (force && end <= this.summarizedUntil && this.messages.length > 12) end = Math.max(this.summarizedUntil, this.messages.length - Math.max(8, keepMessages));
    const start = this.summarizedUntil;
    const owner = window.GameState?.current;
    const previousSummary = this.summary;
    // Bound each incremental request; never advance past unprocessed source.
    const charBudget = Math.max(4000, Number(config?.memory?.summaryChunkChars || 24000));
    let chars = 0;
    let boundedEnd = start;
    for (let i = start; i < end; i++) {
      const size = String(this.messages[i]?.content || "").length;
      if (boundedEnd > start && chars + size > charBudget) break;
      chars += size;
      boundedEnd = i + 1;
    }
    end = boundedEnd;
    const chunk = this.messages.slice(start, end);
    const sourceSignature = JSON.stringify(chunk.map(m => [m.id, m.content]));
    if (!chunk.length) return;
    this.summarizing = true;
    this.memoryHealth = {
      ...(this.memoryHealth || {}),
      phase: "running",
      message: `正在整理 ${this.turnCount(chunk)} 輪舊對話。`,
      lastModel: config?.memory?.summaryApi?.model || config?.memory?.summaryModel || config?.api?.model || "",
      repaired: false
    };
    try {
      const transcript = chunk.map(m => `${m.role === "user" ? "玩家" : "角色/系統"}：${m.content}`).join("\n\n");
      const prompt = [
        "你是角色扮演長期記憶整理器。",
        "請把舊對話壓縮成精簡但可延續劇情的記憶。",
        "保留已發生事件、已知資訊、明確關係、承諾、物品與目標。玩家偏好只能記錄玩家明說的內容；不得把 AI 推測的心理當作事實。",
        window.BAOHelperData.memoryRules,
        "刪除重複修辭、寒暄與不影響後續的細節。不要加入原文沒有的資訊，不要寫分析過程。",
        this.summary ? `【既有摘要】\n${this.summary}` : "",
        `【待整理舊對話】\n${transcript}`,
        force ? "目前 Context 使用率偏高，請進一步壓縮，輸出新的完整摘要，盡量控制在 600～1200 字。" : "請輸出新的完整長期記憶摘要，建議 800～1600 字以內。"
      ].filter(Boolean).join("\n\n");
      const summaryConfig = { ...config.api, __memoryTask: true, cacheEnabled: false };
      if (config?.memory?.summaryModel) summaryConfig.model = config.memory.summaryModel;
      const result = await API.send(summaryConfig, [{ role: "system", content: "你是 Observer，不是作者。只輸出記憶規格 JSON，不要續寫故事或模仿正文文風。" }, { role: "user", content: prompt }]);
      const normalized = await this.normalizeMemoryResult(summaryConfig, result?.text || "");
      const summary = normalized.summary;
      if (!summary) {
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
      if (window.GameState?.current !== owner || this.summary !== previousSummary || this.summarizedUntil !== start
        || JSON.stringify(this.messages.slice(start, end).map(m => [m.id, m.content])) !== sourceSignature) return;
      this.summary = summary;
      this.summarizedUntil = end;
      this.memoryHealth = {
        ...(this.memoryHealth || {}),
        phase: "success",
        message: `摘要成功，已覆蓋 ${this.turnCount(this.messages.slice(0, end))} 輪。`,
        lastSuccessAt: new Date().toISOString(),
        lastModel: summaryConfig.model || config?.api?.model || "",
        repaired: Boolean(normalized.repaired)
      };
      if (owner) owner.memory = [summary];
    } catch (err) {
      this.memoryHealth = {
        ...(this.memoryHealth || {}),
        phase: "failed",
        message: String(err?.message || "記憶整理失敗；原始對話仍完整保留。").slice(0, 220),
        lastFailureAt: new Date().toISOString(),
        lastModel: config?.memory?.summaryApi?.model || config?.memory?.summaryModel || config?.api?.model || ""
      };
      console.warn("BAO/LAB memory summary failed:", err);
    }
    finally { this.summarizing = false; }
  },

  async afterTurn(config) {
    if (config?.memory?.mode !== "smart" || config?.demoMode) return;
    const rounds = this.protectedRounds(config);
    await this.maybeSummarize(config, ["high", "critical"].includes(this.contextGuard.level), rounds);
  },

  usageKind(config = {}) {
    if (config?.__memoryTask) return config.__memoryRepairTask ? "memory-repair" : "memory";
    if (config?.__stateTask) return "state";
    if (config?.__storyTool) return "story-tool";
    if (config?.__auxiliaryTask) return "auxiliary";
    return "chat";
  },
  addUsage(usage = {}, kind = "all") {
    const known = value => value !== null && value !== undefined && Number.isFinite(Number(value));
    const prompt = known(usage.input_tokens ?? usage.prompt_tokens) ? Number(usage.input_tokens ?? usage.prompt_tokens) : 0;
    const completion = known(usage.output_tokens ?? usage.completion_tokens) ? Number(usage.output_tokens ?? usage.completion_tokens) : 0;
    const cached = known(usage.cached_tokens) ? Number(usage.cached_tokens) : 0;
    const cacheWrite = known(usage.cache_write_tokens) ? Number(usage.cache_write_tokens) : 0;
    const total = known(usage.total_tokens) ? Number(usage.total_tokens) : (prompt + completion);
    this.usage.prompt += prompt; this.usage.completion += completion; this.usage.cached += cached; this.usage.cacheWrite = Number(this.usage.cacheWrite || 0) + cacheWrite; this.usage.total += total;
    if (kind && kind !== "all") {
      const bucket = this.usageByKind[kind] || { prompt: 0, completion: 0, cached: 0, cacheWrite: 0, total: 0, calls: 0 };
      bucket.prompt += prompt; bucket.completion += completion; bucket.cached += cached; bucket.cacheWrite += cacheWrite; bucket.total += total; bucket.calls += 1;
      this.usageByKind[kind] = bucket;
    }
    return { ...this.usage };
  },
  recordRequestUsage(config = {}, result = {}) {
    const kind = this.usageKind(config);
    const usage = result?.usage || {};
    this.addUsage(usage, kind);
    const number = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
    const input = number(usage.input_tokens ?? usage.prompt_tokens);
    const output = number(usage.output_tokens ?? usage.completion_tokens);
    const cached = number(usage.cached_tokens);
    const cacheWrite = number(usage.cache_write_tokens);
    const actualUsd = number(result?.credits?.charged_usd ?? result?.credits?.actual_cost_usd);
    this.usageLedger.push({
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
      at: new Date().toISOString()
    });
    if (this.usageLedger.length > 10000) this.usageLedger.splice(0, this.usageLedger.length - 10000);
    return this.usageLedger.at(-1);
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
    if (prompt && limit) { const percent = Math.min(999, (prompt / limit) * 100); const context = document.getElementById("usage-context"); if (context) context.textContent = `${prompt.toLocaleString()} / ${limit.toLocaleString()} tok (${percent.toFixed(1)}%)`; }
  },
  renderGuard() {
    const el = document.getElementById("usage-guard"); if (!el) return;
    const { level, ratio, recentRounds } = this.contextGuard, pct = ratio > 0 ? `${(ratio * 100).toFixed(0)}%` : "—";
    const labels = { normal:`正常 · 保留 ${recentRounds || "—"} 輪`, watch:`注意 ${pct} · 自動縮短至 ${recentRounds} 輪`, high:`保護中 ${pct} · 摘要＋保留 ${recentRounds} 輪`, critical:`緊急保護 ${pct} · 強制摘要＋保留 ${recentRounds} 輪`, manual:"完整上下文 · 不自動裁切" };
    el.textContent = labels[level] || labels.normal; el.dataset.level = level;
  },
  memoryStatus(maxRounds) {
    const rounds = this.turnCount();
    if (App?.config?.memory?.mode === "smart") {
      const diag = this.memoryDiagnostics(App.config);
      if (this.summarizing || diag.health.phase === "running") return `${rounds} 輪 · 整理中`;
      if (diag.health.phase === "failed") return `${rounds} 輪 · 摘要失敗`;
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
    if (window.API && !API.__baoUsageWrapped) {
      const originalSend = API.send.bind(API);
      API.send = async function(config, messages) { const result = await originalSend(config, messages); if (config?.__connectionTest) return result; Chat.recordRequestUsage(config || {}, result || {}); Chat.renderUsage(result?.usage || {}); if (!config?.__memoryTask && !config?.__stateTask && !config?.__auxiliaryTask && !config?.__storyTool) Chat.recordStoryUsage(result?.usage || {}, App?.config); return result; };
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
