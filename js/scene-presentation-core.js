/* BAO/LAB scene presentation core: presentation only; never changes world state or calls an API. */
(() => {
  'use strict';
  const themes = Object.freeze({
    general: ['通用', '#232532', '#e6e8f7', '#777e9d'],
    romance: ['甜蜜戀愛', '#30232e', '#ffe5f0', '#b97b9a'],
    intimacy: ['成人親密', '#271e2b', '#f3dce9', '#8c718a'],
    danger: ['危險／對峙', '#30211f', '#ffe0c5', '#d08a60'],
    mystery: ['詭異／解謎', '#1d292a', '#d3efdf', '#689a8c']
  });
  const valid = value => Object.prototype.hasOwnProperty.call(themes, value) ? value : 'general';
  const select = (requested, state) => {
    if (requested && requested !== 'auto') return valid(requested);
    // Only use an explicit presentation hint; never infer consent, secrets, danger or relationships.
    return valid(state?.scenePresentation || state?.sceneType || 'general');
  };
  const render = (target, narration, options = {}) => {
    if (!(target instanceof Element)) throw new TypeError('Scene target must be an Element');
    const mode = options.mode === 'plain' ? 'plain' : 'scene';
    const type = select(options.type || 'auto', options.state);
    const [label, background, foreground, edge] = themes[type];
    const body = document.createElement('div');
    body.className = 'bao-scene-body';
    body.style.whiteSpace = 'pre-wrap';
    body.textContent = String(narration ?? ''); // Never interpret model/player text as HTML.
    target.replaceChildren(body);
    target.dataset.sceneType = type;
    target.classList.toggle('bao-scene-plain', mode === 'plain');
    target.style.cssText = mode === 'plain' ? 'white-space:normal;overflow-wrap:anywhere' :
      `background:${background};color:${foreground};border:1px solid ${edge};border-radius:14px;padding:18px;line-height:1.85;overflow-wrap:anywhere`;
    if (mode !== 'plain') {
      const heading = document.createElement('div');
      heading.className = 'bao-scene-heading';
      heading.textContent = label;
      heading.style.cssText = `font-size:.8rem;border-bottom:1px solid ${edge};padding-bottom:7px;margin-bottom:10px`;
      target.prepend(heading);
    }
    return { type, mode };
  };
  window.BAOScenePresentation = Object.freeze({ themes, select, render });
})();