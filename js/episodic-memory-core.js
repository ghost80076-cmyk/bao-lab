/* Local event index. No network, embeddings, or cross-story storage. */
(() => {
  'use strict';
  const object = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = (v, max = 240) => typeof v === 'string' ? v.trim().slice(0, max) : '';
  const list = (v, max = 24) => Array.isArray(v) ? [...new Set(v.map(x => text(x, 100)).filter(Boolean))].slice(0, max) : [];
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
  const rules = `在原本四類摘要 JSON 之外，可附加 episodes 陣列（最多 12 筆），只提取本次待整理原文的重要事件，不重抄既有摘要。每筆格式：{"text":"精簡事件","time":"原文明說的故事時間或空字串","entities":["人物／地點"],"keywords":["線索／同義詞"],"evidenceIds":["原文 message ID"],"visibility":"restricted|public","certainty":"confirmed|rumor|inference|retracted","supersedes":["被明確推翻的既有事件 ID"],"knowledge":[{"actor":"角色正式名稱","mode":"witnessed|told|rumor|inferred","claim":"此角色實際知道或相信的內容","evidenceIds":["得知資訊的 message ID"]}]}。visibility 預設 restricted；只有原文明確對所有人公開的事件才用 public，不可因玩家看過就視為公開。角色出場不代表知情；knowledge 只能根據目擊、告知、傳聞或推理的明確原文來源，無來源留空。傳聞、猜測與錯誤信念不能改寫客觀事實。supersedes 只在本次原文明確推翻既有事件結論時填入，正常後續發展與和解不等於原事件未發生。不得推測日期或玩家心理。`;
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
    }, required: ['text', 'time', 'entities', 'keywords', 'evidenceIds', 'visibility', 'certainty', 'knowledge'] } }
  }, required: ['events', 'knownFacts', 'relationships', 'openThreads', 'episodes'] };
  function ingest(state, raw, chunk) {
    if (!state || !Array.isArray(raw?.episodes)) return;
    const sources = new Map(chunk.filter(m => m.id).map(m => [m.id, m]));
    const anchors = ids => {
      const names = list(ids);
      return names.length && names.every(id => sources.has(id)) ? names.map(id => ({ id, signature: signature(sources.get(id)) })) : [];
    };
    const previous = Array.isArray(state.episodicMemory?.events) ? state.episodicMemory.events.filter(object).slice(-1000) : [];
    const events = previous.slice();
    for (const rawEvent of raw.episodes.slice(0, 12)) {
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
    state.episodicMemory = { version: 1, events: events.slice(-1000) };
  }
  function recall({ state, messages = [], input = '', actors = [], exclude = '', maxChars = 2400 }) {
    const sources = new Map(messages.map((m, i) => [m.id, { message: m, index: i }]));
    const valid = evidence => Array.isArray(evidence) && evidence.length && evidence.every(e => object(e) && sources.has(e.id) && signature(sources.get(e.id).message) === e.signature);
    const words = terms(input), audience = list(actors, 30);
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
      if (!object(event) || !valid(event.evidence) || event.certainty === 'retracted' || superseded.has(event.id)) continue;
      // A single shared request must not receive secrets inaccessible to any
      // current speaker. Unknown cast => only explicitly public facts.
      const knowledge = audience.map(actor => (Array.isArray(event.knowledge) ? event.knowledge : []).filter(k => object(k) && k.actor === actor && valid(k.evidence)));
      const shared = event.visibility === 'public' && event.certainty === 'confirmed';
      const known = audience.length && knowledge.every(items => items.length);
      if (!shared && !known) continue;
      const claims = shared ? [{ text: event.text, label: '公開事實' }] : knowledge.flatMap((items, i) => items.filter(k => knowledge.every(group => group.some(other => other.claim === k.claim))).map(k => ({ text: k.claim, label: `${audience[i]}｜${k.mode}` })));
      const lines = claims.filter(c => c.text && !excluded.includes(c.text)).map(c => `${c.label}：${text(c.text)}`);
      if (!lines.length) continue;
      const haystack = [event.text, ...list(event.entities), ...list(event.keywords), ...claims.map(c => c.text)].join('\n').toLowerCase();
      let score = words.reduce((n, word) => n + (haystack.includes(word) ? 1 : 0), 0);
      // Relational cues may omit the event's original words entirely.
      if (/還記得|上次|以前|當時|承諾|怪我|生.*氣|remember|last time/i.test(input) && audience.some(actor => list(event.entities).includes(actor))) score += 2;
      if (!score) continue;
      const index = Math.max(...event.evidence.map(e => sources.get(e.id).index));
      candidates.push({ event, score, index, lines, shared });
    }
    candidates.sort((a, b) => b.score - a.score || b.index - a.index || String(a.event.id).localeCompare(String(b.event.id)));
    const selected = []; let used = 0;
    for (const candidate of candidates) {
      const lines = candidate.lines.filter(line => !seen.has(line));
      if (!lines.length) continue;
      const block = `〔${text(candidate.event.id, 180)}${candidate.shared && candidate.event.time ? `｜${text(candidate.event.time, 100)}` : ''}｜${candidate.shared ? 'confirmed' : '角色認知'}〕\n${lines.join('\n')}\n來源：${candidate.event.evidence.map(e => e.id).join('、')}`;
      if (used + block.length > Math.min(2400, Math.max(0, maxChars))) continue;
      selected.push({ id: candidate.event.id, block }); used += block.length; lines.forEach(line => seen.add(line));
      if (selected.length === 4) break;
    }
    return selected;
  }
  const updateContext = state => (Array.isArray(state?.episodicMemory?.events) ? state.episodicMemory.events : []).filter(object).slice(-8).map(e => ({ id: e.id, text: text(e.text, 120) }));
  window.BAOEpisodicMemory = { rules, schema, updateContext, ingest, recall, terms, signature };
})();
