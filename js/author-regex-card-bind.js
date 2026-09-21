/* Carry original imported-card regex into that card's local UI settings, non-destructively. */
(() => {
  'use strict';
  const Core = window.BAOAuthorRegexCore;
  // The regex scripts can load before global-bridge.js. Classic-script lexical
  // globals are already available here even if their window aliases are not.
  const app = window.App || (typeof App !== 'undefined' ? App : null);
  const chat = window.Chat || (typeof Chat !== 'undefined' ? Chat : null);
  const state = window.GameState || (typeof GameState !== 'undefined' ? GameState : null);
  if (!Core || !app || !chat || !state) return;
  window.App = app;
  window.Chat = chat;
  window.GameState = state;
  const PREFIX = 'bao-lab:author-regex:v1:';
  function sync() {
    const character = app.activeCharacter;
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
  const renderShell = app.renderChatShell.bind(app);
  app.renderChatShell = function(...args) { sync(); return renderShell(...args); };
  window.BAOAuthorCardBind = { sync };
  sync();
  // Isolated addon: the Yume card check is inside the archive, not here.
  if (!document.querySelector('script[data-bao-yume-archive]')) {
    const addon = document.createElement('script');
    addon.src = 'js/yume-relationship-archive.js';
    addon.dataset.baoYumeArchive = '1';
    addon.onerror = () => console.warn('BAO/LAB 黑羽關係檔案載入失敗；原本故事不受影響。');
    document.head.appendChild(addon);
  }
})();