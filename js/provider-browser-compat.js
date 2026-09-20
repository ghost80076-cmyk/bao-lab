(() => {
  if (typeof API === "undefined" || API.__baoBrowserCompatInstalled) return;

  const isOfficialAnthropic = config => {
    if (config?.route === "official" || config?.type === "anthropic") return true;
    try { return new URL(config?.baseUrl || "").hostname === "api.anthropic.com"; }
    catch { return false; }
  };

  API.sendAnthropic = async function(config, messages) {
    if (!config.baseUrl) throw new Error("請填入連線網址（Base URL）。");
    const systemMessages = messages.filter(m => m.role === "system").map(m => this.contentToText(m.content)).filter(Boolean);
    const systemText = systemMessages.join("\n\n");
    const allowExplicitCache = config.cacheEnabled !== false && config.route === "official" && config.cacheMode === "explicit" && config.explicitCacheModel === config.model;
    const system = allowExplicitCache && systemMessages.length
      ? systemMessages.map((text, index) => ({ type: "text", text, ...(index === 0 ? { cache_control: { type: "ephemeral" } } : {}) }))
      : systemText;
    const chat = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: this.contentToText(m.content) }));
    const limit = Math.max(1, Math.floor(Number(config.maxOutputTokens || 4096)));
    const headers = {
      "x-api-key": config.key,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    };
    if (isOfficialAnthropic(config)) headers["anthropic-dangerous-direct-browser-access"] = "true";

    let response;
    try {
      response = await fetch(config.baseUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ model: config.model, max_tokens: limit, system, messages: chat, ...(this.shouldStream(config) ? { stream: true } : {}) }),
        signal: config.signal || this.activeSignal
      });
    } catch (err) { throw this.networkError(err); }
    if (this.shouldStream(config) && response.ok && this.isEventStream(response)) return this.readAnthropicStream(response, config);
    const data = await this.readJSON(response);
    if (!response.ok) throw new Error(this.friendlyError(response.status, data, "Anthropic-compatible API"));
    return {
      text: (data?.content || []).map(x => x?.type === "text" ? x.text : "").filter(Boolean).join("\n") || "模型沒有回傳內容。",
      usage: this.normalizeUsage(data?.usage || {}, "anthropic")
    };
  };

  API.__baoBrowserCompatInstalled = true;
  window.BAOProviderBrowserCompat = Object.freeze({
    installed: true,
    anthropicDirectBrowserHeader: true
  });
})();
