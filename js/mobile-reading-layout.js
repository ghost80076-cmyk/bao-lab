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
  const supportUrl = () => document.querySelector('#chat-view .chat-layout > aside a[href*="ko-fi.com"]')?.href
    || document.querySelector('.topbar a[href*="ko-fi.com"]')?.href
    || 'https://ko-fi.com/roger2486';

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
  const ensureSupport = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    let link = header.querySelector('#bao-mobile-support');
    if (!link) {
      link = document.createElement('a');
      link.id = 'bao-mobile-support';
      link.className = 'bao-mobile-support-link';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', '投餵肉包，另開新視窗');
      const icon = document.createElement('img');
      icon.src = 'assets/bao-mark.svg';
      icon.alt = '';
      const label = document.createElement('span');
      label.textContent = '投餵肉包';
      link.append(icon, label);
      header.append(link);
    }
    link.href = supportUrl();
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
    const support = document.createElement('a');
    support.className = 'bao-mobile-support-link';
    support.href = supportUrl();
    support.target = '_blank';
    support.rel = 'noopener noreferrer';
    support.textContent = '🥟 支持 BAO/LAB・投餵肉包';
    support.addEventListener('click', () => nav.closeDrawer());
    quick.append(support);
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
    let button = document.getElementById('bao-mobile-tools-tab');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-mobile-tools-tab';
      button.setAttribute('aria-label', '開啟或關閉故事功能表');
      button.setAttribute('aria-controls', 'bao-chat-tool-drawer');
      button.setAttribute('aria-expanded', 'false');
      button.innerHTML = '<span aria-hidden="true">›</span>';
      button.addEventListener('click', openTools);
    }
    // Keep the trigger in its own grid row immediately before the composer.
    // A fixed tab over the story obscured the first characters of long paragraphs.
    const host = root.querySelector('.chat-main');
    if (host && button.parentElement !== host) host.append(button);
  };
  const sync = () => {
    ensureTab();
    ensureSupport();
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
  window.BAOMobileReadingLayout = { version: 4, sync, openTools, enhanceDrawer, togglePanels };
  const style = document.createElement('link');
  style.rel = 'stylesheet';
  style.href = 'css/mobile-reading-layout.css';
  document.head.append(style);
  const supportStyle = document.createElement('style');
  supportStyle.id = 'bao-mobile-support-style';
  supportStyle.textContent = `
    #bao-mobile-support{display:none!important}
    @media(max-width:820px){
      #chat-view .chat-topline{display:flex!important;align-items:center!important;flex-wrap:nowrap!important}
      #chat-view .chat-title-copy{flex:1 1 0!important;min-width:0!important;overflow:hidden}
      #chat-view .chat-title-copy h2{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      #chat-view.active #bao-mobile-support{display:inline-flex!important;align-items:center;justify-content:center;gap:5px;flex:0 0 auto;width:auto!important;min-height:40px;padding:7px 9px;border:1px solid rgba(214,170,115,.42);border-radius:10px;background:rgba(214,170,115,.1);color:#f4d6ad;text-decoration:none;font-size:12px;font-weight:700;white-space:nowrap}
      #bao-mobile-support img{width:18px;height:18px;flex:0 0 18px}
      #bao-mobile-support:focus-visible,#bao-chat-tool-drawer .bao-mobile-support-link:focus-visible{outline:3px solid #72e2d3;outline-offset:2px}
      #bao-chat-tool-drawer .bao-mobile-quick .bao-mobile-support-link{grid-column:1/-1;display:flex;align-items:center;justify-content:center;min-height:44px;padding:9px;border:1px solid rgba(214,170,115,.42);border-radius:10px;background:rgba(214,170,115,.12);color:#f4d6ad;text-decoration:none;font-size:13px;font-weight:700}
      /* A 36px dedicated row keeps the small drawer trigger out of story text. */
      #chat-view .chat-layout>.chat-main{grid-template-rows:auto minmax(0,1fr) auto auto 36px auto!important}
      #chat-view .composer{grid-row:6!important}
      #chat-view.active #bao-mobile-tools-tab{display:flex!important;position:static!important;grid-column:1!important;grid-row:5!important;align-self:center!important;justify-self:start!important;z-index:5!important;top:auto!important;left:auto!important;transform:none!important;margin:2px 0 2px 0!important;width:36px!important;height:32px!important;min-height:32px!important;padding:0!important;gap:0!important;border-radius:0 9px 9px 0!important;border:1px solid #51636f!important;border-left:0!important;background:#1b2935!important;box-shadow:none!important;font-size:23px!important;line-height:1!important}
      #chat-view.active #bao-mobile-tools-tab span:first-child{font-size:25px;line-height:1}
    }
    @media(max-width:360px){#chat-view.active #bao-mobile-support{font-size:11px;padding:7px 7px;gap:4px}#bao-mobile-support img{width:16px;height:16px;flex-basis:16px}}
  `;
  document.head.append(supportStyle);
  sync();
})();
