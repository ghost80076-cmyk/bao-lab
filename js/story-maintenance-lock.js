window.BAOStoryMaintenanceLock = (() => {
  const busy = new WeakSet();
  return {
    has: item => busy.has(item),
    start: item => { if (busy.has(item)) return false; busy.add(item); return true; },
    end: item => busy.delete(item)
  };
})();
