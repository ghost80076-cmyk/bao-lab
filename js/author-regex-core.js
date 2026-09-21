/* Author regex parsing and rendering. Pure: no DOM, storage, API calls or eval. */
(function(root, factory) {
  const core = factory();
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.BAOAuthorRegexCore = core;
})(typeof self !== 'undefined' ? self : null, function() {
  'use strict';
  const LIMIT = 60, MAX_SOURCE = 20000, MAX_HTML = 350000;
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const isObject = v => v && typeof v === 'object' && !Array.isArray(v);
  function list(source) {
    if (Array.isArray(source)) return source;
    if (!isObject(source)) throw new Error('請使用正則 JSON 陣列或含 regex_scripts 的檔案。');
    const data = source.data || source;
    const candidates = [source.rules, source.regex_scripts, source.extensions?.regex_scripts,
      source.extensions?.regex, data.regex_scripts, data.extensions?.regex_scripts, data.extensions?.regex];
    const found = candidates.find(Array.isArray);
    if (!found) throw new Error('找不到 regex_scripts 或 rules；角色卡來源可能沒有附上正則。');
    return found;
  }
  function normalize(source) {
    const items = list(source);
    if (items.length > LIMIT) throw new Error(`一次最多 ${LIMIT} 條規則；原檔不會被修改。`);
    return items.map((item, index) => {
      const raw = isObject(item) ? item : {};
      let pattern = String(raw.pattern ?? raw.findRegex ?? '');
      let flags = String(raw.flags || 'g');
      if (!raw.flags && pattern.startsWith('/')) {
        const end = pattern.lastIndexOf('/');
        if (end > 0 && /^[gimsu]*$/.test(pattern.slice(end + 1))) {
          flags = pattern.slice(end + 1) || 'g'; pattern = pattern.slice(1, end);
        }
      }
      const replacement = String(raw.replacement ?? raw.replaceString ?? '');
      const script = /<\s*script\b|\bon[a-z]+\s*=|javascript\s*:/i.test(replacement);
      const rich = script || /<\s*\/?\s*[a-z][^>]*>/i.test(replacement);
      let reason = '';
      if (!pattern || pattern.length > 3000) reason = '比對式需為 1～3000 字元';
      else if (replacement.length > 200000) reason = '單條替換內容超過 200,000 字元';
      else if (!/^[gimsu]*$/.test(flags) || new Set(flags).size !== flags.length) reason = '不支援的正則旗標';
      else { try { new RegExp(pattern, flags); } catch (_) { reason = '正則語法無效'; } }
      return { name: String(raw.name || raw.scriptName || `規則 ${index + 1}`).slice(0, 80),
        pattern, flags, replacement, enabled: raw.enabled !== false && raw.disabled !== true && raw.disable !== true,
        rich, script, reason };
    });
  }
  // Capture values originate in model output. Escape them before inserting into authored HTML.
  function expand(template, match, source) {
    return template.replace(/\$\$|\$&|\$`|\$'|\$<([^>]+)>|\$(\d{1,2})/g, token => {
      if (token === '$$') return '$';
      if (token === '$&') return escapeHTML(match[0]);
      if (token === '$`') return escapeHTML(source.slice(0, match.index));
      if (token === "$'") return escapeHTML(source.slice(match.index + match[0].length));
      if (token.startsWith('$<')) return escapeHTML(match.groups?.[token.slice(2, -1)] ?? '');
      const number = Number(token.slice(1));
      return number > 0 && number < match.length ? escapeHTML(match[number] ?? '') : token;
    });
  }
  function richReplace(source, re, replacement) {
    let html = '', cursor = 0, count = 0, match;
    re.lastIndex = 0;
    while ((match = re.exec(source))) {
      if (++count > 100) throw new Error('單輪最多替換 100 個片段');
      html += escapeHTML(source.slice(cursor, match.index)) + expand(replacement, match, source);
      cursor = match.index + match[0].length;
      if (html.length > MAX_HTML) throw new Error('渲染內容超過上限');
      if (!re.global) break;
      if (match[0] === '') re.lastIndex = Math.min(source.length + 1, re.lastIndex + 1);
      if (re.lastIndex > source.length) break;
    }
    return html + escapeHTML(source.slice(cursor));
  }
  function render(raw, rules, allowScripts) {
    let source = String(raw ?? '');
    if (source.length > MAX_SOURCE) throw new Error('本輪文字超過 20,000 字元，保留原文以避免卡頓');
    let plainChanged = false, blocked = 0;
    for (const rule of (Array.isArray(rules) ? rules : []).slice(0, LIMIT)) {
      if (!rule || !rule.enabled || rule.reason) continue;
      if (String(rule.pattern).length > 3000 || String(rule.replacement).length > 200000) continue;
      let re;
      try { re = new RegExp(rule.pattern, rule.flags || 'g'); } catch (_) { continue; }
      if (!re.test(source)) continue;
      re.lastIndex = 0;
      if (rule.rich) {
        if (rule.script && !allowScripts) { blocked++; continue; }
        const html = richReplace(source, re, rule.replacement);
        if (html.length > MAX_HTML) throw new Error('渲染內容超過上限');
        return { matched: true, rich: true, script: Boolean(rule.script), html, name: rule.name, blocked };
      }
      source = source.replace(re, rule.replacement);
      plainChanged = true;
      if (source.length > MAX_SOURCE * 2) throw new Error('文字替換內容超過上限');
    }
    return { matched: plainChanged, rich: false, script: false,
      html: escapeHTML(source).replace(/\r?\n/g, '<br>'), blocked };
  }
  return { LIMIT, normalize, list, render, escapeHTML };
});