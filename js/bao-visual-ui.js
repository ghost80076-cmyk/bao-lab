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
    if (!document.querySelector('script[data-bao-gallery-focus]')) {
      const gallery = document.createElement('script');
      gallery.dataset.baoGalleryFocus = '1';
      gallery.src = 'js/bao-gallery-focus.js';
      document.head.appendChild(gallery);
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


/* BAO story surface: Play is the default reader; Studio reveals advanced controls. */
(() => {
  'use strict';
  if (window.BAOStorySurface || !window.App) return;
  const root = document.getElementById('chat-view');
  const main = root?.querySelector('.chat-main');
  const layout = root?.querySelector('.chat-layout');
  if (!root || !main || !layout) return;

  const KEY = 'bao-lab:story-surface-v1';
  const desktop = window.matchMedia('(min-width:1081px)');
  let mode = 'play';
  let statusOpen = false;
  try { mode = localStorage.getItem(KEY) === 'studio' ? 'studio' : 'play'; } catch {}

  const save = () => { try { localStorage.setItem(KEY, mode); } catch {} };
  const currentPanel = () => root.querySelector('.ui-tab.active')?.dataset.panel || 'npc';

  const sceneValue = value => {
    const text = String(value ?? '').trim();
    return text && !/^(?:未知|未設定|未確認|—|-)$/.test(text) ? text : '';
  };

  const syncMeta = () => {
    const meta = document.getElementById('bao-scene-meta');
    if (!meta) return;
    const state = window.GameState?.current || {};
    const time = sceneValue(state.time);
    const location = sceneValue(state.location);
    const values = [time, location].filter(Boolean);
    meta.replaceChildren();
    values.forEach((value, index) => {
      if (index) {
        const dot = document.createElement('span');
        dot.className = 'bao-scene-meta-dot';
        dot.textContent = '·';
        meta.append(dot);
      }
      const item = document.createElement('span');
      item.textContent = value;
      meta.append(item);
    });
    meta.hidden = values.length === 0;
  };

  const closeStatus = () => {
    statusOpen = false;
    root.classList.remove('bao-play-status-open');
    const button = document.getElementById('bao-play-status-toggle');
    button?.setAttribute('aria-expanded', 'false');
  };

  const ensureStatusClose = () => {
    const panel = document.getElementById('game-ui');
    if (!panel) return null;
    let close = document.getElementById('bao-play-status-close');
    if (!close) {
      close = document.createElement('button');
      close.type = 'button';
      close.id = 'bao-play-status-close';
      close.textContent = '關閉 ×';
      close.setAttribute('aria-label', '關閉人物與故事狀態');
      close.addEventListener('click', closeStatus);
      panel.prepend(close);
    }
    return close;
  };

  const openStatus = () => {
    statusOpen = true;
    root.classList.add('bao-play-status-open');
    const button = document.getElementById('bao-play-status-toggle');
    button?.setAttribute('aria-expanded', 'true');
    ensureStatusClose();
    if (App.config?.displayMode === 'ui') App.renderUIPanel?.(currentPanel());
  };

  const setMode = (next, persist = true) => {
    mode = next === 'studio' ? 'studio' : 'play';
    root.dataset.baoSurface = mode;
    const button = document.getElementById('bao-surface-mode-toggle');
    if (button) {
      const mobile = !desktop.matches;
      button.textContent = mode === 'studio' ? '返回故事' : (mobile ? '工具' : '工作室');
      button.setAttribute('aria-pressed', String(mode === 'studio'));
      button.setAttribute('aria-label', mode === 'studio' ? '返回玩家閱讀模式' : '開啟工作室模式');
    }
    if (mode === 'studio') {
      closeStatus();
      if (!desktop.matches) setTimeout(() => window.BAOMobileReadingLayout?.openTools?.(), 0);
    } else {
      window.BAOChatToolNavigation?.closeDrawer?.();
      window.BAOChatExperience?.closeStatus?.();
      main.classList.remove('bao-mobile-panel-open');
    }
    if (persist) save();
  };

  const ensure = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    const copy = header.querySelector('.chat-title-copy');
    if (copy && !document.getElementById('bao-scene-meta')) {
      const meta = document.createElement('div');
      meta.id = 'bao-scene-meta';
      meta.className = 'bao-scene-meta';
      meta.hidden = true;
      meta.setAttribute('aria-label', '目前故事場景');
      copy.append(meta);
    }
    let controls = document.getElementById('bao-surface-controls');
    if (!controls) {
      controls = document.createElement('div');
      controls.id = 'bao-surface-controls';
      controls.className = 'bao-surface-controls';

      const status = document.createElement('button');
      status.type = 'button';
      status.id = 'bao-play-status-toggle';
      status.textContent = '狀態';
      status.setAttribute('aria-controls', 'game-ui');
      status.setAttribute('aria-expanded', 'false');
      status.addEventListener('click', () => statusOpen ? closeStatus() : openStatus());

      const surface = document.createElement('button');
      surface.type = 'button';
      surface.id = 'bao-surface-mode-toggle';
      surface.addEventListener('click', () => setMode(mode === 'play' ? 'studio' : 'play'));

      controls.append(status, surface);
      header.append(controls);
    }
    syncMeta();
    setMode(mode, false);
  };

  const sync = () => { ensure(); syncMeta(); };

  const priorShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = priorShell(...args);
    requestAnimationFrame(sync);
    return result;
  };

  const priorView = App.showView.bind(App);
  App.showView = function(name, ...args) {
    const result = priorView(name, ...args);
    if (name === 'chat') requestAnimationFrame(sync);
    return result;
  };

  if (window.GameState && !window.GameState.__baoSurfaceWrapped) {
    ['create','applyUpdate','upsertNPC'].forEach(method => {
      if (typeof GameState[method] !== 'function') return;
      const original = GameState[method];
      GameState[method] = function(...args) {
        const result = original.apply(this, args);
        queueMicrotask(syncMeta);
        return result;
      };
    });
    window.GameState.__baoSurfaceWrapped = true;
  }

  new MutationObserver(mutations => {
    if (mutations.some(record => [...record.addedNodes].some(node =>
      node.nodeType === 1 && (node.classList?.contains('chat-topline') || node.querySelector?.('.chat-topline'))))) {
      requestAnimationFrame(sync);
    }
  }).observe(main, { childList:true, subtree:true });

  desktop.addEventListener?.('change', () => setMode(mode, false));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && statusOpen) closeStatus();
  });

  window.BAOStorySurface = Object.freeze({
    get mode() { return mode; },
    setMode,
    openStatus,
    closeStatus,
    sync
  });
  sync();
})();
