/* The home hero and top navigation call the same restore function. Show one entry per view. */
(() => {
  'use strict';
  if (window.BAOStoryEntryVisibility) return;
  const home = document.getElementById('home-view');
  const nav = document.getElementById('continue-story');
  const hero = document.getElementById('home-continue');
  if (!home || !nav || !hero) return;
  const sync = () => {
    const onHome = home.classList.contains('active');
    // Keep the existing .hidden save-availability checks and click handlers unchanged.
    // Do not hide the hero: it remains the sole Continue action on the home screen.
    nav.style.display = onHome ? 'none' : '';
    if (onHome) nav.setAttribute('aria-hidden', 'true');
    else nav.removeAttribute('aria-hidden');
    nav.title = '讀取上次故事（與首頁繼續故事相同）';
    hero.title = '讀取上次故事；若連線金鑰已失效，可在故事內重新設定';
  };
  new MutationObserver(sync).observe(home, { attributes: true, attributeFilter: ['class'] });
  window.BAOStoryEntryVisibility = Object.freeze({ sync });
  sync();
})();
