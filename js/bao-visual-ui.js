/* BAO mascot presentation: runs after brand UI and the browser-only helper. */
(() => {
  'use strict';
  const KEY = 'bao-lab:mascot:v1';
  const PORTRAIT = 'assets/bao-human-v2.webp';
  const enhance = () => {
    const homeCard = document.querySelector('#home-view .brand-identity-card');
    if (homeCard && !document.getElementById('bao-home-portrait')) {
      const link = document.createElement('a');
      link.id = 'bao-home-portrait';
      link.className = 'bao-home-portrait';
      link.href = 'bao-mascot.html';
      link.setAttribute('aria-label', '認識 BAO/LAB 官方吉祥物包包');
      link.innerHTML = `<img src="${PORTRAIT}" alt="包包：奶白色短髮、粉紫眼睛的 BAO/LAB 官方吉祥物" width="320" height="426" loading="eager"><span><b>BAO · 包包</b><small>肉包 ⇄ 人形 · 認識她 →</small></span>`;
      const oldArt = homeCard.querySelector('.brand-world-art');
      if (oldArt) oldArt.replaceWith(link);
      else homeCard.prepend(link);
      const image = link.querySelector('img');
      image.onerror = () => { image.onerror = null; image.src = 'assets/bao-bun.svg'; };
    }
    const helperPortrait = document.querySelector('#bao-mascot-root .bao-mascot-human');
    if (helperPortrait) {
      helperPortrait.src = PORTRAIT;
      helperPortrait.onerror = () => { helperPortrait.onerror = null; helperPortrait.src = 'assets/bao-bun.svg'; };
    }
    const about = document.querySelector('#about-view .creator-page');
    if (about && !document.getElementById('bao-about-intro')) {
      const section = document.createElement('section');
      section.id = 'bao-about-intro';
      section.className = 'bao-about-intro';
      section.innerHTML = '<img src="assets/bao-bun.svg" width="62" height="62" alt=""><div><h3>認識包包 · BAO</h3><p>BAO/LAB 的官方吉祥物，平常是肉包精靈，也會變成人形。她的網站小助手只使用固定台詞，不讀取故事或連線金鑰。</p><a href="bao-mascot.html">查看角色介紹 →</a> <button type="button" id="bao-mascot-enable" hidden>重新顯示包包助手</button></div>';
      (about.querySelector('.creator-card') || about.lastElementChild)?.after(section);
      const enable = section.querySelector('#bao-mascot-enable');
      try { enable.hidden = !JSON.parse(localStorage.getItem(KEY) || '{}').disabled; }
      catch { enable.hidden = true; }
      enable.addEventListener('click', () => {
        try { const saved = JSON.parse(localStorage.getItem(KEY) || '{}'); localStorage.setItem(KEY, JSON.stringify({ ...saved, disabled: false })); }
        catch { /* private mode */ }
        window.location.reload();
      });
    }
  };
  const addStylesheet = href => {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  };
  // Replace each original stylesheet URL instead of stacking another conflicting override.
  const refreshStylesheet = (path, version) => {
    const existing = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .find(link => link.getAttribute('href')?.split('?')[0] === path);
    if (existing && existing.getAttribute('href') !== `${path}?v=${version}`) {
      existing.href = `${path}?v=${version}`;
    }
  };
  const enhanceAndGuard = () => {
    enhance();
    if (!document.querySelector('script[data-bao-quality]')) {
      const script = document.createElement('script');
      script.dataset.baoQuality = '1';
      script.src = 'js/bao-image-quality.js?v=1';
      document.head.appendChild(script);
    }
    if (!document.querySelector('script[data-bao-immersive]')) {
      const reader = document.createElement('script');
      reader.dataset.baoImmersive = '1';
      reader.src = 'js/immersive-reader.js';
      document.head.appendChild(reader);
    }
    if (!document.querySelector('script[data-bao-bookshelf]')) {
      const bookshelf = document.createElement('script');
      bookshelf.dataset.baoBookshelf = '1';
      bookshelf.src = 'js/bookshelf-enhance.js';
      document.head.appendChild(bookshelf);
    }
    if (!document.querySelector('script[data-bao-scene-image]')) {
      const scenes = document.createElement('script');
      scenes.dataset.baoSceneImage = '1';
      scenes.src = 'js/story-image-moments.js';
      document.head.appendChild(scenes);
    }
  };
  refreshStylesheet('css/explore-zones.css', 'original-violet-mint-1');
  refreshStylesheet('css/bao-mascot.css', 'original-violet-mint-1');
  addStylesheet('css/bao-visual-ui.css');
  addStylesheet('css/bao-brand-v2.css?v=original-violet-mint-1');
  // Brand tokens first, editorial layout second; story-specific authored HTML is never restyled.
  addStylesheet('css/bao-editorial.css?v=1');
  addStylesheet('css/bao-image-quality.css?v=1');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhanceAndGuard, { once: true });
  else enhanceAndGuard();
})();
