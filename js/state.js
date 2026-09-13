
const GameState = {
  current: null,

  create(character, config) {
    const base = structuredClone(character.initial_state || {});
    this.current = {
      time: base.time || "未設定",
      location: base.location || "未設定",
      events: base.events || ["故事剛剛開始。"],
      npcs: base.npcs || [],
      memory: [],
      config
    };
    return this.current;
  },

  addEvent(text) {
    if (!this.current) return;
    this.current.events.unshift(text);
    this.current.events = this.current.events.slice(0, 20);
  },

  addMemory(text) {
    if (!this.current) return;
    this.current.memory.unshift(text);
    this.current.memory = this.current.memory.slice(0, 50);
  }
};
