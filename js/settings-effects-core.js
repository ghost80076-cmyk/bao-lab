/* Read-only presentation of selected controls and captured request evidence. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOSettingsEffectsCore = api;
})(typeof window !== 'undefined' ? window : null, function() {
  'use strict';
  const labels = Object.freeze({ ready:'下次回覆套用', inherited:'依作品安排', conditional:'等待觸發',
    off:'未啟用', replaced:'由其他設定取代', excluded:'不加入請求', display:'僅影響畫面', configured:'依流程執行', unavailable:'尚未載入' });
  const evidenceLabels = Object.freeze({ included:'請求含此規則', missing:'未找到相符規則',
    conditional:'本次未觸發', off:'未啟用', replaced:'由其他設定取代', excluded:'已省略',
    display:'僅影響畫面', inherited:'未額外加規則', configured:'此項未逐字核對', unavailable:'尚未載入',
    changed:'設定已變更，待下次送出', unknown:'尚無送出紀錄' });
  const fingerprint = row => JSON.stringify([row.id, row.value, row.scope, row.source, row.state, row.detail, row.expected || [], row.anyExpected || [], row.target]);
  const publicRow = row => ({ id:row.id, group:row.group, label:row.label, value:String(row.value ?? ''),
    scope:row.scope, source:row.source, state:row.state, detail:row.detail || '',
    stateLabel:labels[row.state] || labels.unavailable });
  function capture(rows = [], messages = []) {
    const systems = messages.filter(m => m?.role === 'system').map(m => String(m.content || '')).join('\n\n');
    const latest = [...messages].reverse().find(m => m?.role === 'user');
    return rows.map(row => {
      const expected = (row.expected || []).filter(Boolean);
      const haystack = row.target === 'latest' ? String(latest?.content || '') : row.target === 'current' ? systems + '\n' + String(latest?.content || '') : systems;
      const matches = expected.length > 0 && expected.every(s => haystack.includes(s));
      const anyMatches = (row.anyExpected || []).some(s => haystack.includes(s));
      let evidence = row.state;
      if (row.state === 'ready') evidence = expected.length ? (matches ? 'included' : 'missing') : 'unavailable';
      if (row.state === 'conditional' && (matches || anyMatches)) evidence = 'included';
      return { ...publicRow(row), stateLabel:row.state === 'ready' ? '送出時已選擇' : labels[row.state], fingerprint:fingerprint(row), evidence, evidenceLabel:evidenceLabels[evidence] || evidenceLabels.unavailable };
    });
  }
  function compare(rows = [], captured = null) {
    const prior = new Map((Array.isArray(captured) ? captured : []).map(row => [row.id, row]));
    return rows.map(row => {
      const previous = prior.get(row.id);
      const evidence = !previous ? 'unknown' : previous.fingerprint !== fingerprint(row) ? 'changed' : previous.evidence;
      return { ...publicRow(row), evidence, evidenceLabel:evidenceLabels[evidence] || evidenceLabels.unavailable };
    });
  }
  return Object.freeze({ labels, evidenceLabels, capture, compare });
});
