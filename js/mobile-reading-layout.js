/* A reading-first mobile shell. Never clone or replace the underlying tool handlers. */
(() => {
  'use strict';
  if (window.BAOMobileReadingLayout || !window.App || !window.BAOChatToolNavigation) return;
  const root = document.getElementById('chat-view');
  const main = root?.querySelector('.chat-main');
  if (!root || !main) return;
  const nav = window.BAOChatToolNavigation;
  let scheduled = false;
  let previousFocus = null;
  let keyboardOpen = false;
  let focusScrollTop = null;
  let stableViewport = { width: 0, height: 0 };
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  const drawer = () => document.getElementById('bao-chat-tool-drawer');
  const supportUrl = () => document.querySelector('#chat-view .chat-layout > aside a[href*="ko-fi.com"]')?.href
    || document.querySelector('.topbar a[href*="ko-fi.com"]')?.href
    || 'https://ko-fi.com/roger2486';
  const mobileControlIds = ['bao-mobile-exit', 'bao-mobile-status', 'bao-mobile-memory', 'bao-mobile-support', 'bao-mobile-tools-tab', 'bao-mobile-panel-close', 'bao-mobile-composer-tools', 'bao-mobile-composer-inspire'];
  const clearMobileChrome = () => {
    mobileControlIds.forEach(id => document.getElementById(id)?.remove());
    const panel = drawer();
    if (panel?.dataset.baoMobileEnhanced === 'true') nav.closeDrawer();
    main.classList.remove('bao-mobile-panel-open');
    delete root.dataset.baoKeyboardOpen;
    ['--bao-mobile-header-bottom', '--bao-mobile-viewport-top', '--bao-mobile-viewport-left', '--bao-mobile-viewport-width', '--bao-mobile-viewport-height']
      .forEach(property => root.style.removeProperty(property));
  };

  const measure = () => {
    if (!isMobile()) return;
    const headerBottom = Math.max(0, Math.round(document.querySelector('.topbar')?.getBoundingClientRect().bottom || 64));
    root.style.setProperty('--bao-mobile-header-bottom', `${headerBottom}px`);

    const focused = document.activeElement;
    const editing = root.contains(focused) && focused?.matches?.('textarea,input,[contenteditable="true"]');
    const visual = window.visualViewport;
    const layoutWidth = Math.max(1, Math.round(window.innerWidth || document.documentElement.clientWidth || 1));
    const layoutHeight = Math.max(1, Math.round(window.innerHeight || document.documentElement.clientHeight || 1));
    const visualWidth = Math.max(1, Math.round(visual?.width || layoutWidth));
    const visualHeight = Math.max(1, Math.round(visual?.height || layoutHeight));
    const visualTop = Math.max(0, Math.round(visual?.offsetTop || 0));
    const visualLeft = Math.max(0, Math.round(visual?.offsetLeft || 0));

    // Keep a keyboard-free baseline. Some Android/Samsung browsers resize both
    // innerHeight and visualViewport, so comparing those two values alone misses
    // the keyboard entirely. A meaningful width change means orientation changed.
    const orientationChanged = stableViewport.width && Math.abs(layoutWidth - stableViewport.width) > 80;
    if (!editing || !stableViewport.height || orientationChanged) {
      stableViewport = {
        width: layoutWidth,
        height: Math.max(layoutHeight, visualHeight + visualTop)
      };
    }

    const lostHeight = stableViewport.height - Math.min(layoutHeight, visualHeight);
    const keyboardVisible = Boolean(editing && (
      lostHeight > 120
      || stableViewport.height - layoutHeight > 120
      || stableViewport.height - visualHeight > 120
      || visualTop > 40
    ));
    const wasKeyboardOpen = keyboardOpen;
    keyboardOpen = keyboardVisible;

    if (keyboardVisible) {
      // Follow the *visual* viewport, including its pan offset. Without offsetTop,
      // browsers that pan the page to reveal the focused textarea can leave the
      // composer near the top with a large dead area above the keyboard.
      root.style.setProperty('--bao-mobile-viewport-top', `${visualTop}px`);
      root.style.setProperty('--bao-mobile-viewport-left', `${visualLeft}px`);
      root.style.setProperty('--bao-mobile-viewport-width', `${visualWidth}px`);
      root.style.setProperty('--bao-mobile-viewport-height', `${visualHeight}px`);
      root.dataset.baoKeyboardOpen = 'true';
    } else {
      root.style.setProperty('--bao-mobile-viewport-top', '0px');
      root.style.setProperty('--bao-mobile-viewport-left', '0px');
      root.style.setProperty('--bao-mobile-viewport-width', '100%');
      root.style.setProperty('--bao-mobile-viewport-height', '100dvh');
      delete root.dataset.baoKeyboardOpen;
    }

    // Preserve the story reading position once when the keyboard first takes
    // over the viewport. Streaming scroll behavior is handled separately.
    if (keyboardVisible && !wasKeyboardOpen && focusScrollTop !== null) {
      const stream = document.getElementById('chat-stream');
      const target = focusScrollTop;
      focusScrollTop = null;
      window.requestAnimationFrame(() => {
        if (stream?.isConnected && keyboardOpen) stream.scrollTop = target;
      });
    }
  };

  const sourceButton = selector => document.querySelector(`#chat-view .chat-layout > aside ${selector}`);
  const clickOriginal = selector => {
    const source = sourceButton(selector);
    if (source) source.click();
    else window.alert('這項功能還在載入，請稍後再試。');
  };
  const makeAction = (host, text, run, attributes = {}) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    Object.entries(attributes).forEach(([key, value]) => button.setAttribute(key, value));
    button.addEventListener('click', () => {
      nav.closeDrawer();
      run();
    });
    host.append(button);
    return button;
  };
  const openTools = () => {
    if (!isMobile() || !root.classList.contains('active')) return;
    if (drawer()) { nav.closeDrawer(); return; }
    previousFocus = document.activeElement;
    nav.openDrawer();
    enhanceDrawer();
  };
  const openStatus = () => {
    if (window.BAOChatExperience?.openStatus) BAOChatExperience.openStatus();
    else document.getElementById('bao-reading-status-toggle')?.click();
  };
  const closePanels = () => {
    main.classList.remove('bao-mobile-panel-open');
    document.querySelector('[data-bao-mobile-panel-toggle]')?.setAttribute('aria-expanded', 'false');
    document.getElementById('bao-mobile-memory')?.setAttribute('aria-expanded', 'false');
    schedule();
  };
  const openMemory = () => {
    const activePanel = document.querySelector('#chat-view .ui-tab.active')?.dataset.panel || '';
    if (main.classList.contains('bao-mobile-panel-open') && activePanel === 'memory') {
      closePanels();
      return;
    }
    main.classList.add('bao-mobile-panel-open');
    const tab = document.querySelector('#chat-view .ui-tab[data-panel="memory"]');
    if (tab) tab.click();
    else App.renderUIPanel?.('memory');
    document.querySelector('[data-bao-mobile-panel-toggle]')?.setAttribute('aria-expanded', 'true');
    document.getElementById('bao-mobile-memory')?.setAttribute('aria-expanded', 'true');
    schedule();
  };
  const togglePanels = () => {
    if (main.classList.contains('bao-mobile-panel-open')) {
      closePanels();
      return;
    }
    main.classList.add('bao-mobile-panel-open');
    const panelButton = document.querySelector('[data-bao-mobile-panel-toggle]');
    if (panelButton) panelButton.setAttribute('aria-expanded', 'true');
    const panel = document.querySelector('#chat-view .ui-tab.active')?.dataset.panel || 'npc';
    App.renderUIPanel?.(panel);
    schedule();
  };
  const toTop = () => {
    if (window.BAOStoryIntegrity?.scrollToStart) BAOStoryIntegrity.scrollToStart();
    else {
      const stream = document.getElementById('chat-stream');
      stream?.scrollTo?.({ top: 0, behavior: 'smooth' });
    }
  };
  const ensureExit = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    let button = header.querySelector('#bao-mobile-exit');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-mobile-exit';
      button.className = 'bao-mobile-header-action';
      button.textContent = '←';
      button.setAttribute('aria-label', '離開故事');
      button.addEventListener('click', () => {
        if (!window.confirm('離開前會自動儲存目前進度。確定離開故事嗎？')) return;
        App.exitChat?.();
      });
      header.prepend(button);
    }
  };
  const ensureStatus = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    let button = header.querySelector('#bao-mobile-status');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-mobile-status';
      button.className = 'bao-mobile-header-action bao-mobile-status-action';
      button.textContent = '世界';
      button.setAttribute('aria-label', '查看世界狀態');
      button.title = '目前故事已確認的時間、地點、人物與世界狀態';
      button.addEventListener('click', openStatus);
      header.append(button);
    }
  };
  const ensureMemory = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    let button = header.querySelector('#bao-mobile-memory');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-mobile-memory';
      button.className = 'bao-mobile-header-action bao-mobile-memory-action';
      button.textContent = '記憶';
      button.setAttribute('aria-label', '查看或收起故事記憶');
      button.setAttribute('aria-controls', 'game-ui');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', openMemory);
      header.append(button);
    }
  };
  const ensurePanelClose = () => {
    const tabs = main.querySelector('#game-ui .ui-tabs');
    if (!tabs) return;
    let button = tabs.querySelector('#bao-mobile-panel-close');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-mobile-panel-close';
      button.className = 'ui-tab bao-mobile-panel-close';
      button.textContent = '×';
      button.setAttribute('aria-label', '收起人物、狀態、事件與記憶面板');
      button.setAttribute('title', '收起資訊面板');
      button.addEventListener('click', closePanels);
      tabs.append(button);
    }
  };
  const ensureSupport = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    let link = header.querySelector('#bao-mobile-support');
    if (!link) {
      link = document.createElement('a');
      link.id = 'bao-mobile-support';
      link.className = 'bao-mobile-header-action bao-mobile-support-action';
      link.href = supportUrl();
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.innerHTML = '<img class="bao-mobile-bun-icon" src="assets/bao-bun.svg" width="26" height="26" alt="">';
      link.title = '投餵肉包';
      link.setAttribute('aria-label', '投餵肉包');
      header.append(link);
    }
  };
  const enhanceDrawer = () => {
    const panel = drawer();
    if (!panel || panel.dataset.baoMobileEnhanced === 'true') return;
    panel.dataset.baoMobileEnhanced = 'true';
    const body = panel.querySelector('.bao-chat-tool-dialog-body');
    if (!body) return;
    const quick = document.createElement('nav');
    quick.className = 'bao-mobile-quick';
    quick.setAttribute('aria-label', '手機常用功能');
    makeAction(quick, '☷ 故事控制台', () => {
      if (window.BAOStoryControlCenter?.open) BAOStoryControlCenter.open();
      else window.alert('故事控制台仍在載入，請稍後再試。');
    });
    makeAction(quick, '◔ 上下文狀態', () => {
      if (window.BAOContextHealth?.open) BAOContextHealth.open();
      else window.alert('上下文狀態仍在載入，請稍後再試。');
    });
    makeAction(quick, '◈ 世界狀態', openStatus);
    makeAction(quick, '人物／事件', togglePanels, { 'data-bao-mobile-panel-toggle': '', 'aria-expanded': String(main.classList.contains('bao-mobile-panel-open')) });
    makeAction(quick, '🧠 記憶', openMemory);
    makeAction(quick, 'API／切換模型', () => {
      if (window.BAOChatAPISettings?.open) BAOChatAPISettings.open();
      else clickOriginal('#bao-chat-api-aside');
    });
    makeAction(quick, '快速儲存', () => App.saveStory?.(true));
    makeAction(quick, '✦ 聊天外觀', () => clickOriginal('[data-bao-open="appearance"]'), { 'data-bao-open': 'appearance' });
    makeAction(quick, '↑ 置頂', toTop);
    const support = document.createElement('a');
    support.className = 'bao-mobile-support-link';
    support.href = supportUrl();
    support.target = '_blank';
    support.rel = 'noopener noreferrer';
    support.innerHTML = '<img class="bao-mobile-bun-icon" src="assets/bao-bun.svg" width="26" height="26" alt=""><span>投餵肉包</span>';
    support.addEventListener('click', () => nav.closeDrawer());
    quick.append(support);
    const connection = document.createElement('small');
    connection.setAttribute('aria-live', 'polite');
    const apiStatus = document.querySelector('#bao-chat-api-toolbar [data-bao-api-status]');
    connection.textContent = apiStatus?.textContent?.trim() || (App.config?.demoMode ? '本機預覽' : '可從這裡設定 API 與模型');
    quick.append(connection);
    body.prepend(quick);
  };

  const ensureComposerTools = () => {
    const composer = main.querySelector('.composer');
    const input = document.getElementById('user-input');
    const send = composer?.querySelector('[data-send-message],button.primary');
    if (!composer || !input || !send) return;

    let tools = composer.querySelector('#bao-mobile-composer-tools');
    if (!tools) {
      tools = document.createElement('button');
      tools.type = 'button';
      tools.id = 'bao-mobile-composer-tools';
      tools.className = 'bao-mobile-composer-action';
      tools.textContent = '＋';
      tools.setAttribute('aria-label', '開啟故事工具');
      tools.title = '故事工具';
      tools.addEventListener('click', openTools);
      composer.insertBefore(tools, input);
    }

    let inspire = composer.querySelector('#bao-mobile-composer-inspire');
    if (!inspire) {
      inspire = document.createElement('button');
      inspire.type = 'button';
      inspire.id = 'bao-mobile-composer-inspire';
      inspire.className = 'bao-mobile-composer-action bao-mobile-composer-inspire';
      inspire.textContent = '✦';
      inspire.setAttribute('aria-label', 'AI 行動靈感');
      inspire.addEventListener('click', async () => {
        if (App.__requestPending) {
          window.BAOFeedback?.notify?.('目前正在生成回覆，完成後再取得行動靈感。', 'error');
          return;
        }
        if (!window.BAOStoryReader?.inspireLatest) {
          window.BAOFeedback?.notify?.('行動靈感仍在載入，請稍後再試。', 'error');
          return;
        }
        await window.BAOStoryReader.inspireLatest(inspire);
      });
      send.before(inspire);
    }
    const available = window.BAOStoryReader?.aiToolsAvailable?.() ?? true;
    inspire.disabled = !available;
    inspire.title = available
      ? '依目前故事提供 4 個下一步靈感，不會自動送出'
      : (window.BAOStoryReader?.aiToolsUnavailableMessage?.() || '連接 AI 後即可使用');
  };

  const ensureTab = () => {
    let button = document.getElementById('bao-mobile-tools-tab');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-mobile-tools-tab';
      button.className = 'bao-mobile-header-action bao-mobile-tools-action';
      button.setAttribute('aria-label', '開啟或關閉故事功能表');
      button.setAttribute('aria-controls', 'bao-chat-tool-drawer');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<span aria-hidden="true">•••</span>';
      button.addEventListener('click', openTools);
    }
    const host = main.querySelector('.chat-topline');
    if (host && button.parentElement !== host) host.append(button);
  };
  const sync = () => {
    if (!isMobile()) {
      clearMobileChrome();
      return;
    }
    ensureExit();
    ensureStatus();
    ensureMemory();
    ensureSupport();
    ensureTab();
    ensurePanelClose();
    ensureComposerTools();
    measure();
    enhanceDrawer();
    const panelOpen = main.classList.contains('bao-mobile-panel-open');
    const activePanel = document.querySelector('#chat-view .ui-tab.active')?.dataset.panel || '';
    const memoryButton = document.getElementById('bao-mobile-memory');
    if (memoryButton) {
      const memoryOpen = panelOpen && activePanel === 'memory';
      memoryButton.setAttribute('aria-expanded', String(memoryOpen));
      memoryButton.classList.toggle('is-active', memoryOpen);
    }
    const tab = document.getElementById('bao-mobile-tools-tab');
    if (tab) {
      const open = Boolean(drawer());
      tab.setAttribute('aria-expanded', String(open));
      if (!open && previousFocus === tab) previousFocus = null;
    }
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(() => { scheduled = false; sync(); });
  };

  const previousRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = previousRender(...args);
    schedule();
    return result;
  };
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(node =>
      node.nodeType === 1 && (node.id === 'bao-chat-tool-drawer' || node.id === 'bao-mobile-tools-tab')))) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('resize', schedule, { passive: true });
  window.visualViewport?.addEventListener('scroll', schedule, { passive: true });
  root.addEventListener('focusin', event => {
    if (event.target?.matches?.('textarea,input,[contenteditable="true"]')) {
      focusScrollTop = document.getElementById('chat-stream')?.scrollTop ?? null;
    }
    schedule();
  });
  root.addEventListener('focusout', () => {
    focusScrollTop = null;
    schedule();
  });
  window.BAOMobileReadingLayout = { version: 10, sync, openTools, enhanceDrawer, togglePanels, openMemory, closePanels, ensureComposerTools };
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'css/mobile-reading-layout.css?v=10';
  document.head.append(style);
  sync();
})();
