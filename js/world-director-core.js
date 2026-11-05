/* Read-only P4 world event planning and continuity checks. No model, storage or network calls. */
(function (root, factory) {
  const core = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.BAOWorldDirectorCore = core;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const idPattern = /^wc-[1-9]\d*$/;
  const object = value => value && typeof value === 'object' && !Array.isArray(value);
  const clockOf = state => object(state?.worldClock) ? state.worldClock
    : object(state?.world_clock) ? state.world_clock : null;
  const eventsOf = clock => Array.isArray(clock?.scheduledEvents) ? clock.scheduledEvents
    : Array.isArray(clock?.scheduled_events) ? clock.scheduled_events : [];
  const validTick = value => Number.isSafeInteger(value) && value >= 0;
  const validId = id => typeof id === 'string' && idPattern.test(id);
  const report = (code, severity, id = '') => ({ code, severity, ...(id ? { eventId: id } : {}) });

  function plan(state, limit = 6) {
    const clock = clockOf(state);
    if (!clock || !validTick(clock.tickMinutes)) return [];
    const seen = new Set();
    const choices = [];
    for (const event of eventsOf(clock)) {
      if (!object(event) || !validId(event.id) || seen.has(event.id)) continue;
      seen.add(event.id);
      if (event.status !== 'pending' || !validTick(event.dueTickMinutes)
          || event.dueTickMinutes > clock.tickMinutes || typeof event.label !== 'string' || !event.label.trim()) continue;
      choices.push({
        kind: 'due-window', eventId: event.id, label: String(event.label).trim().slice(0, 160),
        dueTickMinutes: event.dueTickMinutes,
        overdueMinutes: clock.tickMinutes - event.dueTickMinutes,
        action: 'review', // Never asserts that an event happened or resolved.
        source: 'worldClock.scheduledEvents'
      });
    }
    choices.sort((a, b) => a.dueTickMinutes - b.dueTickMinutes || a.eventId.localeCompare(b.eventId));
    return choices.slice(0, Math.max(0, Math.min(12, Number.isFinite(limit) ? Math.floor(limit) : 6)));
  }

  function reviewClockPatch(state, rawPatch) {
    const patch = object(rawPatch?.world_clock) ? rawPatch.world_clock : rawPatch;
    const issues = [];
    if (!object(patch)) return { safe: false, requiresReview: false, issues: [report('invalid-patch', 'error')] };
    const clock = clockOf(state);
    const events = new Map(eventsOf(clock).filter(event => object(event) && validId(event.id)).map(event => [event.id, event]));
    const resolve = Array.isArray(patch.resolve) ? patch.resolve : [];
    const cancel = Array.isArray(patch.cancel) ? patch.cancel : [];
    const requested = new Map();
    for (const [action, ids] of [['resolve', resolve], ['cancel', cancel]]) {
      for (const id of ids) {
        if (!validId(id)) { issues.push(report('invalid-event-id', 'error')); continue; }
        if (requested.has(id) && requested.get(id) !== action) issues.push(report('conflicting-outcome', 'error', id));
        requested.set(id, action);
        const event = events.get(id);
        if (!event) issues.push(report('unknown-event', 'error', id));
        else if (event.status !== 'pending') issues.push(report('already-closed', 'error', id));
      }
    }
    // A source reference or a verified mention alone cannot establish an outcome.
    for (const id of requested.keys()) {
      if (events.get(id)?.status === 'pending') issues.push(report('missing-completion-evidence', 'review', id));
    }
    const advance = patch.advance_minutes ?? patch.advanceMinutes;
    if (advance !== undefined && (!Number.isSafeInteger(advance) || advance < 0))
      issues.push(report('invalid-clock-advance', 'error'));
    return { safe: !issues.some(issue => issue.severity === 'error'),
      requiresReview: issues.some(issue => issue.severity === 'review'), issues };
  }

  function compare(beforeState, afterState) {
    const before = clockOf(beforeState), after = clockOf(afterState);
    if (!before || !after) return [];
    const issues = [];
    if (validTick(before.tickMinutes) && validTick(after.tickMinutes)
        && after.tickMinutes < before.tickMinutes) issues.push(report('clock-regression', 'error'));
    const next = new Map(eventsOf(after).filter(event => object(event) && validId(event.id)).map(event => [event.id, event]));
    for (const old of eventsOf(before)) {
      if (!object(old) || !validId(old.id)) continue;
      const current = next.get(old.id);
      if (!current) {
        if (old.status === 'pending') issues.push(report('pending-event-removed', 'review', old.id));
        continue;
      }
      if (['resolved', 'cancelled'].includes(old.status) && current.status === 'pending')
        issues.push(report('closed-event-reopened', 'error', old.id));
      if (old.status === 'pending' && ['resolved', 'cancelled'].includes(current.status))
        issues.push(report('missing-completion-evidence', 'review', old.id));
      if (validTick(old.dueTickMinutes) && validTick(current.dueTickMinutes)
          && old.dueTickMinutes !== current.dueTickMinutes)
        issues.push(report('event-due-changed', 'review', old.id));
    }
    return issues;
  }
  function snapshot(state) {
    const clock = clockOf(state);
    if (!clock) return null;
    return { worldClock: { tickMinutes: clock.tickMinutes, scheduledEvents: eventsOf(clock).filter(object)
      .map(({id,label,status,dueTickMinutes}) => ({id,label,status,dueTickMinutes})) } };
  }
  return { plan, reviewClockPatch, compare, snapshot };
});
