/* Optional, presentation-only reading mode. Do not touch story, API or saved state. */
(() => {
  'use strict';
  if (window.BAOImmersiveReader || !window.App) return;
  const root = document.getElementById('chat-view');
  const main = root?.querySelector('.chat-main');
  if (!root || !main) return;
  const KEY = 'bao-lab:immersive-reading';
  const css = document.createElement('style');
  css.id = 'bao-immersive-reader-style';
  css.textContent = `
    #bao-immersive-toggle{flex:0 0 auto;min-height:40px;width:auto;padding:7px 12px;border:1px solid #68847f;border-radius:11px;background:#1b2935;color:#e6f8f2;font-size:13px;font-weight:700;cursor:pointer}
    #bao-immersive-toggle:focus-visible{outline:3px solid #70e3d1;outline-offset:2px}
    #chat-view.active.bao-immersive-on .chat-layout{grid-template-columns:minmax(0,1fr)!important}
    #chat-view.active.bao-immersive-on .chat-layout>aside,
    #chat-view.active.bao-immersive-on #game-ui,
    #chat-view.active.bao-immersive-on .usage-bar,
    #chat-view.active.bao-immersive-on .story-message-tools,
    #chat-view.active.bao-immersive-on .story-variant-switcher,
    #chat-view.active.bao-immersive-on .story-mobile-tools,
    #chat-view.active.bao-immersive-on #bao-mobile-tools-tab,
    #chat-view.active.bao-immersive-on #bao-chat-floating-actions,
    #chat-view.active.bao-immersive-on #bao-reading-status,
    #chat-view.active.bao-immersive-on #bao-reading-status-backdrop,
    #chat-view.active.bao-immersive-on #bao-reading-status-toggle{display:none!important}
    #chat-view.active.bao-immersive-on .chat-main{min-width:0;width:100%;max-width:none!important}
    #chat-view.active.bao-immersive-on #chat-stream{width:100%;max-width:800px;min-width:0;margin-inline:auto;box-sizing:border-box;padding-inline:clamp(12px,3vw,32px)}
    #chat-view.active.bao-immersive-on #chat-stream .message.assistant .bubble{max-width:100%;line-height:1.82;overflow-wrap:anywhere}
    #chat-view.active.bao-immersive-on .composer{width:100%;max-width:800px;min-width:0;margin-inline:auto;box-sizing:border-box}
    @media(max-width:820px){
      #chat-view.active.bao-immersive-on .chat-layout>.chat-main{grid-template-rows:auto minmax(0,1fr) 0 0 0 auto!important}
      #chat-view.active.bao-immersive-on #chat-stream{padding-inline:14px}
      #bao-immersive-toggle{font-size:12px;padding:7px 9px}
    }
  `;
  document.head.append(css);
  let enabled = false;
  try { enabled = localStorage.getItem(KEY) === 'on'; } catch {}
  const closeOpenPanels = () => {
    window.BAOChatExperience?.closeStatus?.();
    window.BAOChatToolNavigation?.closeDrawer?.();
    main.classList.remove('bao-mobile-panel-open');
  };
  const sync = () => {
    const header = main.querySelector('.chat-topline');
    if (!header) return;
    let button = document.getElementById('bao-immersive-toggle');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.id = 'bao-immersive-toggle';
      button.addEventListener('click', () => setEnabled(!enabled));
    }
    if (button.parentElement !== header) header.append(button);
    button.textContent = enabled ? '退出閱讀' : '沉浸閱讀';
    button.setAttribute('aria-label', enabled ? '退出沉浸閱讀，顯示故事工具' : '進入沉浸閱讀，專注故事正文');
    button.setAttribute('aria-pressed', String(enabled));
    root.classList.toggle('bao-immersive-on', enabled);
  };
  function setEnabled(value) {
    enabled = Boolean(value);
    if (enabled) closeOpenPanels();
    try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch {}
    sync();
  }
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; sync(); });
  };
  const observer = new MutationObserver(mutations => {
    if (mutations.some(m => [...m.addedNodes, ...m.removedNodes].some(node =>
      node.nodeType === 1 && (node.classList?.contains('chat-topline') || node.id === 'bao-immersive-toggle')))) schedule();
  });
  observer.observe(main, { childList: true, subtree: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && enabled && root.classList.contains('active')) setEnabled(false);
  });
  window.BAOImmersiveReader = { get enabled() { return enabled; }, setEnabled, sync };
  sync();
})();
