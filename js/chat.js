
const Chat = {
  messages: [],

  reset() {
    this.messages = [];
  },

  add(role, content) {
    this.messages.push({ role, content });
  },

  recent(maxRounds, mode) {
    if (mode === "full") return this.messages;
    return this.messages.slice(-Math.max(1, maxRounds) * 2);
  }
};
