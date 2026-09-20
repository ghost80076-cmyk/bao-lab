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
  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;
  const drawer = () => document.getElementById('bao-chat-tool-drawer');

  const measure = () => {
    if (!isMobile()) return;
    const headerBottom = Math.max(0, Math.round(document.querySelector('.topbar')?.getBoundingClientRect().bottom || 64));
    root.style.setProperty('--bao-mobile-header-bottom', `${headerBottom}px`);
    // Android may retain a shrunken visualViewport after its keyboard closes.
    // 100dvh is the default; use visualViewport only while an editor is focused
    // AND the keyboard has measurably reduced the visible screen.
    const focused = document.activeElement;
    const editing = root.contains(focused) && focused?.matches?.('textarea,input,[contenteditable="true"]');
    const visual = window.visualViewport;
    const keyboardVisible = editing && visual && window.innerHeight - visual.height > 120;
    root.style.setProperty('--bao-mobile-viewport-height', keyboardVisible ? `${Math.round(visual.height)}px` : '100dvh');
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
  const togglePanels = () => {
    const opened = main.classList.toggle('bao-mobile-panel-open');
    const panelButton = document.querySelector('[data-bao-mobile-panel-toggle]');
    if (panelButton) panelButton.setAttribute('aria-expanded', String(opened));
    if (opened) {
      const panel = document.querySelector('#chat-view .ui-tab.active')?.dataset.panel || 'npc';
      App.renderUIPanel?.(panel);
    }
  };
  const toTop = () => {
    if (window.BAOStoryIntegrity?.scrollToStart) BAOStoryIntegrity.scrollToStart();
    else {
      const stream = document.getElementById('chat-stream');
      stream?.scrollTo?.({ top: 0, behavior: 'smooth' });
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
    makeAction(quick, '◈ 世界狀態', openStatus);
    makeAction(quick, '⚙ 狀態欄管理', () => {
      if (window.BAOCharacterStatusUI?.openSettings) BAOCharacterStatusUI.openSettings();
      else clickOriginal('[data-open-status-manager]');
    });
    makeAction(quick, '人物／事件／記憶', togglePanels, { 'data-bao-mobile-panel-toggle': '', 'aria-expanded': String(main.classList.contains('bao-mobile-panel-open')) });
    makeAction(quick, 'API／切換模型', () => {
      if (window.BAOChatAPISettings?.open) BAOChatAPISettings.open();
      else clickOriginal('#bao-chat-api-aside');
    });
    makeAction(quick, '快速儲存', () => App.saveStory?.(true));
    makeAction(quick, '記憶／Token／成本', () => {
      if (window.BAOChatExperienceRepairs?.openSettings) BAOChatExperienceRepairs.openSettings();
      else document.getElementById('bao-chat-cost-open')?.click();
    });
    makeAction(quick, '✦ 聊天外觀', () => clickOriginal('[data-bao-open="appearance"]'), { 'data-bao-open': 'appearance' });
    makeAction(quick, '↑ 置頂', toTop);
    const connection = document.createElement('small');
    connection.setAttribute('aria-live', 'polite');
    const apiStatus = document.querySelector('#bao-chat-api-toolbar [data-bao-api-status]');
    connection.textContent = apiStatus?.textContent?.trim() || (App.config?.demoMode ? '本機預覽' : '可從這裡設定 API 與模型');
    quick.append(connection);
    const usage = document.createElement('span');
    usage.className = 'bao-mobile-usage';
    const usageNodes = [...document.querySelectorAll('#chat-view .usage-bar > span')];
    usage.textContent = usageNodes.map(node => node.textContent.trim()).filter(Boolean).join(' · ');
    quick.append(usage);
    body.prepend(quick);
  };

  const ensureTab = () => {
    if (document.getElementById('bao-mobile-tools-tab')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'bao-mobile-tools-tab';
    button.setAttribute('aria-label', '開啟或關閉故事功能表');
    button.setAttribute('aria-controls', 'bao-chat-tool-drawer');
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML = '<span aria-hidden="true">☰</span><span>工具</span>';
    button.addEventListener('click', openTools);
    root.append(button);
  };
  const sync = () => {
    ensureTab();
    measure();
    enhanceDrawer();
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
  root.addEventListener('focusin', schedule);
  root.addEventListener('focusout', schedule);
  window.BAOMobileReadingLayout = { version: 2, sync, openTools, enhanceDrawer, togglePanels };
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'css/mobile-reading-layout.css';
  document.head.append(style);
  sync();
})();
