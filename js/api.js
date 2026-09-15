const API = {
  numberOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  },

  normalizeUsage(raw = {}, protocol = "openai") {
    const details = raw?.prompt_tokens_details || raw?.input_tokens_details || {};
    const pick = (...values) => {
      for (const value of values) {
        const number = this.numberOrNull(value);
        if (number !== null) return number;
      }
      return null;
    };
    let input = pick(raw.input_tokens, raw.prompt_tokens, raw.promptTokenCount);
    const cached = pick(details.cached_tokens, raw.cached_tokens, raw.cache_read_input_tokens, raw.cachedContentTokenCount);
    const cacheWrite = pick(details.cache_write_tokens, raw.cache_write_tokens, raw.cache_creation_input_tokens);
    const output = pick(raw.output_tokens, raw.completion_tokens, raw.candidatesTokenCount);
    const total = pick(raw.total_tokens, raw.totalTokenCount);

    // Anthropic reports uncached input separately from cache reads/writes.
    if (protocol === "anthropic" && input !== null) input += (cached || 0) + (cacheWrite || 0);
    const newInput = input !== null && cached !== null ? Math.max(0, input - cached) : null;
    return {
      input_tokens: input,
      cached_tokens: cached,
      cache_write_tokens: cacheWrite,
      new_input_tokens: newInput,
      output_tokens: output,
      total_tokens: total,
      // Backward-compatible aliases used by existing saves and cost controls.
      prompt_tokens: input,
      completion_tokens: output
    };
  },

  isOpenRouter(config = {}) {
    return config.type === "openrouter" || /(^|\.)openrouter\.ai$/i.test((() => { try { return new URL(config.baseUrl).hostname; } catch { return ""; } })());
  },

  async send(config, messages) {
    if (!config.key) throw new Error("請先填入 API Key。");
    if (!config.model) throw new Error("請填入 Model ID。");
    const protocol = config.protocol || (config.type === "gemini" ? "gemini" : config.type === "anthropic" ? "anthropic" : "openai");
    if (protocol === "gemini") return this.sendGemini(config, messages);
    if (protocol === "anthropic") return this.sendAnthropic(config, messages);
    return this.sendOpenAICompatible(config, messages);
  },

  async test(config) {
    const messages = [
      { role: "system", content: "You are an API connection tester. Reply only with OK." },
      { role: "user", content: "Reply OK" }
    ];
    return this.send({ ...config, maxOutputTokens: 16 }, messages);
  },

  friendlyError(status, data, protocol = "API") {
    const raw = data?.error?.message || data?.message || data?.error?.error?.message || "";
    const lower = String(raw).toLowerCase();
    if (status === 401 || lower.includes("invalid api key") || lower.includes("incorrect api key") || lower.includes("authentication"))
      return `API Key 無效或驗證失敗。請檢查金鑰是否正確。${raw ? `\n${raw}` : ""}`;
    if (status === 403)
      return `沒有使用此模型或 API 的權限。請檢查帳號權限、地區限制或金鑰設定。${raw ? `\n${raw}` : ""}`;
    if (status === 404 || lower.includes("model not found") || lower.includes("not found"))
      return `找不到 API 端點或 Model ID。請檢查 Base URL 與模型名稱。${raw ? `\n${raw}` : ""}`;
    if (status === 429 || lower.includes("rate limit") || lower.includes("quota") || lower.includes("insufficient_quota"))
      return `請求太頻繁，或 API 額度／餘額不足。請稍後再試並檢查服務商帳戶。${raw ? `\n${raw}` : ""}`;
    if (status >= 500)
      return `${protocol} 服務目前異常（${status}）。可能是官方或中轉站暫時故障，稍後再試。${raw ? `\n${raw}` : ""}`;
    return raw || `${protocol} 回傳錯誤 (${status})`;
  },

  async sendOpenAICompatible(config, messages) {
    if (!config.baseUrl) throw new Error("請填入 Base URL。");
    const openRouter = this.isOpenRouter(config);
    const explicitCache = openRouter && config.cacheEnabled !== false && config.cacheMode === "explicit";
    const requestMessages = explicitCache ? messages.map((message, index) => index === 0 && message.role === "system"
      ? { ...message, content: [{ type: "text", text: this.contentToText(message.content), cache_control: { type: "ephemeral" } }] }
      : message) : messages;
    const body = { model: config.model, messages: requestMessages };
    const sessionId = config.sessionId || window.BAOPromptCache?.storySessionId?.();
    if (openRouter && sessionId) body.session_id = String(sessionId).slice(0, 256);
    const limit = Number(config.maxOutputTokens || 0);
    if (limit > 0) body.max_tokens = Math.floor(limit);
    let response;
    try {
      response = await fetch(config.baseUrl, {
        method: "POST",
        headers: { "Authorization": `Bearer ${config.key}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (err) { throw this.networkError(err); }
    const data = await this.readJSON(response);
    if (!response.ok) throw new Error(this.friendlyError(response.status, data, "OpenAI-compatible API"));
    return { text: this.contentToText(data?.choices?.[0]?.message?.content) || "模型沒有回傳內容。", usage: this.normalizeUsage(data?.usage || {}, "openai") };
  },

  async sendAnthropic(config, messages) {
    if (!config.baseUrl) throw new Error("請填入 Base URL。");
    const systemMessages = messages.filter(m => m.role === "system").map(m => this.contentToText(m.content)).filter(Boolean);
    const systemText = systemMessages.join("\n\n");
    const allowExplicitCache = config.cacheEnabled !== false && config.route === "official" && config.cacheMode === "explicit";
    const system = allowExplicitCache && systemMessages.length ? systemMessages.map((text, index) => ({ type: "text", text, ...(index === 0 ? { cache_control: { type: "ephemeral" } } : {}) })) : systemText;
    const chat = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: this.contentToText(m.content) }));
    const limit = Math.max(1, Math.floor(Number(config.maxOutputTokens || 4096)));
    let response;
    try {
      response = await fetch(config.baseUrl, { method: "POST", headers: { "x-api-key": config.key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model: config.model, max_tokens: limit, system, messages: chat }) });
    } catch (err) { throw this.networkError(err); }
    const data = await this.readJSON(response);
    if (!response.ok) throw new Error(this.friendlyError(response.status, data, "Anthropic-compatible API"));
    return { text: (data?.content || []).map(x => x?.type === "text" ? x.text : "").filter(Boolean).join("\n") || "模型沒有回傳內容。", usage: this.normalizeUsage(data?.usage || {}, "anthropic") };
  },

  async sendGemini(config, messages) {
    const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
    const url = `${baseUrl}/${encodeURIComponent(config.model)}:generateContent`;
    const systemText = messages.filter(m => m.role === "system").map(m => this.contentToText(m.content)).filter(Boolean).join("\n\n");
    const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: this.contentToText(m.content) }] }));
    if (!contents.length) throw new Error("沒有可傳送給 Gemini 的對話內容。");
    const payload = { contents };
    if (systemText) payload.systemInstruction = { parts: [{ text: systemText }] };
    const limit = Number(config.maxOutputTokens || 0);
    if (limit > 0) payload.generationConfig = { maxOutputTokens: Math.floor(limit) };
    let response;
    try {
      response = await fetch(url, { method: "POST", headers: { "x-goog-api-key": config.key, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } catch (err) { throw this.networkError(err); }
    const data = await this.readJSON(response);
    if (!response.ok) throw new Error(this.friendlyError(response.status, data, "Gemini API"));
    const text = (data?.candidates?.[0]?.content?.parts || []).map(p => typeof p?.text === "string" ? p.text : "").filter(Boolean).join("\n");
    return { text: text || this.geminiEmptyResponseMessage(data), usage: this.normalizeUsage(data?.usageMetadata || {}, "gemini") };
  },

  networkError(err) {
    return new Error(`無法連線到 API。請檢查 Base URL、網路，或中轉站是否允許瀏覽器跨網域連線（CORS）。\n${err?.message || "Network error"}`);
  },
  contentToText(content) { if (typeof content === "string") return content; if (Array.isArray(content)) return content.map(p => typeof p === "string" ? p : (p?.text || "")).filter(Boolean).join("\n"); return content == null ? "" : String(content); },
  geminiEmptyResponseMessage(data) { const finishReason = data?.candidates?.[0]?.finishReason; const blockReason = data?.promptFeedback?.blockReason; if (blockReason) return `Gemini 未產生內容（${blockReason}）。`; if (finishReason) return `Gemini 未產生文字內容（${finishReason}）。`; return "Gemini 沒有回傳文字內容。"; },
  async readJSON(response) { const text = await response.text(); if (!text) return {}; try { return JSON.parse(text); } catch { if (!response.ok) throw new Error(`API 回傳非 JSON 內容 (${response.status})。Base URL 可能不是正確的 API 端點。`); throw new Error(`API 回傳了無法解析的內容 (${response.status})。`); } }
};
