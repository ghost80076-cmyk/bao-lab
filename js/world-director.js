(() => {
  'use strict';
  const core = window.BAOWorldDirectorCore;
  if (!core || !window.BAOEpisodicMemory?.worldEventEvidence) return;
  const turns = new WeakMap();
  const current = receipt => receipt?.kind === 'bao:story-turn' && receipt.complete === true
    && receipt.isCurrent() && Chat.messages.at(-2)?.id === receipt.playerId
    && Chat.messages.at(-1)?.id === receipt.assistantId;

  function record(receipt, before) {
    if (!current(receipt)) return;
    const after = core.snapshot(receipt.owner);
    if (before || after) turns.set(receipt.owner, {receipt, before, after});
  }

  function review() {
    const owner = GameState.current;
    const turn = turns.get(owner);
    if (!turn || !current(turn.receipt) || JSON.stringify(core.snapshot(owner)) !== JSON.stringify(turn.after)) return null;
    const {before, after} = turn;
    const previous = before?.worldClock.scheduledEvents || [], events = after?.worldClock.scheduledEvents || [];
    const issues = core.compare(before, after);
    // A repeated label could identify two different schedules. Keep both private.
    const byLabel = new Map(), labelsById = new Map();
    for (const {id,label} of [...previous, ...events]) {
      if (!/^wc-[1-9]\d*$/.test(id) || typeof label !== 'string' || label !== label.trim() || !label) continue;
      if (!byLabel.has(label)) byLabel.set(label, new Set());
      if (!labelsById.has(id)) labelsById.set(id, new Set());
      byLabel.get(label).add(id);
      labelsById.get(id).add(label);
    }
    const due = events.filter(event => event.status === 'pending' && event.dueTickMinutes <= after.worldClock.tickMinutes);
    const relevant = new Set([...due.map(event => event.id), ...issues.map(issue => issue.eventId)]);
    const labels = [...byLabel].filter(([, ids]) => {
      const [id] = ids;
      return ids.size === 1 && labelsById.get(id).size === 1 && relevant.has(id);
    }).map(([label]) => label);
    const proof = window.BAOEpisodicMemory.worldEventEvidence({state:owner, messages:Chat.messages,
      config:turn.receipt.config, primary:App.activeCharacter?.name, labels});
    const visible = new Map([...proof].map(([label, anchors]) => [[...byLabel.get(label)][0], {
      label, sourceNumbers:[...new Set(anchors.map(anchor => anchor.index + 1))]
    }]));
    const candidates = after ? core.plan({worldClock:{...after.worldClock,
      scheduledEvents:due.filter(event => visible.has(event.id))}}).map(item => visible.get(item.eventId)) : [];
    const warnings = issues.flatMap(issue => !issue.eventId ? [{code:issue.code}]
      : visible.has(issue.eventId) ? [{code:issue.code, ...visible.get(issue.eventId)}] : []);
    return {candidates, warnings};
  }

  window.BAOWorldDirector = Object.freeze({snapshot:core.snapshot, record, review});
})();
