const Chat = {
  messages: [],
  usage: { prompt: 0, completion: 0, cached: 0, total: 0 },

  reset() {
    this.messages = [];
    this.usage = { prompt: 0, completion: 0, cached: 0, total: 0 };
  },

  add(role, content) {
    this.messages.push({ role, content });
  },

  recent(maxRounds, mode) {
    if (mode === "full") return this.messages;
    return this.messages.slice(-Math.max(1, maxRounds) * 2);
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
      setTimeout(() => {
        const context = document.getElementById("usage-context");
        if (context) context.textContent = `${prompt.toLocaleString()} / ${limit.toLocaleString()} tok (${percent.toFixed(1)}%)`;
      }, 0);
    }
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
          const result = await API.test(config.api);
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
