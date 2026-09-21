/* BAO/LAB browser-only, display-only regular expression library. Never eval imported code. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BAORegex = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const KEY = 'bao-lab-display-regex-v1';
  const MAX_RULES = 40;
  const MAX_TEXT = 12000;
  const MAX_PATTERN = 200;
  const MAX_REPLACEMENT = 2000;
  const forbiddenMarkup = /<\s*\/?\s*[a-z][^>]*>/i;
  const dangerousCode = /(?:javascript\s*:|\bon\w+\s*=|\b(?:eval|Function|document|window|globalThis|localStorage|sessionStorage|fetch)\s*\()/i;
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  const text = v => typeof v === 'string' ? v : '';
  const cleanName = (v, i) => (text(v).trim() || `規則 ${i + 1}`).slice(0, 80);

  function validate(input, i = 0) {
    const raw = isObject(input) ? input : {};
    const name = cleanName(raw.name || raw.scriptName || raw.comment, i);
    const pattern = text(raw.pattern ?? raw.findRegex);
    const replacement = text(raw.replacement ?? raw.replaceString);
    const flags = text(raw.flags || 'g');
    const requested = raw.enabled !== false && raw.disabled !== true && raw.disable !== true;
    let reason = '';
    if (!pattern || pattern.length > MAX_PATTERN) reason = `比對式需為 1～${MAX_PATTERN} 字元`;
    else if (replacement.length > MAX_REPLACEMENT) reason = `替換文字不可超過 ${MAX_REPLACEMENT} 字元`;
    else if (forbiddenMarkup.test(replacement) || dangerousCode.test(replacement)) reason = '包含 HTML／CSS／JavaScript，文字正則不會執行這些內容';
    else if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length) reason = '僅支援 g、i、m、s、u 旗標，不可重複';
    else if (/\\[1-9]/.test(pattern) || /\(\?/.test(pattern) || /\)[+*?{]/.test(pattern) || (pattern.match(/(?<!\\)[+*{]/g) || []).length > 4) reason = '比對式包含可能造成卡頓的複雜結構，請改用較簡單的正則';
    else {
      try { new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'); }
      catch { reason = '正則語法錯誤'; }
    }
    return { name, pattern: pattern.slice(0, MAX_PATTERN), replacement: reason ? '' : replacement, flags,
      enabled: requested && !reason, reason: reason || (requested ? '' : text(raw.reason) || '原規則已停用') };
  }
  function listFrom(source) {
    if (Array.isArray(source)) return source;
    if (!isObject(source)) throw new Error('請匯入正則規則陣列或包含 regex_scripts 的 JSON。');
    const data = source.data || source;
    const candidates = [source.rules, source.regex_scripts, data.regex_scripts, data.extensions?.regex_scripts,
      data.extensions?.regex, source.extensions?.regex_scripts];
    const list = candidates.find(Array.isArray);
    if (!list) throw new Error('找不到 rules 或 regex_scripts；這份檔案不是可辨識的正則資料庫。');
    return list;
  }
  function importRules(source) {
    const list = listFrom(source);
    if (list.length > MAX_RULES) throw new Error(`最多一次匯入 ${MAX_RULES} 條規則，請先精簡資料庫。`);
    return list.map(validate);
  }
  function load(storage) {
    try {
      const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      const state = JSON.parse(store?.getItem(KEY) || 'null');
      if (!isObject(state)) return { active: false, rules: [] };
      return { active: state.active === true, rules: (Array.isArray(state.rules) ? state.rules : []).slice(0, MAX_RULES).map(validate) };
    } catch { return { active: false, rules: [] }; }
  }
  function save(state, storage) {
    const next = { active: state?.active === true, rules: (state?.rules || []).slice(0, MAX_RULES).map(validate) };
    const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!store) throw new Error('瀏覽器未提供本機儲存空間。');
    store.setItem(KEY, JSON.stringify(next));
    return next;
  }
  function apply(input, rules) {
    let result = String(input ?? '');
    if (result.length > MAX_TEXT) return result; // Preserve long replies instead of freezing the UI.
    for (const item of (rules || []).slice(0, MAX_RULES)) {
      const rule = validate(item);
      if (!rule.enabled) continue;
      result = result.replace(new RegExp(rule.pattern, rule.flags.includes('g') ? rule.flags : rule.flags + 'g'), rule.replacement);
      if (result.length > MAX_TEXT * 2) return String(input ?? '');
    }
    return result;
  }
  return { KEY, MAX_RULES, MAX_TEXT, validate, importRules, load, save, apply };
});