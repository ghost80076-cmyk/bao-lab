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
  const setVisible = (node, visible) => {
    if (!node) return;
    const desired = visible ? '' : 'none';
    if (node.style.display !== desired) node.style.display = desired;
    if (visible) node.removeAttribute('aria-hidden');
    else node.setAttribute('aria-hidden', 'true');
  };
  const sync = () => {
    const onHome = home.classList.contains('active');
    const onChat = Boolean(chat?.classList.contains('active'));
    setVisible(nav, !onHome);
    if (nav.textContent !== '繼續上次故事') nav.textContent = '繼續上次故事';
    nav.title = '從上次自動存檔繼續；不會新增故事';
    if (hero.textContent !== '繼續上次故事') hero.textContent = '繼續上次故事';
    hero.title = '從上次自動存檔繼續；不會新增故事';
    const library = topbar?.querySelector('[data-open-story-library]');
    // Story Management already links to Story Library. Keep the top entry until it loads.
    const inChatLibrary = Boolean(document.querySelector('#chat-view [data-bao-open="story-tools"]'));
    setVisible(library, !(onChat && inChatLibrary));
    if (library) library.title = '管理這台裝置上的故事與章節';
  };
  new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ['class'] });
  if (chat) new MutationObserver(sync).observe(chat, { attributes: true, attributeFilter: ['class'] });
  if (topbar) new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
      (node.matches?.('[data-open-story-library]') || node.querySelector?.('[data-open-story-library]'))))) sync();
  }).observe(topbar, { childList: true });
  const sidebar = document.querySelector('#chat-view .chat-layout > aside');
  if (sidebar) new MutationObserver(records => {
    if (records.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
      (node.matches?.('[data-bao-open="story-tools"]') || node.querySelector?.('[data-bao-open="story-tools"]'))))) sync();
  }).observe(sidebar, { childList: true, subtree: true });
  window.BAOStoryEntryVisibility = Object.freeze({ sync });
  sync();
})();
