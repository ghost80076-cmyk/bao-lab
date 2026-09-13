const Chat = {
  messages: [],
  usage: { prompt: 0, completion: 0, cached: 0, total: 0 },
  summary: "",
  summarizedUntil: 0,
  summarizing: false,

  reset() {
    this.messages = [];
    this.usage = { prompt: 0, completion: 0, cached: 0, total: 0 };
    this.summary = "";
    this.summarizedUntil = 0;
    this.summarizing = false;
  },

  add(role, content) {
    this.messages.push({ role, content });
  },

  recent(maxRounds, mode) {
    if (mode === "full") return this.messages;
    return this.messages.slice(-Math.max(1, maxRounds) * 2);
  },

  async context(config) {
    const mode = config?.memory?.mode || "rounds";
    const maxRounds = Math.max(1, Number(config?.memory?.maxRounds || 20));
    if (mode === "full") return [...this.messages];
    if (mode === "rounds") return this.messages.slice(-maxRounds * 2);

    await this.maybeSummarize(config);
    const recent = this.messages.slice(-maxRounds * 2);
    const result = [];
    if (this.summary) {
      result.push({
        role: "system",
        content: `【長期記憶摘要】\n以下內容是較早對話的壓縮記憶，請保持人物關係、重要事件、承諾、偏好與未解決事項的一致性。\n${this.summary}`
      });
    }
    result.push(...recent);
    return result;
  },

  async maybeSummarize(config) {
    if (this.summarizing) return;
    const maxRounds = Math.max(4, Number(config?.memory?.maxRounds || 20));
    const keepMessages = maxRounds * 2;
    const overflow = this.messages.length - keepMessages;
    if (overflow < 8) return;

    const end = Math.max(this.summarizedUntil, this.messages.length - keepMessages);
    const chunk = this.messages.slice(this.summarizedUntil, end);
    if (chunk.length < 4) return;

    this.summarizing = true;
    try {
      const transcript = chunk.map(m => `${m.role === "user" ? "玩家" : "角色/系統"}：${m.content}`).join("\n\n");
      const prompt = [
        "你是角色扮演長期記憶整理器。",
        "請把舊對話壓縮成精簡但可延續劇情的記憶。",
        "務必保留：角色關係變化、重要事件、承諾、玩家偏好、秘密、物品/能力變化、正在進行中的目標與未解決伏筆。",
        "不要加入原文沒有的資訊，不要寫分析過程。",
        this.summary ? `【既有摘要】\n${this.summary}` : "",
        `【待整理舊對話】\n${transcript}`,
        "請輸出新的完整長期記憶摘要，建議 800～1600 字以內。"
      ].filter(Boolean).join("\n\n");

      const result = await API.send(config.api, [
        { role: "system", content: "只做劇情記憶摘要，不要續寫故事。" },
        { role: "user", content: prompt }
      ]);

      if (result?.text) {
        this.summary = result.text.trim();
        this.summarizedUntil = end;
        if (window.GameState?.current) {
          GameState.current.memory = [this.summary];
        }
      }
    } catch (err) {
      console.warn("BAO/LAB memory summary failed:", err);
    } finally {
      this.summarizing = false;
    }
  },

  addUsage(usage = {}) {
    const prompt = Number(usage.prompt_tokens || 0);
    const completion = Number(usage.completion_tokens || 0);
    const cached = Number(usage.cached_tokens || 0);
    const total = Number(usage.total_tokens || (prompt + completion));
    this.usage.prompt += prompt;
    this.usage.completion += completion;
    this.usage.cached += cached;
    this.usage.total += total;
    return { ...this.usage };
  },

  renderUsage(lastUsage = {}) {
    const total = document.getElementById("usage-total");
    const input = document.getElementById("usage-input-total");
    const output = document.getElementById("usage-output-total");
    const cacheTotal = document.getElementById("usage-cache-total");
    if (total) total.textContent = `${this.usage.total.toLocaleString()} tok`;
    if (input) input.textContent = `${this.usage.prompt.toLocaleString()} tok`;
    if (output) output.textContent = `${this.usage.completion.toLocaleString()} tok`;
    if (cacheTotal) cacheTotal.textContent = `${this.usage.cached.toLocaleString()} tok`;

    const prompt = Number(lastUsage.prompt_tokens || 0);
    const limit = Number(App?.config?.memory?.maxContext || 0);
    if (prompt && limit) {
      const percent = Math.min(999, (prompt / limit) * 100);
      const context = document.getElementById("usage-context");
      if (context) context.textContent = `${prompt.toLocaleString()} / ${limit.toLocaleString()} tok (${percent.toFixed(1)}%)`;
    }
  },

  memoryStatus(maxRounds) {
    const rounds = Math.ceil(this.messages.length / 2);
    if (App?.config?.memory?.mode === "smart") {
      return this.summary ? `${rounds} 輪 · 已摘要` : `${rounds} 輪 · 等待摘要`;
    }
    return `${rounds}/${maxRounds}`;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const bar = document.querySelector(".usage-bar");
    if (bar && !document.getElementById("usage-total")) {
      bar.insertAdjacentHTML("beforeend", '<span>累積 <b id="usage-total">0 tok</b></span><span>輸入累積 <b id="usage-input-total">0 tok</b></span><span>輸出累積 <b id="usage-output-total">0 tok</b></span><span>Cache 累積 <b id="usage-cache-total">0 tok</b></span>');
    }

    if (window.API && !API.__baoUsageWrapped) {
      const originalSend = API.send.bind(API);
      API.send = async function(config, messages) {
        const result = await originalSend(config, messages);
        Chat.addUsage(result?.usage || {});
        Chat.renderUsage(result?.usage || {});
        return result;
      };
      API.__baoUsageWrapped = true;
    }

    const apiStep = document.querySelector('[data-step-panel="4"]');
    if (apiStep && !document.getElementById("test-api")) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px";
      row.innerHTML = '<button id="test-api" type="button" class="secondary">⚡ 測試 API 連線</button><span id="api-test-status" class="note">尚未測試</span>';
      apiStep.appendChild(row);

      document.getElementById("test-api").addEventListener("click", async () => {
        const btn = document.getElementById("test-api");
        const status = document.getElementById("api-test-status");
        const config = App.collectConfig();
        if (!config.api.model || !config.api.baseUrl || !config.api.key) {
          status.textContent = "✕ 請先完成 Model ID、Base URL 與 API Key";
          return;
        }
        btn.disabled = true;
        status.textContent = "測試中…";
        try {
          const before = { ...Chat.usage };
          const result = await API.test(config.api);
          Chat.usage = before;
          Chat.renderUsage({});
          status.textContent = `✓ 連線成功${result?.usage?.total_tokens ? ` · ${result.usage.total_tokens} tok` : ""}`;
        } catch (err) {
          status.textContent = `✕ ${String(err.message || err).split("\n")[0]}`;
        } finally {
          btn.disabled = false;
        }
      });
    }
  }, 0);
});
