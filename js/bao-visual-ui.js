/* BAO mascot presentation: runs after brand-ui and the browser-only helper. */
(() => {
  'use strict';
  const KEY = 'bao-lab:mascot:v1';
  const enhance = () => {
    const homeCard = document.querySelector('#home-view .brand-identity-card');
    if (homeCard && !document.getElementById('bao-home-portrait')) {
      const link = document.createElement('a');
      link.id = 'bao-home-portrait';
      link.className = 'bao-home-portrait';
      link.href = 'bao-mascot.html';
      link.setAttribute('aria-label', '認識 BAO/LAB 官方吉祥物包包');
      link.innerHTML = '<img src="assets/bao-human.webp" alt="包包：奶白色短髮、粉紫眼睛的 BAO/LAB 官方吉祥物" width="320" height="426" loading="eager"><span><b>BAO · 包包</b><small>肉包 ⇄ 人形 · 認識她 →</small></span>';
      const oldArt = homeCard.querySelector('.brand-world-art');
      if (oldArt) oldArt.replaceWith(link);
      else homeCard.prepend(link);
    }

    const about = document.querySelector('#about-view .creator-page');
    if (about && !document.getElementById('bao-about-intro')) {
      const section = document.createElement('section');
      section.id = 'bao-about-intro';
      section.className = 'bao-about-intro';
      section.innerHTML = '<img src="assets/bao-bun.svg" width="62" height="62" alt=""><div><h3>認識包包 · BAO</h3><p>BAO/LAB 的官方吉祥物，平常是肉包精靈，也會變成人形。她的網站小助手只使用固定台詞，不讀取故事或連線金鑰。</p><a href="bao-mascot.html">查看角色介紹 →</a> <button type="button" id="bao-mascot-enable" hidden>重新顯示包包助手</button></div>';
      (about.querySelector('.creator-card') || about.lastElementChild)?.after(section);
      const enable = section.querySelector('#bao-mascot-enable');
      try {
        enable.hidden = !JSON.parse(localStorage.getItem(KEY) || '{}').disabled;
      } catch { enable.hidden = true; }
      enable.addEventListener('click', () => {
        try {
          const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
          localStorage.setItem(KEY, JSON.stringify({ ...saved, disabled: false }));
        } catch { /* storage may be unavailable; reload still permits temporary display */ }
        window.location.reload();
      });
    }
  };
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'css/bao-visual-ui.css';
  document.head.appendChild(link);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();