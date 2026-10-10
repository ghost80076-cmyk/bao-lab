(function(root) {
  'use strict';
  const id = 'three_realms_cultivation';
  const paths = {
    '下界鬥氣': ['鬥之氣', '鬥者', '鬥師', '大鬥師', '鬥靈', '鬥王', '鬥皇', '鬥宗'],
    '中界': ['化神期', '煉虛期', '合體期', '大乘期', '渡劫期'],
    '上界': ['小神', '中神', '大神', '天君', '天帝'],
    '鬼界': ['厲鬼', '鬼將', '鬼王', '鬼帝']
  };
  // The supplied source only establishes 元嬰期 for the lower spiritual route.
  // Other lower spiritual ranks stay free text instead of inventing a ladder.
  const routes = [...Object.keys(paths), '下界靈氣'];
  const textFields = {
    route: '修煉路線', realm: '境界', cultivation: '修為', energy_kind: '力量種類',
    karma: '業力程度', merit: '功德積累', bottleneck: '瓶頸與準備',
    breakthrough_result: '突破結果', ascension_result: '飛升結果',
    condition: '修煉狀態', evidence: '本次變化依據'
  };
  const fields = [
    ...Object.entries(textFields).map(([key, label]) => ({ key, label, type: 'text' })),
    { key: 'progress', label: '修煉進度（%）', type: 'meter', min: 0, max: 100 },
    { key: 'energy', label: '剩餘力量', type: 'number', min: 0 },
    { key: 'energy_max', label: '力量上限', type: 'number', min: 0 }
  ];
  const rules = '三界九域原生修煉狀態。未知欄位省略，不填預設數字。修為、業力、功德保留文本程度；只有正文明定數值才更新進度或力量。突破／飛升意圖與準備不等於成功。任何變化須提供 evidence，逐字引用本批玩家輸入或故事正文的明確事實（不可引用狀態附錄）。路線：下界鬥氣、下界靈氣、中界、上界、鬼界。下界鬥氣依序：鬥之氣→鬥者→鬥師→大鬥師→鬥靈→鬥王→鬥皇→鬥宗；中界：化神期→煉虛期→合體期→大乘期→渡劫期；上界：小神→中神→大神→天君→天帝；鬼界：厲鬼→鬼將→鬼王→鬼帝。下界靈氣完整階梯未提供，不補造。進階須 breakthrough_result="成功"；失敗不得升階，降階须 breakthrough_result="修為倒退"。鬥宗或元嬰期成功飛升中界為化神期；大乘期／渡劫期成功飛升上界為小神。跨界須 ascension_result="成功"；進入鬼界須 ascension_result="墮落"；鬼界返回須 ascension_result="回歸"。不可自行用功德一比一抵消業力、擲骰決定生死或自動消耗物品。';
  const preset = {
    label: '三界修煉', icon: '△', tracking: 'high', context: 'core', kind: 'object',
    triggers: ['修煉', '修為', '鬥氣', '靈力', '神力', '鬼力', '業力', '功德', '突破', '飛升', '渡劫', '心魔'],
    description: '追蹤三界九域的境界、修為、力量、業力、功德與突破／飛升結果。未知資料保持空白；只有故事明確發生的變化才會寫入。', fields
  };
  const object = x => x && typeof x === 'object' && !Array.isArray(x);
  const clean = raw => {
    const out = {};
    if (!object(raw)) return out;
    for (const f of fields) {
      if (!Object.hasOwn(raw, f.key)) continue;
      const v = raw[f.key];
      if (f.type === 'text' && typeof v === 'string') out[f.key] = v.trim().slice(0, f.key === 'evidence' ? 800 : 300);
      if (f.type !== 'text' && typeof v === 'number' && Number.isFinite(v) && v >= 0 && (f.max === undefined || v <= f.max)) out[f.key] = v;
    }
    return out;
  };
  const validatePatch = (current, raw, sourceText) => {
    const previous = clean(current), patch = clean(raw);
    const reject = reason => ({ ok: false, reason, value: previous });
    for (const field of fields.filter(f => f.type !== 'text')) {
      if (object(raw) && Object.hasOwn(raw, field.key) && !Object.hasOwn(patch, field.key)) return reject('修煉數值格式或範圍不正確，已保留原狀態。');
    }
    if (['route', 'realm'].some(key => previous[key] && Object.hasOwn(patch, key) && !patch[key])) return reject('已確認的路線與境界不可清空。');
    if (!Object.keys(patch).length) return reject('沒有有效的修煉欄位。');
    const changed = Object.keys(patch).some(k => k !== 'evidence' && patch[k] !== previous[k]);
    if (!changed) return { ok: true, value: { ...previous, ...patch } };
    if (!patch.evidence || !String(sourceText || '').includes(patch.evidence)) return reject('修煉變化缺少本批故事的明確依據，已保留原狀態。');
    const next = { ...previous, ...patch };
    if (next.route && !routes.includes(next.route)) return reject('修煉路線不在三界九域設定內。');
    if (next.realm && !next.route) return reject('需要先確認修煉路線，才可記錄境界。');
    if (paths[next.route] && next.realm && !paths[next.route].includes(next.realm)) return reject('境界與修煉路線不符，已保留原狀態。');
    if (next.energy !== undefined && next.energy_max !== undefined && next.energy > next.energy_max) return reject('剩餘力量不可超過力量上限。');
    if (previous.route && next.route && previous.route !== next.route) {
      const lower = ['下界鬥氣', '下界靈氣'].includes(previous.route);
      const lowerReady = previous.route === '下界鬥氣' ? previous.realm === '鬥宗' : previous.realm === '元嬰期';
      const ascended = patch.ascension_result === '成功' && (
        (lower && lowerReady && next.route === '中界' && next.realm === '化神期') ||
        (previous.route === '中界' && ['大乘期', '渡劫期'].includes(previous.realm) && next.route === '上界' && next.realm === '小神')
      );
      const fallen = next.route === '鬼界' && patch.ascension_result === '墮落';
      const returned = previous.route === '鬼界' && next.route !== '鬼界' && patch.ascension_result === '回歸';
      if (!ascended && !fallen && !returned) return reject('跨界條件或飛升結果不符，已保留原狀態。');
    } else if (previous.realm && next.realm !== previous.realm) {
      if (!['成功', '修為倒退'].includes(patch.breakthrough_result)) return reject('境界變化需要明確的突破成功或修為倒退結果。');
      const ladder = paths[next.route];
      if (ladder) {
        const before = ladder.indexOf(previous.realm), after = ladder.indexOf(next.realm);
        if (before < 0 || (patch.breakthrough_result === '成功' ? after <= before : after >= before)) return reject('境界變化與突破結果不符。');
      }
    }
    return { ok: true, value: next };
  };
  const api = { id, paths, routes, fields, rules, preset, clean, validatePatch };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOThreeRealmsCultivation = api;
})(typeof window === 'undefined' ? null : window);
