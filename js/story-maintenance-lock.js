/* Shared per-story lock for long-running story-data maintenance.
 * The token makes stale async finally blocks unable to unlock a newer task.
 * Existing start(owner) / end(owner) callers remain compatible.
 */
window.BAOStoryMaintenanceLock = (() => {
  const active = new WeakMap();
  const listeners = new Set();
  const current = owner => owner && typeof owner === 'object' ? active.get(owner) || null : null;
  const notify = owner => {
    for (const fn of listeners) {
      try { fn(owner, current(owner)); }
      catch (error) { console.warn('YoruBay maintenance notice failed:', error); }
    }
  };
  return {
    has: owner => Boolean(current(owner)),
    current,
    start(owner, meta = {}) {
      if (!owner || typeof owner !== 'object' || current(owner)) return false;
      active.set(owner, {
        label: String(meta?.label || '正在整理故事資料').slice(0, 100),
        token: meta?.token || null
      });
      notify(owner);
      return true;
    },
    end(owner, token = null) {
      const task = current(owner);
      if (!task || (token && task.token !== token)) return false;
      active.delete(owner);
      notify(owner);
      return true;
    },
    subscribe(listener) {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
})();
