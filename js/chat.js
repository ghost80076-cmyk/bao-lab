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

  renderUsage() {
    const total = document.getElementById("usage-total");
    const input = document.getElementById("usage-input-total");
    const output = document.getElementById("usage-output-total");
    if (total) total.textContent = `${this.usage.total.toLocaleString()} tok`;
    if (input) input.textContent = `${this.usage.prompt.toLocaleString()} tok`;
    if (output) output.textContent = `${this.usage.completion.toLocaleString()} tok`;
  }
};

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const bar = document.querySelector(".usage-bar");
    if (bar && !document.getElementById("usage-total")) {
      bar.insertAdjacentHTML("beforeend", '<span>累積 <b id="usage-total">0 tok</b></span><span>輸入累積 <b id="usage-input-total">0 tok</b></span><span>輸出累積 <b id="usage-output-total">0 tok</b></span>');
    }

    if (window.API && !API.__baoUsageWrapped) {
      const originalSend = API.send.bind(API);
      API.send = async function(config, messages) {
        const result = await originalSend(config, messages);
        Chat.addUsage(result?.usage || {});
        Chat.renderUsage();
        return result;
      };
      API.__baoUsageWrapped = true;
    }
  }, 0);
});
