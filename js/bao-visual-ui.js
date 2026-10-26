/* BAO mascot presentation: runs after brand UI and the browser-only helper. */
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
      link.setAttribute('aria-label', '認識夜灣官方吉祥物包包');
      link.innerHTML = window.BAOCharacter.markup('bun', 'bao-character-follow') + '<span><b>BAO · 包包</b><small>肉包 ⇄ 人形 · 認識她 →</small></span>';
      const oldArt = homeCard.querySelector('.brand-world-art');
      if (oldArt) oldArt.replaceWith(link);
      else homeCard.prepend(link);
    }
    const about = document.querySelector('#about-view .creator-page');
    if (about && !document.getElementById('bao-about-intro')) {
      const section = document.createElement('section');
      section.id = 'bao-about-intro';
      section.className = 'bao-about-intro';
      section.innerHTML = '' + window.BAOCharacter.markup('bun', 'bao-character-follow') + '<div><h3>認識包包 · BAO</h3><p>夜灣的官方吉祥物，平常是肉包精靈，也會變成人形。她的網站小助手只使用固定台詞，不讀取故事或連線金鑰。</p><a href="bao-mascot.html">查看角色介紹 →</a> <button type="button" id="bao-mascot-enable" hidden>重新顯示包包助手</button></div>';
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
    // The page owns the version and cascade position of preloaded styles.
    // Cache-busting queries/fragments do not identify a different stylesheet.
    const path = href.split(/[?#]/)[0];
    if ([...document.querySelectorAll('link[rel="stylesheet"]')]
      .some(link => link.getAttribute('href')?.split(/[?#]/)[0] === path)) return;
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
      script.src = 'js/bao-image-quality.js?v=2';
      document.head.appendChild(script);
    }
    if (!document.querySelector('script[data-bao-bookshelf]')) {
      const bookshelf = document.createElement('script');
      bookshelf.dataset.baoBookshelf = '1';
      bookshelf.src = 'js/bookshelf-enhance.js?v=2';
      document.head.appendChild(bookshelf);
    }
    if (!document.querySelector('script[data-bao-scene-image]')) {
      const scenes = document.createElement('script');
      scenes.dataset.baoSceneImage = '1';
      scenes.src = 'js/story-image-prompts.js?v=2';
      document.head.appendChild(scenes);
    }
    if (!document.querySelector('script[data-bao-gallery-focus]')) {
      const gallery = document.createElement('script');
      gallery.dataset.baoGalleryFocus = '1';
      gallery.src = 'js/bao-gallery-focus.js?v=4';
      document.head.appendChild(gallery);
    }
  };
  refreshStylesheet('css/explore-zones.css', 'original-violet-mint-1');
  refreshStylesheet('css/bao-mascot.css', '5');
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

  const desktop = window.matchMedia('(min-width:1081px)');
  let mode = 'play';
  let statusOpen = false;
  // Play is always the entry surface. Studio is useful while editing, but it must
  // never make a later reading session reopen with cost and token controls exposed.
  try {
    localStorage.removeItem('bao-lab:story-surface-v1');
    localStorage.removeItem('bao-lab:immersive-reading');
  } catch {}

  const currentPanel = () => root.querySelector('.ui-tab.active')?.dataset.panel || 'npc';

  const hasGameplaySurface = () => {
    if (App.activeCharacter?.play_info_surface === 'game-ui') return true;
    try {
      const schema = window.BAOGameplayUI?.schemaFor?.(App.activeCharacter);
      if (schema?.panels?.length) return true;
    } catch {}
    return false;
  };

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

  const syncStatusButtonContract = () => {
    const button = document.getElementById('bao-play-status-toggle');
    if (!button) return;
    const readerContext = mode === 'play' && desktop.matches && !hasGameplaySurface();
    button.setAttribute('aria-controls', readerContext ? 'bao-reader-context' : 'game-ui');
    button.setAttribute('aria-label', readerContext ? '查看故事資訊' : '查看人物、事件與作品資訊');
    button.title = readerContext
      ? '閱讀層：現況、人物、世界與記憶'
      : '人物、狀態、事件、記憶與作品自訂分頁';
  };

  const syncSurfaceNavigation = () => {
    const story = document.getElementById('bao-story-surface-story');
    const stage = document.getElementById('bao-play-status-toggle');
    const control = document.getElementById('bao-surface-mode-toggle');
    const section = mode === 'studio' ? 'control' : statusOpen ? 'stage' : 'story';
    root.dataset.baoExperienceSurface = section;
    [
      [story, section === 'story'],
      [stage, section === 'stage'],
      [control, section === 'control']
    ].forEach(([button, active]) => {
      if (!button) return;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('is-active', active);
    });
  };

  const closeStatus = () => {
    statusOpen = false;
    root.classList.remove('bao-play-status-open');
    window.BAOReaderContext?.close?.({ notify:false });
    const button = document.getElementById('bao-play-status-toggle');
    button?.setAttribute('aria-expanded', 'false');
    syncSurfaceNavigation();
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
      close.setAttribute('aria-label', '關閉故事資訊');
      close.addEventListener('click', closeStatus);
      panel.prepend(close);
      const help = window.BAOFeatureHelp?.button?.('info_panel');
      if (help) {
        help.id = 'bao-info-panel-help';
        close.insertAdjacentElement('afterend', help);
      }
    }
    return close;
  };

  const openStatus = () => {
    if (mode !== 'play') setMode('play');
    // Desktop Play gets a dedicated read-only context sheet. Studio and compact
    // layouts keep the existing game UI so editing and mobile behavior stay intact.
    if (mode === 'play' && desktop.matches && !hasGameplaySurface() && window.BAOReaderContext?.open?.({
      onClose: () => {
        statusOpen = false;
        document.getElementById('bao-play-status-toggle')?.setAttribute('aria-expanded', 'false');
      }
    })) {
      statusOpen = true;
      root.classList.remove('bao-play-status-open');
      const button = document.getElementById('bao-play-status-toggle');
      button?.setAttribute('aria-expanded', 'true');
      syncStatusButtonContract();
      syncSurfaceNavigation();
      return;
    }

    // Migrate an already-open tab that still has the retired reader loaded.
    window.BAOImmersiveReader?.setEnabled?.(false);
    root.classList.remove('bao-immersive-on');
    statusOpen = true;
    root.classList.add('bao-play-status-open');
    const button = document.getElementById('bao-play-status-toggle');
    button?.setAttribute('aria-expanded', 'true');
    ensureStatusClose();
    App.renderUIPanel?.(currentPanel());
    syncSurfaceNavigation();
  };

  const setMode = next => {
    const previousMode = mode;
    mode = next === 'studio' ? 'studio' : 'play';
    root.dataset.baoSurface = mode;
    const input = document.getElementById('user-input');
    if (input) input.placeholder = mode === 'play' ? '寫下你的下一句…' : '輸入你的行動或台詞…';
    const button = document.getElementById('bao-surface-mode-toggle');
    if (button) {
      const mobile = !desktop.matches;
      button.textContent = mode === 'studio' ? '返回故事' : '控制中心';
      button.setAttribute('aria-pressed', String(mode === 'studio'));
      button.setAttribute('aria-label', mode === 'studio' ? '返回故事閱讀' : '開啟控制中心');
    }
    syncStatusButtonContract();
    if (mode === 'studio') {
      closeStatus();
      if (previousMode !== mode && !desktop.matches) setTimeout(() => {
        if (mode !== 'studio' || !root.classList.contains('active')) return;
        if (window.matchMedia('(max-width:820px)').matches && window.BAOMobileReadingLayout) {
          window.BAOMobileReadingLayout.openTools();
        } else if (window.BAOStoryControlCenter?.open) {
          window.BAOStoryControlCenter.open();
        } else {
          window.BAOChatToolNavigation?.openDrawer?.({ overview:true });
        }
      }, 0);
    } else {
      // A normal Play-mode refresh must not close a tool drawer the player
      // explicitly opened from the mobile Composer ＋. Only close the drawer
      // when actually transitioning back from Studio to Play.
      if (previousMode !== mode) window.BAOChatToolNavigation?.closeDrawer?.();
      window.BAOChatExperience?.closeStatus?.();
      main.classList.remove('bao-mobile-panel-open');
    }
    syncSurfaceNavigation();
  };

  const ensure = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    // The legacy reader used a second pair of header buttons. Remove any stale
    // controls so the reading/tool switch remains the only mode control.
    root.classList.remove('bao-immersive-on');
    document.getElementById('bao-immersive-toggle')?.remove();
    document.getElementById('bao-immersive-exit')?.remove();
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
      controls = document.createElement('nav');
      controls.id = 'bao-surface-controls';
      controls.className = 'bao-surface-controls';
      header.append(controls);
    }
    controls.setAttribute('aria-label', '故事、舞臺與控制中心');

    let story = document.getElementById('bao-story-surface-story');
    if (!story) {
      story = document.createElement('button');
      story.type = 'button';
      story.id = 'bao-story-surface-story';
      story.dataset.baoSurfaceRole = 'story';
      story.textContent = '故事';
      story.setAttribute('aria-label', '回到故事');
      story.addEventListener('click', () => {
        closeStatus();
        setMode('play');
      });
      controls.append(story);
    }

    let status = document.getElementById('bao-play-status-toggle');
    if (!status) {
      status = document.createElement('button');
      status.type = 'button';
      status.id = 'bao-play-status-toggle';
      status.setAttribute('aria-controls', 'game-ui');
      status.setAttribute('aria-expanded', 'false');
      status.addEventListener('click', () => statusOpen ? closeStatus() : openStatus());
      controls.append(status);
    }
    status.dataset.baoSurfaceRole = 'stage';
    status.textContent = '舞臺';
    status.setAttribute('aria-label', '查看舞臺：人物、事件與作品資訊');
    status.title = '目前故事的世界、人物、事件與作品互動資訊';

    let surface = document.getElementById('bao-surface-mode-toggle');
    if (!surface) {
      surface = document.createElement('button');
      surface.type = 'button';
      surface.id = 'bao-surface-mode-toggle';
      surface.addEventListener('click', () => setMode(mode === 'play' ? 'studio' : 'play'));
      controls.append(surface);
    }
    surface.dataset.baoSurfaceRole = 'control';
    surface.dataset.openStoryControl = 'surface';

    // Older enhancement order could have injected a second "故事總覽" button
    // before the Story Surface mounted. The mode control now owns that route.
    header.querySelectorAll('[data-open-story-control]:not(#bao-surface-mode-toggle)')
      .forEach(node => node.remove());

    syncMeta();
    setMode(mode);
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
    const enteringStory = name === 'chat' && !root.classList.contains('active');
    const result = priorView(name, ...args);
    if (enteringStory) { closeStatus(); setMode('play'); }
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

  desktop.addEventListener?.('change', () => {
    closeStatus();
    setMode(mode);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && statusOpen) closeStatus();
  });

  window.BAOStorySurface = Object.freeze({
    get mode() { return mode; },
    get section() { return root.dataset.baoExperienceSurface || 'story'; },
    setMode,
    openStatus,
    closeStatus,
    sync
  });
  sync();
})();