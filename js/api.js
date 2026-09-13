
const API = {
  async send(config, messages) {
    if (!config.key) throw new Error("請先填入 API Key。");

    if (config.type === "openrouter" || config.type === "custom" || config.type === "openai") {
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

      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "API 回傳錯誤");

      return {
        text: data?.choices?.[0]?.message?.content || "模型沒有回傳內容。",
        usage: data.usage || {}
      };
    }

    throw new Error("此官方 Provider 尚未接入 V1.2。");
  }
};
