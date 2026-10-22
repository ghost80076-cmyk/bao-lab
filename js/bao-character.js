/* Shared BAO sprite presentation. No chat, credentials or model requests. */
(() => {
  'use strict';
  if (window.BAOCharacter) return;
  const base = new URL('../', document.currentScript.src);
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = new URL('css/bao-character.css?v=1', base).href;
  css.dataset.baoCharacter = '1';
  if (!document.querySelector('link[data-bao-character]')) document.head.append(css);
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let motionOff = false;
  let blink = false;
  let talking = false;
  const markup = (form = 'bun', extra = '') => `<i class="bao-character ${extra}" data-bao-form="${form === 'human' ? 'human' : 'bun'}" data-bao-mood="0" aria-hidden="true"><i class="bao-character-frame"></i></i>`;
  const paint = el => {
    const mood = Number(el.dataset.baoMood || 0);
    const still = motionOff || media.matches;
    const frame = mood === 0 && blink && !still ? 5 : mood === 4 && talking && !still ? 0 : mood;
    el.style.setProperty('--bao-frame-col', frame % 3);
    el.style.setProperty('--bao-frame-row', Math.floor(frame / 3));
    el.style.setProperty('--bao-frame-x', `${frame % 3 * 50}%`);
    el.style.setProperty('--bao-frame-y', `${Math.floor(frame / 3) * 100}%`);
    el.classList.toggle('bao-character-still', still || mood === 3);
  };
  const refresh = () => document.querySelectorAll('.bao-character').forEach(paint);
  const set = (scope, form, mood = 0) => {
    const sprites = scope.matches?.('.bao-character') ? [scope] : scope.querySelectorAll('.bao-character');
    sprites.forEach(el => {
      el.dataset.baoForm = form === 'human' ? 'human' : 'bun';
      el.dataset.baoMood = String([0, 1, 2, 3, 4].includes(mood) ? mood : 0);
      paint(el);
    });
  };
  const motion = off => { motionOff = Boolean(off); refresh(); };
  window.BAOCharacter = { markup, set, motion, refresh };
  window.addEventListener('bao:appearance', event => {
    document.querySelectorAll('.bao-character-follow').forEach(el => set(el, event.detail.form));
  });
  media.addEventListener('change', refresh);
  // One timer drives every surface; hidden pages do no animation work.
  let ticks = 0;
  setInterval(() => {
    if (document.hidden || motionOff || media.matches) return;
    ticks++;
    blink = ticks % 18 === 0;
    talking = !talking;
    document.querySelectorAll('.bao-character').forEach(el => {
      if (el.getClientRects().length) paint(el);
    });
  }, 240);
})();
