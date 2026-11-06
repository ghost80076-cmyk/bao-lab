/* Pure author status draft operations; use existing character_status and initial_state.character_statuses. */
(function (root, factory) {
  const api = Object.freeze(factory());
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAOStudioStatusTemplatesCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
  const plain = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const clean = value => String(value ?? '').trim();
  const error = message => { throw new Error(message); };
  const FIELD_TYPES = ['meter', 'number', 'text', 'boolean', 'tags'];
  const CONTEXT_TYPES = ['core', 'relevant', 'ui_only'];
  const MAX_FIELDS = 24;
  const PRESETS = Object.freeze({
    affinity: Object.freeze({ key: 'affinity', label: '好感度', type: 'meter', min: 0, max: 100, default: 0, context: 'relevant', track: true, description: '只按明確事件調整；好感不代表同意，關係也不必雙向。' }),
    trust: Object.freeze({ key: 'trust', label: '信任度', type: 'meter', min: 0, max: 100, default: 0, context: 'relevant', track: true, description: '依可確認的行為調整；A 信任 B 不等於 B 信任 A。' }),
    hp: Object.freeze({ key: 'hp', label: 'HP／生命', type: 'meter', min: 0, max: 100, default: 100, context: 'core', track: true, description: '以故事中已發生的受傷、治療與恢復事件更新，不推測未發生的傷害。' }),
    energy: Object.freeze({ key: 'energy', label: '能量', type: 'meter', min: 0, max: 100, default: 100, context: 'relevant', track: true, description: '根據有證據的消耗與補充更新，不依每輪對話任意增減。' })
  });
  function validData(data) {
    if (!plain(data) || !plain(data.initial_state || {}) || !plain(data.character_status || {})) error('作品狀態格式不正確。');
    if (!plain(data.initial_state.character_statuses || {})) error('初始人物狀態格式不正確。');
    const cfg = data.character_status || {};
    if (cfg.fields !== undefined && !Array.isArray(cfg.fields)) error('現有狀態欄位不是陣列；為保護資料，本次不覆寫。');
    if ((cfg.fields || []).length > MAX_FIELDS) error('原作品欄位超出上限，請先檢查來源。');
    const keys = new Set();
    for (const f of cfg.fields || []) {
      if (!plain(f) || !/^[A-Za-z0-9_-]{1,40}$/.test(f.key || '') || keys.has(f.key)) {
        error('現有狀態欄位含重複或不合法的 key；請先檢查原始作品。');
      }
      keys.add(f.key);
    }
    return data;
  }
  function fields(data) {
    validData(data);
    return clone(data.character_status.fields || []);
  }
  function numeric(value, label, required) {
    if ((value === '' || value === null || value === undefined) && !required) return undefined;
    if (value === '' || value === null || value === undefined) error(label + '必須填寫有效數字。');
    const n = Number(value);
    if (!Number.isFinite(n)) error(label + '必須填寫有限數字。');
    return n;
  }
  function define(input, existing = null) {
    if (!plain(input)) error('欄位設定格式不正確。');
    const key = clean(input.key);
    const label = clean(input.label);
    const type = clean(input.type);
    const context = clean(input.context);
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) error('欄位 key 只能使用 1–40 個英數、底線或連字號。');
    if (!label || label.length > 40) error('欄位名稱必須是 1–40 字。');
    if (!FIELD_TYPES.includes(type)) error('不支援的欄位類型。');
    if (!CONTEXT_TYPES.includes(context)) error('不支援的上下文用途。');
    const description = clean(input.description);
    if (description.length > 240) error('更新依據最多 240 字。');
    const result = { ...(existing ? clone(existing) : {}), key, label, type, context, track: input.track !== false, description };
    if (type === 'meter' || type === 'number') {
      const min = numeric(input.min, '最小值', false), max = numeric(input.max, '最大值', false);
      if (min !== undefined && max !== undefined && min > max) error('最小值不得大於最大值。');
      const def = numeric(input.default, '預設值', true);
      if (min !== undefined && def < min || max !== undefined && def > max) error('預設值必須在數值範圍內。');
      result.default = def;
      if (min !== undefined) result.min = min; else delete result.min;
      if (max !== undefined) result.max = max; else delete result.max;
    } else {
      delete result.min; delete result.max;
      if (type === 'boolean') result.default = input.default === true || input.default === 'true';
      else if (type === 'tags') result.default = tags(input.default);
      else {
        if (String(input.default ?? '').length > 800) error('預設文字最多 800 字。');
        result.default = String(input.default ?? '');
      }
    }
    return result;
  }
  function tags(raw) {
    const input = Array.isArray(raw) ? raw : String(raw ?? '').split(/[,，、\n]/);
    const result = input.map(item => clean(item)).filter(Boolean);
    if (result.length > 12 || result.some(item => item.length > 80)) error('標籤最多 12 個，每個不得超過 80 字。');
    return result;
  }
  function upsertField(data, input, existingKey = '') {
    validData(data);
    const current = fields(data);
    const old = existingKey ? current.find(item => item.key === existingKey) : null;
    if (existingKey && !old) error('原欄位已不存在，請重新載入。');
    const next = define(input, old);
    if (existingKey && next.key !== existingKey) error('欄位 key 可能已被作品引用，請新增另一欄，勿直接更名。');
    if (current.some(f => f.key === next.key && f.key !== existingKey)) error('同名 key 已存在，不能覆蓋原欄位。');
    if (!old && current.length >= MAX_FIELDS) error('作者原生狀態欄最多 24 個。');
    const updated = old ? current.map(f => f.key === existingKey ? next : f) : [...current, next];
    const result = clone(data);
    result.character_status = { ...result.character_status, enabled: true, fields: updated };
    return result;
  }
  function addPreset(data, presetId) {
    const preset = PRESETS[presetId];
    if (!preset) error('找不到數值模板。');
    if (fields(data).some(f => f.key === preset.key)) error('這個欄位已經存在，不會重複新增。');
    return upsertField(data, preset);
  }
  function removeField(data, key) {
    validData(data);
    const all = fields(data);
    if (!all.some(f => f.key === key)) error('找不到欄位。');
    const result = clone(data);
    // Keep previous per-person values. Restoring an authored field can recover them.
    result.character_status = { ...result.character_status, fields: all.filter(f => f.key !== key) };
    return result;
  }
  function subjects(data) {
    validData(data);
    const cfg = data.character_status || {};
    const main = cfg.primary_character_name ?? cfg.primary_character ?? cfg.subject_name ?? [];
    const configured = Array.isArray(main) ? main : [main];
    const saved = Object.keys(data.initial_state.character_statuses || {});
    const npcs = (Array.isArray(data.initial_state.npcs) ? data.initial_state.npcs : []).map(n => n?.name);
    const available = [...configured, ...npcs, ...saved];
    if (!data.world && !npcs.filter(Boolean).length && clean(data.name)) available.push(data.name);
    const seen = new Set();
    return available.map(clean).filter(name => {
      if (!name || name.length > 100 || seen.has(name)) return false;
      seen.add(name);
      return true;
    });
  }
  function typedValue(field, input) {
    if (field.type === 'meter' || field.type === 'number') {
      const n = numeric(input, field.label || field.key, true);
      const min = numeric(field.min, '最小值', false), max = numeric(field.max, '最大值', false);
      if (min !== undefined && n < min || max !== undefined && n > max) error((field.label || field.key) + '必須在允許範圍內。');
      return n;
    }
    if (field.type === 'boolean') {
      if (![true, false, 'true', 'false'].includes(input)) error('布林初始值無效。');
      return input === true || input === 'true';
    }
    if (field.type === 'tags') return tags(input);
    const text = String(input ?? '');
    if (text.length > 800) error('初始文字最多 800 字。');
    return text;
  }
  function initialValues(data, subject) {
    validData(data);
    if (!subjects(data).includes(subject)) error('這位人物不在初始 NPC 或既有追蹤名冊中。');
    const saved = data.initial_state.character_statuses?.[subject] || {};
    if (!plain(saved)) error('人物的既有初始狀態格式不正確。');
    return Object.fromEntries(fields(data).map(f => [f.key, own(saved, f.key) ? clone(saved[f.key]) : clone(f.default ?? (f.type === 'boolean' ? false : f.type === 'tags' ? [] : (f.type === 'meter' || f.type === 'number') ? 0 : ''))]));
  }
  function setInitialValues(data, subject, draft) {
    validData(data);
    if (!subjects(data).includes(subject)) error('請先在 NPC 編輯器建立人物或指定已存在的追蹤人物。');
    if (!plain(draft)) error('初始數值設定格式不正確。');
    const definitions = fields(data);
    if (Object.keys(draft).some(key => !definitions.some(f => f.key === key))) error('欄位已變更，請重新載入初始值。');
    const previous = data.initial_state.character_statuses?.[subject] || {};
    if (!plain(previous)) error('舊人物狀態格式無效。');
    const next = { ...previous };
    for (const f of definitions) if (own(draft, f.key)) next[f.key] = typedValue(f, draft[f.key]);
    const result = clone(data);
    result.initial_state.character_statuses = { ...result.initial_state.character_statuses, [subject]: next };
    return result;
  }
  return { PRESETS, FIELD_TYPES, CONTEXT_TYPES, MAX_FIELDS, fields, define, upsertField, addPreset, removeField, subjects, initialValues, setInitialValues };
});
