/* Carry original imported-card regex into that card's local UI settings, non-destructively. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  if (!Core || !window.App) return;
  const PREFIX = 'bao-lab:author-regex:v1:';
  function sync() {
    const character = App.activeCharacter;
    const id = String(character?.id || '').slice(0, 80);
    const raw = character?.import_metadata?.preserved_source;
    if (!id || !raw) return false;
    const key = PREFIX + encodeURIComponent(id);
    // A saved choice (including the player's deliberate decision to disable) always wins.
    try {
      if (localStorage.getItem(key) !== null) return false;
      const rules = Core.normalize(raw);
      if (!rules.length) return false;
      localStorage.setItem(key, JSON.stringify({ enabled: false, allowScripts: false, rules }));
      console.info('BAO/LAB: original author regex linked to this card, disabled until player opts in.');
      return true;
    } catch (error) {
      console.warn('BAO/LAB: unable to link this card\'s original regex; no story data changed.', error?.message);
      return false;
    }
  }
  const renderShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) { sync(); return renderShell(...args); };
  window.BAOAuthorCardBind = { sync };
  sync();
})();
