/* Keep existing click handlers and save workflows; remove only redundant navigation entries. */
(() => {
  'use strict';
  if (window.BAOStoryEntryVisibility) return;
  const home = document.getElementById('home-view');
  const chat = document.getElementById('chat-view');
  const nav = document.getElementById('continue-story');
  const hero = document.getElementById('home-continue');
  const topbar = document.querySelector('.topbar nav');
  if (!home || !nav || !hero) return;
  let syncing = false;
  const setVisible = (node, visible) => {
    if (!node) return;
    const desired = visible ? '' : 'none';
    if (node.style.display !== desired) node.style.display = desired;
    if (visible) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', 'true');
  };
  const sync = () => {
    if (syncing) return;
    syncing = true;
    try {
      const onHome = home.classList.contains('active');
      const onChat = Boolean(chat?.classList.contains('active'));
      setVisible(nav, !onHome);
      nav.textContent = '繼續上次故事';
      nav.title = '從上次自動存檔繼續；不會新增故事';
      hero.textContent = '繼續上次故事';
      hero.title = '從上次自動存檔繼續；不會新增故事';
      const library = topbar?.querySelector('[data-open-story-library]');
      // In chat the existing Story Management button already opens Story Library.
      // Keep top-nav Library if that in-chat entry has not loaded yet.
      const inChatLibrary = Boolean(document.querySelector('#chat-view [data-bao-open="story-tools"]'));
      setVisible(library, !(onChat && inChatLibrary));
      if (library) library.title = '管理這台裝置上的故事與章節';
    } finally { syncing = false; }
  };
  new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ['class'] });
  if (chat) new MutationObserver(sync).observe(chat, { attributes: true, attributeFilter: ['class'] });
  if (topbar) new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.matches?.('[data-open-story-library]') || node.querySelector?.('[data-open-story-library]'))))) sync();
  }).observe(topbar, { childList: true });
  window.BAOStoryEntryVisibility = Object.freeze({ sync });
  sync();
})();
