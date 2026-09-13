
const Storage = {
  prefix: "bao-lab:",
  set(key, value) {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
  },
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(this.prefix + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  remove(key) {
    localStorage.removeItem(this.prefix + key);
  }
};
