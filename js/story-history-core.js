/* Public event projection. No author fields, memory inference or model calls. */
((root) => {
  'use strict';
  const LIMIT = 500;
  const text = value => typeof value === 'string' ? value.trim().slice(0, 2000) : '';
  const normalize = value => {
    const ids = new Set();
    const entries = (Array.isArray(value?.entries) ? value.entries : []).slice(0, LIMIT).flatMap(item => {
      if (!item || !Number.isSafeInteger(item.id) || item.id < 1 || ids.has(item.id) || !text(item.text)) return [];
      ids.add(item.id);
      return [{ id: item.id, text: text(item.text), source: item.source === 'legacy' ? 'legacy' : 'event',
        time: text(item.time).slice(0, 120), location: text(item.location).slice(0, 160), starred: item.starred === true }];
    });
    return { version: 1, entries, nextId: Math.max(0, ...entries.map(item => item.id)) + 1 };
  };
  const read = state => {
    if (state?.storyHistory?.version === 1) return normalize(state.storyHistory);
    // Old snapshots have no historical time/location; do not invent either.
    const events = (Array.isArray(state?.events) ? state.events : []).slice(0, 20).filter(item => text(item));
    return normalize({ entries: events.map((item, index) => ({ id: events.length - index, text: item, source: 'legacy' })) });
  };
  const record = (state, value) => {
    if (!state || !text(value)) return;
    const history = read(state);
    if (history.entries[0]?.text === text(value)) { state.storyHistory = history; return; }
    if (history.entries.length >= LIMIT) {
      const index = history.entries.findLastIndex(item => !item.starred);
      if (index < 0) return; // Never silently discard a collected event.
      history.entries.splice(index, 1);
    }
    history.entries.unshift({ id: history.nextId++, text: text(value), source: 'event',
      time: text(state.time).slice(0, 120), location: text(state.location).slice(0, 160), starred: false });
    state.storyHistory = history;
  };
  const toggle = (state, id) => {
    if (!state) return false;
    const history = read(state);
    const entry = history.entries.find(item => item.id === id);
    if (!entry) return false;
    entry.starred = !entry.starred;
    state.storyHistory = history;
    return true;
  };
  root.BAOStoryHistoryCore = { LIMIT, read, record, toggle };
})(typeof window !== 'undefined' ? window : globalThis);
