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
  }
};
