/* Source-anchored, provider-neutral full-story memory reconstruction planning. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOFullMemoryRebuildCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const KEYS = ['events', 'knownFacts', 'relationships', 'openThreads'];
  const KINDS = ['time', 'location', 'character', 'relationship', 'money', 'inventory', 'contract', 'quest', 'other'];
  const copy = value => JSON.parse(JSON.stringify(value));
  const fingerprint = value => {
    const s = JSON.stringify(value), length = s.length;
    let a = 2166136261, b = 5381;
    for (let i = 0; i < length; i++) {
      a = Math.imul(a ^ s.charCodeAt(i), 16777619);
      b = (Math.imul(b, 33) ^ s.charCodeAt(i)) >>> 0;
    }
    return length + ':' + (a >>> 0) + ':' + b;
  };
  function units(messages) {
    const groups = [];
    let before = [], pending = null;
    for (let i = 0; i < (messages || []).length; i++) {
      const m = messages[i];
      if (!m || !['user', 'assistant'].includes(m.role)) continue;
      const entry = { id: String(m.id || ''), role: m.role,
        content: String(m.role === 'assistant' && m.context_content ? m.context_content : m.content || ''),
        original: String(m.content || ''), index: i };
      if (!entry.id) throw new Error('部分原始對話沒有穩定訊息 ID；請重新載入存檔後再試。');
      if (m.role === 'user') {
        if (pending?.items.some(x => x.role === 'assistant')) groups.push(pending);
        else if (pending) throw new Error('歷史中間出現沒有角色回覆的玩家輪次；不能跳過未完成的原文。');
        pending = { items: before.concat(entry), start: before[0]?.index ?? i };
        before = [];
      } else if (pending) {
        pending.items.push(entry);
      } else before.push(entry); // opening greeting belongs to the first completed exchange
    }
    if (pending?.items.some(x => x.role === 'assistant')) groups.push(pending);
    return groups.map((g, i) => ({
      round: i + 1, start: g.start, end: g.items.at(-1).index,
      endId: g.items.at(-1).id, messages: g.items
    }));
  }
  function sourceFingerprint(grouped) {
    return fingerprint(grouped.map(g => g.messages.map(m => [m.id, m.role, m.original, m.content])));
  }
  function plan(messages, keepRounds = 20) {
    const all = units(messages), keep = Number(keepRounds);
    if (!Number.isInteger(keep) || keep < 4 || keep > 100) throw new Error('近期保留輪數必須在 4～100 之間。');
    if (all.length <= keep) throw new Error('已完成的對話不多於近期保留輪數，沒有需要壓縮的舊劇情。');
    const selected = all.slice(0, -keep);
    return { units: selected, eligible: selected.length, keepRounds: keep,
      endId: selected.at(-1).endId, endIndex: selected.at(-1).end,
      signature: sourceFingerprint(selected), totalComplete: all.length };
  }
  function restore(messages, info) {
    const grouped = units(messages), end = grouped.findIndex(g => g.endId === info.endId);
    if (end < 0 || end + 1 !== info.eligible) throw new Error('重建來源輪次已改變，不能套用舊進度。');
    const selected = grouped.slice(0, end + 1);
    if (sourceFingerprint(selected) !== info.signature) throw new Error('重建來源原文已修改，舊進度不能續作或套用。');
    return { units: selected, endIndex: selected.at(-1).end };
  }
  function transcript(groups) {
    return groups.map(g => '【第 ' + g.round + ' 輪】\n' + g.messages.map(m =>
      '[' + m.id + '] ' + (m.role === 'user' ? '玩家' : '故事') + '：' + m.content).join('\n\n')).join('\n\n');
  }
  function batch(groups, offset, core, config, makeMessages) {
    const remaining = groups.slice(offset), selected = [];
    for (const group of remaining.slice(0, 20)) {
      const candidate = selected.concat(group);
      if (transcript(candidate).length > 24000 || !core.fits(config, makeMessages(transcript(candidate), candidate))) break;
      selected.push(group);
    }
    if (!selected.length) throw new Error('單輪完整對話超出整理模型預算；沒有裁切未完成的對話，請改用較大容量模型。');
    return selected;
  }
  function parse(text) {
    const raw = String(text || '').trim().replace(/^\x60{3}(?:json)?\s*/i, '').replace(/\s*\x60{3}$/, '');
    try { return JSON.parse(raw); } catch {
      const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
      if (a < 0 || b <= a) throw new Error('模型沒有回傳完整 JSON，未推進進度。');
      try { return JSON.parse(raw.slice(a, b + 1)); }
      catch { throw new Error('模型 JSON 無法解析，未推進進度。'); }
    }
  }
  function cleanResult(raw, allowedIds, expectedCount = 0) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('模型整理內容格式不完整。');
    if (expectedCount && raw.reviewedRounds !== expectedCount) throw new Error('模型未確認完成這一批的全部輪次。');
    const result = {};
    for (const key of KEYS) {
      if (!Array.isArray(raw[key]) || raw[key].length > 16 ||
        raw[key].some(v => typeof v !== 'string' || !v.trim() || v.length > 180))
        throw new Error('整理稿缺少有效的 ' + key + ' 資料。');
      result[key] = [...new Set(raw[key].map(v => v.trim()))];
    }
    const allow = new Set(allowedIds || []);
    result.evidence = [];
    if (expectedCount) {
      if (!Array.isArray(raw.evidence) || raw.evidence.length > 24) throw new Error('缺少本批原文證據清單。');
      for (const evidence of raw.evidence) {
        if (!evidence || typeof evidence.text !== 'string' || !evidence.text.trim() || evidence.text.length > 220 ||
            !Array.isArray(evidence.messageIds) || !evidence.messageIds.length || evidence.messageIds.length > 4 ||
            !evidence.messageIds.every(id => typeof id === 'string' && allow.has(id)))
          throw new Error('事件證據沒有對上本批原始訊息，未保存。');
        result.evidence.push({ text: evidence.text.trim(), messageIds: [...new Set(evidence.messageIds)],
          certainty: evidence.certainty === 'uncertain' ? 'uncertain' : 'confirmed',
          knownBy: Array.isArray(evidence.knownBy) ? evidence.knownBy.filter(x => typeof x === 'string' && x.length <= 80).slice(0, 8) : [] });
      }
      if (KEYS.some(key => result[key].length) && !result.evidence.length) throw new Error('新摘要有事實卻沒有原始訊息來源證據，未保存。');
      if (!Array.isArray(raw.stateEvidence) || raw.stateEvidence.length > 20) throw new Error('缺少狀態證據清單。');
      result.stateEvidence = raw.stateEvidence.map(item => {
        if (!item || !KINDS.includes(item.kind) || typeof item.detail !== 'string' ||
            !item.detail.trim() || item.detail.length > 220 || !Array.isArray(item.messageIds) ||
            !item.messageIds.length || item.messageIds.length > 4 ||
            !item.messageIds.every(id => typeof id === 'string' && allow.has(id)))
          throw new Error('狀態證據不具備可核對來源。');
        return { kind: item.kind, detail: item.detail.trim(), messageIds: [...new Set(item.messageIds)] };
      });
      result.reviewedRounds = expectedCount;
    }
    return result;
  }
  function summary(result) {
    const labels = { events: '重要事件', knownFacts: '人物已知資訊', relationships: '已確認關係', openThreads: '未完成事件' };
    return KEYS.filter(k => result[k]?.length).map(k => labels[k] + '：\n' +
      result[k].map(v => '- ' + v).join('\n')).join('\n\n');
  }
  return Object.freeze({ units, plan, restore, transcript, batch, parse, cleanResult, summary, sourceFingerprint, fingerprint, copy, keys: KEYS });
});
