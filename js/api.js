const API = {
  async send(config, messages) {
    if (!config.key) throw new Error("請先填入 API Key。");

    if (config.type === "gemini") {
      return this.sendGemini(config, messages);
    }

    if (config.type === "openrouter" || config.type === "custom" || config.type === "openai") {
      return this.sendOpenAICompatible(config, messages);
    }

    throw new Error("目前尚未支援此 Provider。");
  },

  async sendOpenAICompatible(config, messages) {
    if (!config.baseUrl) throw new Error("請填入 Base URL。");

    const response = await fetch(config.baseUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages
      })
    });

    const data = await this.readJSON(response);
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `API 回傳錯誤 (${response.status})`);
    }

    return {
      text: data?.choices?.[0]?.message?.content || "模型沒有回傳內容。",
      usage: {
        prompt_tokens: data?.usage?.prompt_tokens || 0,
        completion_tokens: data?.usage?.completion_tokens || 0,
        total_tokens: data?.usage?.total_tokens || 0,
        cached_tokens: data?.usage?.prompt_tokens_details?.cached_tokens || 0
      }
    };
  },

  async sendGemini(config, messages) {
    const baseUrl = (config.baseUrl || "https://generativelanguage.googleapis.com/v1beta/models").replace(/\/$/, "");
    const model = encodeURIComponent(config.model);
    const url = `${baseUrl}/${model}:generateContent`;

    const systemMessages = messages.filter(m => m.role === "system");
    const chatMessages = messages.filter(m => m.role !== "system");

    const systemText = systemMessages
      .map(m => this.contentToText(m.content))
      .filter(Boolean)
      .join("\n\n");

    const contents = chatMessages.map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: this.contentToText(message.content) }]
    }));

    if (!contents.length) {
      throw new Error("沒有可傳送給 Gemini 的對話內容。");
    }

    const payload = { contents };
    if (systemText) {
      payload.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "x-goog-api-key": config.key,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await this.readJSON(response);
    if (!response.ok) {
      throw new Error(data?.error?.message || data?.message || `Gemini API 回傳錯誤 (${response.status})`);
    }

    const parts = data?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map(part => typeof part?.text === "string" ? part.text : "")
      .filter(Boolean)
      .join("\n");

    const usage = data?.usageMetadata || {};

    return {
      text: text || this.geminiEmptyResponseMessage(data),
      usage: {
        prompt_tokens: usage.promptTokenCount || 0,
        completion_tokens: usage.candidatesTokenCount || 0,
        total_tokens: usage.totalTokenCount || 0,
        cached_tokens: usage.cachedContentTokenCount || 0
      }
    };
  },

  contentToText(content) {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
      return content
        .map(part => typeof part === "string" ? part : (part?.text || ""))
        .filter(Boolean)
        .join("\n");
    }
    return content == null ? "" : String(content);
  },

  geminiEmptyResponseMessage(data) {
    const finishReason = data?.candidates?.[0]?.finishReason;
    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) return `Gemini 未產生內容（${blockReason}）。`;
    if (finishReason) return `Gemini 未產生文字內容（${finishReason}）。`;
    return "Gemini 沒有回傳文字內容。";
  },

  async readJSON(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`API 回傳非 JSON 內容 (${response.status})`);
    }
  }
};
