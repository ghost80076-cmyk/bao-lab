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
      return [{ id: item.id, text: text(item.text), source: ['legacy', 'module'].includes(item.source) ? item.source : 'event',
        time: text(item.time).slice(0, 120), location: text(item.location).slice(0, 160), starred: item.starred === true }];
    });
    return { version: 1, entries, nextId: Math.max(0, ...entries.map(item => item.id)) + 1 };
  };
  const read = state => {
    if (state?.storyHistory?.version === 1) return normalize(state.storyHistory);
    // Old snapshots have no historical time/location; do not invent either.
    const events = (Array.isArray(state?.events) ? state.events : []).slice(0, 20).map(item => text(typeof item === 'string' ? item : item?.text)).filter(Boolean);
    return normalize({ entries: events.map((item, index) => ({ id: events.length - index, text: item, source: 'legacy' })) });
  };
  const record = (state, value, source = 'event', scene = state) => {
    if (!state || !text(value)) return;
    const history = read(state);
    if (history.entries[0]?.text === text(value)) { state.storyHistory = history; return; }
    if (history.entries.length >= LIMIT) {
      const index = history.entries.findLastIndex(item => !item.starred);
      if (index < 0) return; // Never silently discard a collected event.
      history.entries.splice(index, 1);
    }
    history.entries.unshift({ id: history.nextId++, text: text(value), source: source === 'module' ? 'module' : 'event',
      time: text(scene?.time).slice(0, 120), location: text(scene?.location).slice(0, 160), starred: false });
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
  // Explicit public collections only: never infer visibility from a module name.
  const moduleText = item => {
    // JSON-encoded objects are not decoded: nested/extra fields remain private.
    if (typeof item === 'string') return /^\s*[\[{]/.test(item) ? '' : text(item);
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    return text([text(item.title), text(item.summary), text(item.status)].filter(Boolean).join('｜'));
  };
  const captureModules = (state, { previous = {} } = {}) => {
    if (!state) return;
    const known = new Set(read(state).entries.map(item => item.text));
    for (const def of (state.moduleDefinitions || []).slice(0, 24)) {
      if (def.story_history !== true || def.kind !== 'collection' || def.visibility !== 'public' || def.enabled === false ||
          /^(?:_|private|secret|internal|hidden)/i.test(def.id)) continue;
      const items = state.modules?.[def.id];
      if (!Array.isArray(items)) continue;
      const prior = new Set((Array.isArray(previous[def.id]) ? previous[def.id] : []).slice(0, 100).map(moduleText));
      for (const item of items.slice(0, 100).reverse()) {
        const value = moduleText(item);
        if (!value || known.has(value) || prior.has(value)) continue;
        // Collection rows may describe earlier scenes; do not guess their timestamp.
        record(state, value, 'module', null);
        known.add(value);
      }
    }
  };
  root.BAOStoryHistoryCore = { LIMIT, read, record, toggle, captureModules };
})(typeof window !== 'undefined' ? window : globalThis);
