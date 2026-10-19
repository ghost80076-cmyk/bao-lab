/* Local event index. No network, embeddings, or cross-story storage. */
(() => {
  'use strict';
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, max = 240) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const list = (v, max = 24) => Array.isArray(v) ? [...new Set(v.map(x => text(x, 100)).filter(Boolean))].slice(0, max) : [];
  // Only explicit NPC names/aliases link identities. Ambiguity invalidates the
  // whole private audience; dropping just that speaker could expose a secret.
  const actorResolver = state => {
    const registry = new Map();
    (Array.isArray(state?.npcs) ? state.npcs : []).forEach((npc,index) => {
      const canonical = text(npc?.name,100);
      if (!canonical) return;
      const identity = npc.npc_id ? `id:${npc.npc_id}:${canonical}` : `row:${index}`;
      for (const name of [canonical,...list(npc.aliases)]) {
        if (!registry.has(name)) registry.set(name,new Map());
        registry.get(name).set(identity,canonical);
      }
    });
    return value => {
      const name = text(value,100), matches = registry.get(name);
      return !name || matches?.size > 1 ? null : matches?.size ? [...matches.values()][0] : name;
    };
  };
  const resolveActor = (state,value) => actorResolver(state)(value);
  const resolveCast = (state,actors,resolve = actorResolver(state)) => {
    const names = list(actors,30).map(resolve);
    return names.some(name => name === null) ? [] : [...new Set(names)];
  };
  // A mention or an absent NPC is not a speaker; world titles stay excluded.
  const audience = ({ state, config, primary = '' } = {}) => {
    const present = (Array.isArray(state?.npcs) ? state.npcs : [])
      .filter(n => n?.presence === 'present').map(n => n.name);
    return resolveCast(state,config?.narrativeMode === 'immersive' ? [primary,...present] : present);
  };
  const canRead = (entry, actors = [], state) => {
    if (entry?.knowledge_scope !== 'actors') return true; // Legacy shared data.
    const resolve = actorResolver(state), cast = resolveCast(state,actors,resolve);
    const known = list(entry.known_by,30).map(resolve).filter(Boolean);
    return cast.length > 0 && cast.every(actor => known.includes(actor));
  };
  const hash = value => { let n = 2166136261; for (const c of String(value)) n = Math.imul(n ^ c.codePointAt(0), 16777619); return (n >>> 0).toString(36); };
  const signature = m => hash(JSON.stringify([m.role, m.content, m.context_content || '']));
  const terms = value => {
    const s = String(value || '').toLowerCase(), out = s.match(/[a-z0-9_]{2,}/g) || [];
    for (const run of s.match(/[\u3400-\u9fff]{2,}/g) || []) {
      out.push(run);
      for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
    }
    return [...new Set(out)].slice(0, 160);
  };
  const rules = `在原本四類摘要 JSON 之外，可附加 episodes 陣列（最多 12 筆），只提取本次待整理原文的重要事件，不重抄既有摘要。每筆格式：{"text":"精簡事件","time":"原文明說的故事時間或空字串","entities":["人物／地點"],"keywords":["線索／同義詞"],"evidenceIds":["原文 message ID"],"visibility":"restricted|public","certainty":"confirmed|rumor|inference|retracted","supersedes":["被明確推翻的既有事件 ID"],"knowledge":[{"actor":"角色正式名稱","mode":"witnessed|told|rumor|inferred","claim":"此角色實際知道或相信的內容","evidenceIds":["得知資訊的 message ID"]}]}。visibility 預設 restricted；只有原文明確對所有人公開的事件才用 public，不可因玩家看過就視為公開。角色出場不代表知情；knowledge 只能根據目擊、告知、傳聞或推理的明確原文來源，無來源留空。傳聞、猜測與錯誤信念不能改寫客觀事實。supersedes 只在本次原文明確推翻既有事件結論時填入，正常後續發展與和解不等於原事件未發生。不得推測日期或玩家心理。既有事件在後續對話被角色得知、誤信或更正時，可另輸出 knowledgeUpdates（最多 12 筆），格式為 {"eventId":"既存事件 ID","actor":"角色正式名稱","mode":"witnessed|told|rumor|inferred","claim":"該角色此刻實際知道或相信的內容","evidenceIds":["本次新對話 message ID"]}；只根據本輪新原文更新，不可根據事件索引臆造角色知情，不用把舊事件再新增一次；完全沒有更新時輸出空陣列。`;
  const strings = { type: 'array', items: { type: 'string' } };
  const schema = { type: 'object', properties: {
    events: strings, knownFacts: strings, relationships: strings, openThreads: strings,
    episodes: { type: 'array', items: { type: 'object', properties: {
      text: { type: 'string' }, time: { type: 'string' }, entities: strings, keywords: strings, evidenceIds: strings,
      visibility: { type: 'string', enum: ['restricted', 'public'] },
      certainty: { type: 'string', enum: ['confirmed', 'rumor', 'inference', 'retracted'] }, supersedes: strings,
      knowledge: { type: 'array', items: { type: 'object', properties: {
        actor: { type: 'string' }, mode: { type: 'string', enum: ['witnessed', 'told', 'rumor', 'inferred'] }, claim: { type: 'string' }, evidenceIds: strings
      }, required: ['actor', 'mode', 'claim', 'evidenceIds'] } }
    }, required: ['text', 'time', 'entities', 'keywords', 'evidenceIds', 'visibility', 'certainty', 'knowledge'] } },
    knowledgeUpdates: { type: 'array', items: { type: 'object', properties: {
      eventId: { type: 'string' }, actor: { type: 'string' },
      mode: { type: 'string', enum: ['witnessed', 'told', 'rumor', 'inferred'] },
      claim: { type: 'string' }, evidenceIds: strings
    }, required: ['eventId', 'actor', 'mode', 'claim', 'evidenceIds'] } }
  }, required: ['events', 'knownFacts', 'relationships', 'openThreads', 'episodes'] };
  function ingest(state, raw, chunk) {
    if (!state || (!Array.isArray(raw?.episodes) && !Array.isArray(raw?.knowledgeUpdates))) return;
    const sources = new Map(chunk.filter(m => m.id).map(m => [m.id, m]));
    const anchors = ids => {
      const names = list(ids);
      return names.length && names.every(id => sources.has(id)) ? names.map(id => ({ id, signature: signature(sources.get(id)) })) : [];
    };
    const previous = Array.isArray(state.episodicMemory?.events) ? state.episodicMemory.events.filter(object).slice(-1000) : [];
    const events = previous.slice();
    for (const rawEvent of (Array.isArray(raw.episodes) ? raw.episodes : []).slice(0, 12)) {
      if (!object(rawEvent)) continue;
      const content = text(rawEvent.text), evidence = anchors(rawEvent.evidenceIds);
      if (!content || !evidence.length) continue;
      const knowledge = (Array.isArray(rawEvent.knowledge) ? rawEvent.knowledge : []).slice(0, 30).flatMap(k => {
        if (!object(k) || !['witnessed', 'told', 'rumor', 'inferred'].includes(k.mode)) return [];
        const actor = text(k.actor, 100), claim = text(k.claim), evidence = anchors(k.evidenceIds);
        return actor && claim && evidence.length ? [{ actor, claim, mode: k.mode, evidence }] : [];
      });
      const id = `episode-${hash(evidence.map(e => e.id).join("|"))}-${hash(content)}`;
      const next = { id, text: content, time: text(rawEvent.time, 100), entities: list(rawEvent.entities), keywords: list(rawEvent.keywords), evidence,
        visibility: rawEvent.visibility === 'public' ? 'public' : 'restricted',
        certainty: ['confirmed', 'rumor', 'inference', 'retracted'].includes(rawEvent.certainty) ? rawEvent.certainty : 'inference', knowledge };
      const order = new Map(chunk.map((m, i) => [m.id, i]));
      next.supersedes = list(rawEvent.supersedes).filter(target => previous.some(e => object(e) && e.id === target && e.id !== id &&
        Array.isArray(e.evidence) && e.evidence.every(a => object(a) && !order.has(a.id))));
      const index = events.findIndex(e => e.id === id);
      if (index < 0) events.push(next); else events[index] = next;
    }
    // Later knowledge does not rewrite the event's objective facts. Keep dated
    // observations so rewinding a branch still retrieves earlier beliefs.
    const order = new Map(chunk.map((m, i) => [m.id, i]));
    for (const item of (Array.isArray(raw.knowledgeUpdates) ? raw.knowledgeUpdates : []).slice(0, 12)) {
      if (!object(item) || !['witnessed', 'told', 'rumor', 'inferred'].includes(item.mode)) continue;
      const id = text(item.eventId, 180), actor = text(item.actor, 100), claim = text(item.claim);
      const evidence = anchors(item.evidenceIds);
      const event = events.find(e => e?.id === id);
      if (!event || !actor || !claim || !evidence.length) continue;
      const earliest = Math.min(...evidence.map(e => order.get(e.id)));
      const originInChunk = (event.evidence || []).map(e => order.get(e.id)).filter(Number.isInteger);
      // If the original event and update are in this chunk, the new
      // knowledge must actually occur later; otherwise use prior chunks.
      if (originInChunk.length && earliest <= Math.max(...originInChunk)) continue;
      const record = { actor, mode: item.mode, claim, evidence };
      const history = Array.isArray(event.knowledge) ? event.knowledge : [];
      if (history.some(k => k.actor === actor && k.mode === record.mode && k.claim === claim
        && JSON.stringify(k.evidence) === JSON.stringify(evidence))) continue;
      event.knowledge = [...history, record].slice(-100);
    }
    state.episodicMemory = { version: 1, events: events.slice(-1000) };
  }
  function recall({ state, messages = [], input = '', actors = [], exclude = '', maxChars = 2400, onDecision = () => {} }) {
    const sources = new Map(messages.map((m, i) => [m.id, { message: m, index: i }]));
    const valid = evidence => Array.isArray(evidence) && evidence.length && evidence.every(e => object(e) && sources.has(e.id) && signature(sources.get(e.id).message) === e.signature);
    const resolve = actorResolver(state), words = terms(input), audience = resolveCast(state,actors,resolve);
    const excluded = String(exclude), seen = new Set(), candidates = [];
    const events = (Array.isArray(state?.episodicMemory?.events) ? state.episodicMemory.events : []).slice(-1000);
    const superseded = new Set();
    for (const update of events) {
      if (!object(update) || !valid(update.evidence) || !['confirmed', 'retracted'].includes(update.certainty)) continue;
      for (const target of list(update.supersedes)) {
        const old = events.find(e => e?.id === target);
        if (old && valid(old.evidence) && Math.min(...update.evidence.map(e => sources.get(e.id).index)) > Math.max(...old.evidence.map(e => sources.get(e.id).index))) superseded.add(target);
      }
    }
    for (const event of events) {
      if (!object(event)) continue;
      const decision = reason => onDecision({id: event.id, reason});
      if (!valid(event.evidence)) { decision('evidence'); continue; }
      if (event.certainty === 'retracted' || superseded.has(event.id)) { decision('retracted'); continue; }
      // A single shared request must not receive secrets inaccessible to any
      // current speaker. Unknown cast => only explicitly public facts.
      const knowledge = audience.map(actor => {
        const history = (Array.isArray(event.knowledge) ? event.knowledge : []).filter(k =>
          object(k) && resolve(k.actor) === actor && valid(k.evidence));
        history.sort((a, b) => Math.max(...a.evidence.map(e => sources.get(e.id).index))
          - Math.max(...b.evidence.map(e => sources.get(e.id).index)));
        return history.length ? [history[history.length - 1]] : [];
      });
      const shared = event.visibility === 'public' && event.certainty === 'confirmed';
      const known = audience.length && knowledge.every(items => items.length);
      if (!shared && !known) { decision('knowledge'); continue; }
      const claims = shared ? [{ text: event.text, label: '公開事實', evidence: event.evidence }] : knowledge.flatMap((items, i) => items.filter(k => knowledge.every(group => group.some(other => other.claim === k.claim))).map(k => ({ text: k.claim, label: `${audience[i]}｜${k.mode}`, evidence: k.evidence })));
      if (!claims.length) { decision('knowledge'); continue; }
      const visibleClaims = claims.filter(c => c.text && !excluded.includes(c.text));
      const lines = visibleClaims.map(c => `${c.label}：${text(c.text)}`);
      if (!lines.length) { decision('duplicate'); continue; }
      const haystack = [shared ? event.text : '', ...list(event.entities), ...list(event.keywords), ...claims.map(c => c.text)].join('\n').toLowerCase();
      let score = words.reduce((n, word) => n + (haystack.includes(word) ? 1 : 0), 0);
      // Relational cues may omit the event's original words entirely.
      if (/還記得|上次|以前|當時|承諾|怪我|生.*氣|remember|last time/i.test(input) && audience.some(actor => list(event.entities).some(name => resolve(name) === actor))) score += 2;
      // A bounded tag fallback, not semantic search: require interpersonal
      // wording, an explicit participant and a trust-related visible claim.
      let match;
      if (!score && !shared
        && /(?:相信|信任|信得過|信不過|不信)(?:我們|我|你|妳|彼此)/.test(input)
        && list(event.keywords).some(tag => /^(?:信任|trust)$/i.test(tag))
        && audience.some(actor => list(event.entities).some(name => resolve(name) === actor))
        && visibleClaims.some(claim => /信任|相信|說謊|欺騙|隱瞞|背叛/.test(claim.text))) {
        score = 1; match = 'trust-tag';
      }
      if (!score) { decision('irrelevant'); continue; }
      const index = Math.max(...event.evidence.map(e => sources.get(e.id).index));
      candidates.push({ event, score, ...(match ? {match} : {}), index, lines, shared, proofs: visibleClaims.map((claim,i) => ({line:lines[i],evidence:claim.evidence})) });
    }
    candidates.sort((a, b) => b.score - a.score || b.index - a.index || String(a.event.id).localeCompare(String(b.event.id)));
    const selected = []; let used = 0;
    for (const candidate of candidates) {
      const lines = candidate.lines.filter(line => !seen.has(line));
      if (!lines.length) { onDecision({id:candidate.event.id, reason:'duplicate'}); continue; }
      const sourceIds = [...new Set(candidate.proofs.filter(proof => lines.includes(proof.line)).flatMap(proof => proof.evidence.map(e => e.id)))];
      const block = `〔${text(candidate.event.id, 180)}${candidate.shared && candidate.event.time ? `｜${text(candidate.event.time, 100)}` : ''}｜${candidate.shared ? 'confirmed' : '角色認知'}〕\n${lines.join('\n')}\n來源：${sourceIds.join('、')}`;
      if (used + block.length > Math.min(2400, Math.max(0, maxChars)) || selected.length >= 4) { onDecision({id:candidate.event.id, reason:'budget',score:candidate.score,...(candidate.match ? {match:candidate.match} : {})}); continue; }
      selected.push({ id: candidate.event.id, block }); used += block.length; lines.forEach(line => seen.add(line));
      onDecision({id:candidate.event.id, reason:'included',score:candidate.score,...(candidate.match ? {match:candidate.match} : {})});
    }
    return selected;
  }
  // Read-only inspector for the player. The assistant receives only recall()
  // output, never this full table. Invalid/revised source evidence is hidden.
  function knowledgeMatrix({ state, messages = [], maxEvents = 20, includeEvidence = false }) {
    const sources = new Map(messages.map((m, i) => [m.id, { message: m, index: i }]));
    const valid = anchors => Array.isArray(anchors) && anchors.length > 0
      && anchors.every(e => object(e) && sources.has(e.id)
        && signature(sources.get(e.id).message) === e.signature);
    const events = Array.isArray(state?.episodicMemory?.events) ? state.episodicMemory.events : [];
    return events.filter(e => object(e) && valid(e.evidence)).slice(-Math.max(1, Math.min(50, Number(maxEvents) || 20))).map(event => {
      const byActor = new Map();
      for (const entry of Array.isArray(event.knowledge) ? event.knowledge : []) {
        if (!object(entry) || !entry.actor || !valid(entry.evidence)) continue;
        const seenAt = Math.max(...entry.evidence.map(e => sources.get(e.id).index));
        if (!byActor.has(entry.actor) || seenAt >= byActor.get(entry.actor).seenAt)
          byActor.set(entry.actor, { actor: entry.actor, mode: entry.mode, claim: entry.claim, seenAt,
            ...(includeEvidence ? { evidence: entry.evidence.map(e => ({ id: e.id, signature: e.signature })) } : {}) });
      }
      return { id: event.id, text: event.text, time: event.time || '',
        visibility: event.visibility, certainty: event.certainty,
        knowledge: [...byActor.values()].map(({ seenAt, ...k }) => k) };
    }).reverse();
  }
  const updateContext = state => (Array.isArray(state?.episodicMemory?.events) ? state.episodicMemory.events : []).filter(object).slice(-8).map(e => ({ id: e.id, text: text(e.text, 120) }));
  window.BAOEpisodicMemory = { rules, schema, updateContext, ingest, recall, knowledgeMatrix, audience, canRead, resolveActor, terms, signature };
})();
