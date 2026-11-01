/* BAO/LAB Gameplay UI preview isolation. Loaded BEFORE gameplay-ui.js inside gameplay-ui-preview.html.
 *
 * The production Gameplay UI renderer is written against the global App / GameState
 * objects of the full game. Inside the preview iframe those names are replaced by the
 * minimal stand-ins below, so the real renderer runs without the game: nothing here reads
 * or writes stories, localStorage, IndexedDB, cookies, API keys or the network. Every call
 * the renderer makes toward "the real app" is only counted in BAOPreviewIsolation.calls.
 */
(() => {
  'use strict';
  const Protocol = window.BAOGameplayUIPreviewProtocol;
  if (!Protocol) throw new Error('gameplay-ui-preview-protocol-core.js must load first');

  const calls = Object.create(null);
  const count = name => () => { calls[name] = (calls[name] || 0) + 1; };

  const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => escapeMap[ch]);

  const post = (type, payload) => {
    if (window.parent === window) return;
    window.parent.postMessage(Protocol.makeMessage(type, payload), location.origin);
  };

  window.App = {
    activeCharacter: null,
    config: { displayMode: 'ui' },
    escapeHTML,
    escapeAttr: escapeHTML,
    renderUIPanel: panelId => window.BAOGameplayUI && window.BAOGameplayUI.renderPanel(String(panelId || '')),
    saveStory: count('saveStory'),
    startStory: count('startStory'),
    openBuilder: count('openBuilder'),
    renderChatShell: count('renderChatShell'),
    collectConfig: () => { count('collectConfig')(); return {}; }
  };

  window.GameState = {
    current: null,
    create: count('create'),
    applyUpdate: count('applyUpdate'),
    addEvent(text) {
      if (!this.current || !text) return;
      const events = Array.isArray(this.current.events) ? this.current.events : [];
      this.current.events = [String(text), ...events].slice(0, 20);
    }
  };

  // The renderer reports action results through BAOFeedback; the preview forwards them to the parent.
  window.BAOFeedback = { notify: message => post('notice', { message: String(message ?? '').slice(0, 200) }) };

  window.BAOPreviewIsolation = Object.freeze({ calls, post });
})();
