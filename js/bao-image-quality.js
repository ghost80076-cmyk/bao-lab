/* Keep tiny character previews from being stretched into blurry hero artwork.
 * Upgrade automatically when a genuinely high-resolution portrait is supplied. */
(() => {
  'use strict';
  // A 430 CSS-pixel portrait needs roughly 2x source pixels on common HiDPI screens.
  const WIDTH_REQUIRED = 900;
  const HEIGHT_REQUIRED = 1200;
  const previewLabel = '人形 · 低解析預覽';

  const apply = (img, container, isHome) => {
    if (!img || !container) return;
    if (isHome && !container.querySelector('.bao-portrait-bun')) {
      const bun = document.createElement('img');
      bun.className = 'bao-portrait-bun';
      bun.src = 'assets/bao-bun.svg';
      bun.alt = '';
      bun.width = 230;
      bun.height = 222;
      bun.decoding = 'async';
      container.insertBefore(bun, img.nextSibling);
    }
    if (!container.querySelector('.bao-quality-note')) {
      const note = document.createElement('span');
      note.className = 'bao-quality-note';
      note.textContent = previewLabel;
      container.appendChild(note);
    }
    const check = () => {
      const missing = !img.naturalWidth || /(?:^|\/)bao-bun\.svg(?:[?#]|$)/.test(img.currentSrc || img.src);
      const low = missing || img.naturalWidth < WIDTH_REQUIRED || img.naturalHeight < HEIGHT_REQUIRED;
      container.classList.toggle('bao-image-lowres', low);
      container.classList.toggle('bao-image-unavailable', missing);
      const note = container.querySelector('.bao-quality-note');
      if (note) {
        note.hidden = !low;
        note.textContent = missing ? '人形原圖暫時無法顯示' : previewLabel;
      }
    };
    img.addEventListener('load', check);
    img.addEventListener('error', check);
    if (img.complete) check();
  };

  const init = () => {
    const home = document.getElementById('bao-home-portrait');
    // The current home presentation is a deliberately small companion, not a
    // hero portrait. It should never be replaced with the low-resolution fallback.
    if (home && !home.classList.contains('brand-bao-companion')) {
      apply(home.querySelector('img:not(.bao-portrait-bun)'), home, true);
    }
    const stage = document.querySelector('.bao-mascot-page .visual');
    if (stage) apply(stage.querySelector('img.human'), stage, false);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
