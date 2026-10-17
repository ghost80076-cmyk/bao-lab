/* YoruBay experience preferences: display-only, never story data. */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.YoruExperienceCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const THEMES = Object.freeze(['night', 'mist', 'dawn', 'dusk', 'sunset']);
  const LEVELS = Object.freeze(['easy', 'standard', 'pro']);
  const DEFAULT = Object.freeze({ theme: 'night', level: 'easy' });
  function normalize(value) {
    const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      theme: THEMES.includes(obj.theme) ? obj.theme : obj.theme === 'rose' ? 'dusk' : DEFAULT.theme,
      level: LEVELS.includes(obj.level) ? obj.level : DEFAULT.level
    };
  }
  function label(level) {
    return ({ easy: '輕鬆', standard: '標準', pro: '專業' })[normalize({level}).level];
  }
  function expandedGroups(level) {
    const normalized = normalize({level}).level;
    return normalized === 'pro' ? ['scene', 'story', 'world', 'settings'] :
      normalized === 'standard' ? ['story', 'world'] : [];
  }
  return Object.freeze({ THEMES, LEVELS, DEFAULT, normalize, label, expandedGroups });
});
