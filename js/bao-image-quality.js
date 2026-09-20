/* Keep tiny character previews from being stretched into blurry hero artwork.
 * Upgrade automatically when a genuinely high-resolution portrait is supplied. */
(() => {
  'use strict';
  const WIDTH_REQUIRED = 640;
  const HEIGHT_REQUIRED = 800;
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
      const low = img.naturalWidth < WIDTH_REQUIRED || img.naturalHeight < HEIGHT_REQUIRED;
      container.classList.toggle('bao-image-lowres', low);
      container.classList.toggle('bao-image-unavailable', !img.naturalWidth);
      const note = container.querySelector('.bao-quality-note');
      if (note) note.hidden = !low;
    };
    img.addEventListener('load', check);
    img.addEventListener('error', check);
    if (img.complete) check();
  };

  const init = () => {
    const home = document.getElementById('bao-home-portrait');
    if (home) apply(home.querySelector('img:not(.bao-portrait-bun)'), home, true);
    const stage = document.querySelector('.bao-mascot-page .visual');
    if (stage) apply(stage.querySelector('img.human'), stage, false);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();