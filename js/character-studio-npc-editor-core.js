/* Studio-only NPC editing helpers. Existing card schema remains the source of truth. */
(function (root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStudioNPCEditorCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const START = '【夜灣 NPC 目標】';
  const END = '【/夜灣 NPC 目標】';
  const SECRET_END = '【/夜灣 NPC 作者備註】';
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value ?? '').trim();
  const key = value => text(value).toLocaleLowerCase();
  const fail = value => { throw new Error(value); };
  const limited = (value, label, max) => {
    const v = text(value);
    if (v.length > max) fail(label + '不可超過 ' + max + ' 字。');
    return v;
  };
  const secretStart = name => '【夜灣 NPC 作者備註:' + encodeURIComponent(text(name)) + '】';
  const numberOf = (source, needle) => source.split(needle).length - 1;
  const aliasesOf = value => {
    const list = Array.isArray(value) ? value : String(value ?? '').split(/[,，、\n]/);
    const result = [], used = new Set();
    list.forEach(raw => {
      const alias = limited(raw, '別名', 100), id = key(alias);
      if (!alias || used.has(id)) return;
      used.add(id); result.push(alias);
    });
    if (result.length > 8) fail('每位 NPC 最多 8 個別名。');
    return result;
  };
  function splitGoal(source) {
    const raw = String(source ?? '');
    const opens = numberOf(raw, START), closes = numberOf(raw, END);
    if (!opens && !closes) return { goal: '', notes: raw.trim() };
    if (opens !== 1 || closes !== 1) fail('NPC 目標標記不完整或重複，請先檢查原始補充內容。');
    const from = raw.indexOf(START), to = raw.indexOf(END);
    if (to < from + START.length) fail('NPC 目標標記順序錯誤。');
    return {
      goal: raw.slice(from + START.length, to).trim(),
      notes: (raw.slice(0, from) + raw.slice(to + END.length)).trim()
    };
  }
  function withGoal(notes, goal) {
    const extra = limited(notes, '其他補充', 1500);
    if (extra.includes(START) || extra.includes(END)) fail('其他補充不可包含系統目標標記。');
    const wanted = limited(goal, 'NPC 目標', 800);
    if (wanted.includes(START) || wanted.includes(END)) fail('NPC 目標不可包含系統標記。');
    return [extra, wanted ? START + '\n' + wanted + '\n' + END : ''].filter(Boolean).join('\n\n');
  }
  function locateSecret(source, name) {
    const raw = String(source ?? ''), start = secretStart(name);
    if (!raw.includes(start)) return null;
    if (numberOf(raw, start) !== 1) fail('同名 NPC 作者備註標記重複，不能安全覆寫。');
    const from = raw.indexOf(start), end = raw.indexOf(SECRET_END, from + start.length);
    if (end < 0 || raw.slice(from + start.length, end).includes('【夜灣 NPC 作者備註:')) fail('NPC 作者備註標記不完整。');
    return { from, until: end + SECRET_END.length, content: raw.slice(from + start.length, end).trim() };
  }
  function readSecret(source, name) {
    return locateSecret(source, name)?.content || '';
  }
  function withSecret(source, name, value) {
    const raw = String(source ?? '');
    const secret = limited(value, '作者備註', 1200);
    if (secret.includes(SECRET_END) || secret.includes('【夜灣 NPC 作者備註:')) fail('作者備註不可包含系統標記。');
    const block = secret ? secretStart(name) + '\n' + secret + '\n' + SECRET_END : '';
    const old = locateSecret(raw, name);
    if (old) return (raw.slice(0, old.from) + block + raw.slice(old.until)).trim();
    return [raw.trim(), block].filter(Boolean).join('\n\n');
  }
  function inspect(npc, creatorNotes = '') {
    if (!npc || typeof npc !== 'object' || Array.isArray(npc)) fail('NPC 資料格式無效。');
    const separated = splitGoal(npc.notes || '');
    const name = text(npc.name);
    return {
      name, aliases: aliasesOf(npc.aliases || []).join('、'),
      role: text(npc.role), appearance: text(npc.appearance),
      personality: text(npc.personality), outfit: text(npc.outfit),
      relationship: text(npc.relationship), mood: text(npc.mood),
      location: text(npc.location),
      presence: ['present', 'away', 'unknown'].includes(npc.presence) ? npc.presence : 'unknown',
      goal: separated.goal, notes: separated.notes, secret: readSecret(creatorNotes, name)
    };
  }
  function upsert(original, input, editingName = '') {
    if (!Array.isArray(original)) fail('原始 NPC 名冊格式無效。');
    const list = copy(original), name = limited(input?.name, '角色姓名', 100);
    if (!name || /[\r\n]/.test(name)) fail('請填寫單行的角色姓名。');
    const oldName = text(editingName);
    if (oldName && key(name) !== key(oldName)) fail('已存在角色的姓名可能被狀態和世界書引用，請先手動遷移引用後再更名。');
    const index = oldName ? list.findIndex(n => key(n?.name) === key(oldName)) : -1;
    if (oldName && index < 0) fail('找不到原本的 NPC，可能已切換作品。');
    if (!oldName && list.length >= 50) fail('初始 NPC 名冊最多 50 人。');
    const aliases = aliasesOf(input.aliases).filter(alias => key(alias) !== key(name));
    const selfKeys = new Set([key(name), ...aliases.map(key)]);
    if (list.some((n, i) => i !== index && [n?.name, ...aliasesOf(n?.aliases || [])].some(v => selfKeys.has(key(v))))) {
      fail('角色姓名或別名與現有 NPC 衝突，可能導致人物合併。');
    }
    const npc = index >= 0 ? list[index] : {};
    npc.name = name;
    if (aliases.length) npc.aliases = aliases; else delete npc.aliases;
    for (const [field, max] of Object.entries({
      role: 160, appearance: 800, personality: 1200, outfit: 500,
      relationship: 800, mood: 160, location: 160
    })) {
      const value = limited(input[field], field, max);
      if (value) npc[field] = value; else delete npc[field];
    }
    const notes = withGoal(input.notes, input.goal);
    if (notes) npc.notes = notes; else delete npc.notes;
    const presence = text(input.presence);
    if (!['present', 'away', 'unknown'].includes(presence)) fail('請選擇合法的初始在場狀態。');
    npc.presence = presence;
    if (index >= 0) list[index] = npc; else list.push(npc);
    return list;
  }
  function remove(original, name) {
    if (!Array.isArray(original)) fail('原始 NPC 名冊格式無效。');
    const matches = original.filter(n => key(n?.name) === key(name));
    if (matches.length !== 1) fail('無法唯一識別要移除的 NPC。');
    return copy(original.filter(n => key(n?.name) !== key(name)));
  }
  return { aliasesOf, splitGoal, withGoal, inspect, readSecret, withSecret, upsert, remove };
});
