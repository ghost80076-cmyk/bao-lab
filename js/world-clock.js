(() => {
  'use strict';
  if (window.BAOWorldClock || typeof GameState === 'undefined' || typeof App === 'undefined') return;

  const MAX_PENDING = 50;
  const MAX_STORED = 80;
  const MAX_ADVANCE_MINUTES = 52560000;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const asInt = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return null;
    return Math.min(max, Math.max(min, Math.floor(number)));
  };
  const validId = value => /^wc-\d+$/.test(String(value || ''));
  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value)); }
  };

  const normalizeClock = raw => {
    const source = object(raw) ? raw : {};
    const tickMinutes = asInt(source.tickMinutes ?? source.tick_minutes, 0, Number.MAX_SAFE_INTEGER) ?? 0;
    const sourceEvents = Array.isArray(source.scheduledEvents)
      ? source.scheduledEvents
      : (Array.isArray(source.scheduled_events) ? source.scheduled_events : []);
    const events = [];
    const used = new Set();
    let generated = Math.max(1, asInt(source.nextEventSeq ?? source.next_event_seq, 1, Number.MAX_SAFE_INTEGER) ?? 1);
    let maxId = 0;

    for (const item of sourceEvents.slice(0, MAX_STORED)) {
      if (!object(item)) continue;
      const label = String(item.label || '').trim().slice(0, 160);
      const due = asInt(item.dueTickMinutes ?? item.due_tick_minutes, 0, Number.MAX_SAFE_INTEGER);
      if (!label || due === null) continue;
      let id = String(item.id || '').trim();
      if (!validId(id) || used.has(id)) {
        while (used.has(`wc-${generated}`)) generated += 1;
        id = `wc-${generated++}`;
      }
      used.add(id);
      const parsed = Number(id.slice(3));
      if (Number.isFinite(parsed)) maxId = Math.max(maxId, parsed);
      const status = ['pending', 'resolved', 'cancelled'].includes(item.status) ? item.status : 'pending';
      events.push({ id, dueTickMinutes: due, label, status });
    }

    return {
      version: 1,
      tickMinutes,
      nextEventSeq: Math.max(generated, maxId + 1, 1),
      scheduledEvents: events
    };
  };

  const normalizePatchFallback = raw => {
    if (!object(raw)) return {};
    const out = {};
    const advance = asInt(raw.advance_minutes ?? raw.advanceMinutes, 0, MAX_ADVANCE_MINUTES);
    if (advance !== null && advance > 0) out.advance_minutes = advance;
    if (Array.isArray(raw.schedule)) {
      const schedule = raw.schedule.slice(0, 12).map(item => {
        if (!object(item)) return null;
        const label = String(item.label || '').trim().slice(0, 160);
        const minutes = asInt(item.in_minutes ?? item.inMinutes, 0, MAX_ADVANCE_MINUTES);
        return label && minutes !== null ? { label, in_minutes: minutes } : null;
      }).filter(Boolean);
      if (schedule.length) out.schedule = schedule;
    }
    for (const key of ['resolve', 'cancel']) {
      if (!Array.isArray(raw[key])) continue;
      const ids = [...new Set(raw[key].map(String).filter(validId))].slice(0, 20);
      if (ids.length) out[key] = ids;
    }
    return out;
  };

  const ensureState = (create = false) => {
    const state = GameState.current;
    if (!state) return null;
    if (!object(state.worldClock)) {
      if (!create) return null;
      state.worldClock = normalizeClock({});
    } else {
      state.worldClock = normalizeClock(state.worldClock);
    }
    return state.worldClock;
  };

  const nextId = clock => {
    const used = new Set(clock.scheduledEvents.map(event => event.id));
    let seq = Math.max(1, Number(clock.nextEventSeq || 1));
    while (used.has(`wc-${seq}`)) seq += 1;
    clock.nextEventSeq = seq + 1;
    return `wc-${seq}`;
  };

  const trimHistory = clock => {
    if (clock.scheduledEvents.length <= MAX_STORED) return;
    const pending = clock.scheduledEvents.filter(event => event.status === 'pending');
    const history = clock.scheduledEvents.filter(event => event.status !== 'pending');
    const historyBudget = Math.max(0, MAX_STORED - pending.length);
    clock.scheduledEvents = [...history.slice(-historyBudget), ...pending].slice(-MAX_STORED);
  };

  const applyPatch = raw => {
    const patch = window.BAOHelperData?.worldClockPatch
      ? BAOHelperData.worldClockPatch(raw)
      : normalizePatchFallback(raw);
    if (!object(patch) || !Object.keys(patch).length) return null;
    const clock = ensureState(true);
    if (!clock) return null;

    if (Number.isFinite(Number(patch.advance_minutes)) && Number(patch.advance_minutes) > 0) {
      clock.tickMinutes = Math.min(
        Number.MAX_SAFE_INTEGER,
        clock.tickMinutes + Math.floor(Number(patch.advance_minutes))
      );
    }

    const byId = () => new Map(clock.scheduledEvents.map(event => [event.id, event]));
    for (const id of patch.resolve || []) {
      const event = byId().get(id);
      if (event?.status === 'pending') event.status = 'resolved';
    }
    for (const id of patch.cancel || []) {
      const event = byId().get(id);
      if (event?.status === 'pending') event.status = 'cancelled';
    }

    let pendingCount = clock.scheduledEvents.filter(event => event.status === 'pending').length;
    for (const item of patch.schedule || []) {
      if (pendingCount >= MAX_PENDING) break;
      const minutes = asInt(item.in_minutes, 0, MAX_ADVANCE_MINUTES);
      const label = String(item.label || '').trim().slice(0, 160);
      if (minutes === null || !label) continue;
      clock.scheduledEvents.push({
        id: nextId(clock),
        dueTickMinutes: Math.min(Number.MAX_SAFE_INTEGER, clock.tickMinutes + minutes),
        label,
        status: 'pending'
      });
      pendingCount += 1;
    }

    trimHistory(clock);
    return clone(clock);
  };

  const dueEvents = () => {
    const clock = ensureState(false);
    if (!clock) return [];
    return clock.scheduledEvents
      .filter(event => event.status === 'pending' && event.dueTickMinutes <= clock.tickMinutes)
      .sort((a, b) => a.dueTickMinutes - b.dueTickMinutes);
  };

  const pendingEvents = () => {
    const clock = ensureState(false);
    if (!clock) return [];
    return clock.scheduledEvents
      .filter(event => event.status === 'pending')
      .sort((a, b) => a.dueTickMinutes - b.dueTickMinutes);
  };

  const stateSnapshot = () => {
    const clock = ensureState(false);
    if (!clock) return null;
    return {
      tick_minutes: clock.tickMinutes,
      scheduled_events: pendingEvents().slice(0, 12).map(event => ({
        id: event.id,
        label: event.label,
        due_tick_minutes: event.dueTickMinutes,
        remaining_minutes: event.dueTickMinutes - clock.tickMinutes,
        status: event.status
      }))
    };
  };

  const promptBlock = () => {
    const clock = ensureState(false);
    if (!clock) return '';
    const state = GameState.current || {};
    const due = dueEvents().slice(0, 6);
    const upcoming = pendingEvents().filter(event => event.dueTickMinutes > clock.tickMinutes).slice(0, 6);
    const lines = [
      '【世界時鐘】',
      `結構化經過時間：${clock.tickMinutes} 分鐘。這只是故事內部的相對時間軸，不是現實世界時鐘，也不取代作品自己的曆法。`
    ];
    if (state.time && state.time !== '未設定') lines.push(`目前顯示時間：${state.time}`);
    if (due.length) lines.push('已到期／可觸發：\n' + due.map(event =>
      `- ${event.id}｜${event.label}（已跨過期限 ${clock.tickMinutes - event.dueTickMinutes} 分鐘）`
    ).join('\n'));
    if (upcoming.length) lines.push('待排程：\n' + upcoming.map(event =>
      `- ${event.id}｜${event.label}（距離期限 ${event.dueTickMinutes - clock.tickMinutes} 分鐘）`
    ).join('\n'));
    lines.push('到期只代表事件進入可發生或需要處理的時間窗口，不代表事件已自動完成。請依場景、角色行動與因果自然處理；不要因排程存在而強行改變劇情。');
    return lines.join('\n');
  };

  const originalCreate = GameState.create?.bind(GameState);
  if (originalCreate) {
    GameState.create = function(character, config) {
      const state = originalCreate(character, config);
      const initial = character?.initial_state?.world_clock || character?.initial_state?.worldClock || state?.worldClock;
      if (object(initial)) state.worldClock = normalizeClock(initial);
      return state;
    };
  }

  const originalApply = GameState.applyUpdate?.bind(GameState);
  if (originalApply) {
    GameState.applyUpdate = function(update = {}) {
      originalApply(update);
      if (!this.current || !object(update?.world_clock)) return;
      applyPatch(update.world_clock);
    };
  }

  if (window.WorldStateEngine?.stateSnapshot) {
    const originalSnapshot = WorldStateEngine.stateSnapshot.bind(WorldStateEngine);
    WorldStateEngine.stateSnapshot = function(...args) {
      const snapshot = originalSnapshot(...args) || {};
      const clock = stateSnapshot();
      if (clock) snapshot.world_clock = clock;
      return snapshot;
    };
  }

  const promptWrapper = function(next, ...args) {
    const base = next(...args);
    const block = promptBlock();
    return block ? `${base}\n\n${block}` : base;
  };
  if (typeof App.wrapBuildSystemPrompt === 'function') {
    App.wrapBuildSystemPrompt('world-clock:story-context', promptWrapper);
  } else if (typeof App.buildSystemPrompt === 'function') {
    const originalBuild = App.buildSystemPrompt.bind(App);
    App.buildSystemPrompt = (...args) => promptWrapper.call(App, originalBuild, ...args);
  }

  window.BAOWorldClock = Object.freeze({
    version: 1,
    normalizeClock,
    ensureState,
    applyPatch,
    dueEvents,
    pendingEvents,
    stateSnapshot,
    promptBlock
  });
})();
