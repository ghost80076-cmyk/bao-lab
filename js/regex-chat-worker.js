/* Isolated execution for display-only regex. Never load chat state, DOM, storage or API keys. */
'use strict';
importScripts('regex-library.js', 'author-regex-core.js');
self.onmessage = event => {
  const data = event.data || {};
  const original = String(data.source ?? '');
  try {
    let value = original;
    if (Array.isArray(data.authorRules) && data.authorRules.length) {
      const rules = self.BAOAuthorRegexCore.normalize(data.authorRules)
        .filter(rule => rule.enabled && !rule.reason && !rule.rich);
      if (rules.length) {
        const result = self.BAOAuthorRegexCore.render(value, rules, false);
        if (result.matched && !result.rich) value = result.text;
      }
    }
    if (Array.isArray(data.regexRules) && data.regexRules.length) {
      value = self.BAORegex.apply(value, data.regexRules);
    }
    self.postMessage({ ok: true, text: value });
  } catch (_) {
    // A malformed rule should never corrupt story content or block subsequent messages.
    self.postMessage({ ok: false });
  }
};
