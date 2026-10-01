/* Responsive reading shell. Move existing status DOM; never duplicate or mutate world state. */
(() => {
  'use strict';
  if (window.BAOChatExperience || !window.App || !window.BAOChatPresentationCore) return;
  const root = document.getElementById('chat-view');
  const main = root?.querySelector('.chat-main');
  const layout = root?.querySelector('.chat-layout');
  if (!root || !main || !layout) return;
  const $ = id => document.getElementById(id);
  const clean = window.BAOChatPresentationCore.stripStatusAppendix;
  let scheduled = false;
  let wasOpened = false;
  let returnFocus = null;
  let initializedGroups = false;
  let desktopManuallyCollapsed = false;
  const desktopInfoRail = window.matchMedia('(min-width: 1430px)');

  const ensureGameUIHome = () => {
    const ui = $('game-ui');
    if (!ui) return null;
    let marker = $('bao-game-ui-home');
    if (!marker) {
      marker = document.createElement('span');
      marker.id = 'bao-game-ui-home';
      marker.hidden = true;
      ui.before(marker);
    }
    return marker;
  };

  const syncToggleState = () => {
    const rail = $('bao-reading-status');
    const button = $('bao-reading-status-toggle');
    if (!rail || !button) return;
    const visible = desktopInfoRail.matches
      ? !layout.classList.contains('bao-status-collapsed')
      : rail.classList.contains('is-open');
    button.setAttribute('aria-expanded', String(visible));
  };

  const syncInfoPlacement = rail => {
    const ui = $('game-ui');
    const marker = ensureGameUIHome();
    if (!ui || !marker || !rail) return;
    let detail = rail.querySelector('.bao-story-info-detail');
    if (!detail) {
      detail = document.createElement('section');
      detail.className = 'bao-story-info-detail';
      detail.setAttribute('aria-label', '故事詳細資訊');
      const head = document.createElement('div');
      head.className = 'bao-story-info-section-head';
      head.innerHTML = '<strong>詳細資訊</strong><small>人物、狀態、事件、記憶與世界資料</small>';
      detail.append(head);
      rail.append(detail);
    }
    if (desktopInfoRail.matches) {
      if (ui.parentElement !== detail) detail.append(ui);
    } else if (ui.parentElement === detail) {
      marker.after(ui);
    }
  };

  function closeStatus(manual = false) {
    const rail = $('bao-reading-status');
    rail?.classList.remove('is-open');
    $('bao-reading-status-backdrop')?.classList.remove('is-visible');

    // Wide desktop uses the rail as persistent reading context. Navigation
    // cleanup may ask transient surfaces to close while switching views; that
    // must not collapse the persistent rail unless the player closed it.
    if (desktopInfoRail.matches && root.classList.contains('active') && !manual) {
      layout.classList.remove('bao-status-collapsed');
      syncToggleState();
      wasOpened = false;
      return;
    }

    if (manual && desktopInfoRail.matches) desktopManuallyCollapsed = true;
    layout.classList.add('bao-status-collapsed');
    syncToggleState();
    if (wasOpened && returnFocus?.isConnected) returnFocus.focus();
    wasOpened = false;
  }
  function openStatus() {
    const rail = $('bao-reading-status');
    if (!rail) return;
    if (desktopInfoRail.matches) desktopManuallyCollapsed = false;
    returnFocus = document.activeElement;
    wasOpened = true;
    layout.classList.remove('bao-status-collapsed');
    rail.classList.add('is-open');
    $('bao-reading-status-backdrop')?.classList.add('is-visible');
    syncToggleState();
    rail.querySelector('.bao-status-close')?.focus();
  }
  function ensureRail() {
    let rail = $('bao-reading-status');
    if (!rail) {
      rail = document.createElement('aside');
      rail.id = 'bao-reading-status';
      rail.className = 'bao-status-rail';
      rail.setAttribute('aria-label', '故事資訊');
      const heading = document.createElement('div');
      heading.className = 'bao-status-heading';
      const title = document.createElement('h3'); title.textContent = '故事資訊';
      const help = window.BAOFeatureHelp?.button?.('world_status');
      const close = document.createElement('button');
      close.type = 'button'; close.className = 'bao-status-close secondary';
      close.textContent = '關閉'; close.setAttribute('aria-label', '關閉故事資訊');
      close.addEventListener('click', () => closeStatus(true));
      heading.append(title);
      if (help) heading.append(help);
      heading.append(close);
      const sectionHead = document.createElement('div');
      sectionHead.className = 'bao-story-info-section-head bao-story-info-current-head';
      sectionHead.innerHTML = '<strong>現況</strong><small>時間、地點、在場人物與最近變化</small>';
      const host = document.createElement('div'); host.className = 'bao-rail-status-host';
      const info = document.createElement('p'); info.className = 'bao-status-empty note';
      info.textContent = '目前沒有可顯示的故事資訊。';
      host.append(info);
      rail.append(heading, sectionHead, host);
      layout.append(rail);
    }
    if (!$('bao-reading-status-backdrop')) {
      const backdrop = document.createElement('div');
      backdrop.id = 'bao-reading-status-backdrop';
      backdrop.addEventListener('click', () => closeStatus(true));
      root.append(backdrop);
    }
    if (!$('bao-reading-status-toggle')) {
      const button = document.createElement('button');
      button.type = 'button'; button.id = 'bao-reading-status-toggle';
      button.className = 'secondary'; button.textContent = '◈ 故事資訊';
      button.setAttribute('aria-controls', 'bao-reading-status');
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('click', () => {
        const open = desktopInfoRail.matches
          ? !layout.classList.contains('bao-status-collapsed')
          : rail.classList.contains('is-open');
        if (open) closeStatus(true); else openStatus();
      });
      main.querySelector('.chat-topline')?.append(button);
    }
    const host = rail.querySelector('.bao-rail-status-host');
    for (const id of ['bao-scene-native-status', 'bao-scene-author-status']) {
      const node = $(id);
      if (node && node.parentElement !== host) host.append(node);
    }
    const available = Boolean($('bao-scene-native-status') || $('bao-scene-author-status'));
    const empty = rail.querySelector('.bao-status-empty');
    if (empty) {
      empty.hidden = available;
      if (window.BAOSceneHTML?.prefs?.status === 'hidden') {
        empty.hidden = false;
        empty.textContent = '你已在「顯示方式」中隱藏狀態欄。';
      } else empty.textContent = '目前沒有可顯示的故事資訊。';
    }
    window.BAOChatToolNavigation?.compactBoard?.(rail);
    if (desktopInfoRail.matches && root.classList.contains('active') && !desktopManuallyCollapsed) {
      layout.classList.remove('bao-status-collapsed');
    }
    syncInfoPlacement(rail);
    syncToggleState();
    return rail;
  }
  function simplifyGroups() {
    if (initializedGroups) return;
    const groups = $('bao-chat-tool-groups');
    if (!groups) return;
    const scene = groups.querySelector('[data-chat-tool-group="scene"]');
    const world = groups.querySelector('[data-chat-tool-group="world"]');
    const settings = groups.querySelector('[data-chat-tool-group="settings"]');
    if (scene) {
      const label = scene.querySelector(':scope > summary');
      if (label) label.textContent = '◈ 顯示方式';
      scene.open = false;
    }
    if (world) world.querySelector(':scope > summary').textContent = '◇ 世界設定';
    if (settings) settings.querySelector(':scope > summary').textContent = '⚙ 模型與敘事';
    initializedGroups = true;
  }
  function paintCommittedMessages() {
    const stream = $('chat-stream');
    const messages = window.Chat?.messages;
    const scene = window.BAOSceneHTML;
    if (!stream || !Array.isArray(messages) || typeof scene?.render !== 'function') return;
    const nodes = [...stream.querySelectorAll(':scope > .message')];
    const greeting = nodes[0]?.dataset.storyGreeting === 'true' || nodes[0]?.querySelector('.bubble')?.dataset.authoredGreeting === 'true';
    if (!messages.length && nodes.length === 1 && greeting) {
      const raw = App.activeCharacter?.greeting || '';
      const cleaned = clean(raw);
      const bubble = nodes[0].querySelector('.bubble');
      if (cleaned !== raw && bubble && !bubble.querySelector('.story-inline-editor')) {
        const html = scene.render(cleaned, true);
        if (bubble.innerHTML !== html) bubble.innerHTML = html;
      }
      return;
    }
    const offset = nodes.length === messages.length + 1 && greeting ? 1 : 0;
    if (nodes.length !== messages.length + offset ||
        !messages.every((m, i) => nodes[i + offset].classList.contains(m.role === 'user' ? 'user' : 'assistant'))) return;
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'assistant') continue;
      const cleaned = clean(msg.content);
      if (cleaned === msg.content) continue;
      const bubble = nodes[i + offset].querySelector('.bubble');
      if (!bubble || bubble.querySelector('.story-inline-editor')) continue;
      const html = scene.render(cleaned, Boolean(msg.greeting));
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
    }
  }
  function sync() {
    ensureRail();
    simplifyGroups();
    paintCommittedMessages();
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; sync(); });
  }
  desktopInfoRail.addEventListener?.('change', schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('bao-reading-status')?.classList.contains('is-open')) closeStatus(true);
  });
  const oldRenderShell = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = oldRenderShell(...args);
    schedule();
    return result;
  };
  window.BAOChatExperience = Object.freeze({ sync, openStatus, closeStatus });
  schedule();
})();
