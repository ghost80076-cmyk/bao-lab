/* Group existing chat controls without replacing their event handlers. */
(() => {
  'use strict';
  if (window.BAOChatToolNavigation || !window.App) return;

  const aside = () => document.querySelector('#chat-view .chat-layout > aside');
  const expanded = new Map();
  const nativeExpanded = new Map();
  const groupDefinitions = [
    ['scene', '◈ 場景與狀態'],
    ['world', '◇ 世界與狀態工具'],
    ['story', '▤ 故事與存檔'],
    ['settings', '⚙ 敘事、模型與外觀'],
    ['other', '其他操作']
  ];
  let scheduled = false;
  let watcher = null;
  let watchedAside = null;

  const addStyle = () => {
    if (document.querySelector('link[href="css/chat-tool-navigation.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/chat-tool-navigation.css';
    document.head.append(link);
  };
  const groupBody = (root, id) => root.querySelector(`[data-chat-tool-body="${id}"]`);
  const ensureGroup = (root, id, title) => {
    let detail = root.querySelector(`[data-chat-tool-group="${id}"]`);
    if (detail) return detail;
    detail = document.createElement('details');
    detail.dataset.chatToolGroup = id;
    detail.open = expanded.has(id) ? expanded.get(id) : id === 'scene';
    const summary = document.createElement('summary');
    summary.textContent = title;
    const body = document.createElement('div');
    body.dataset.chatToolBody = id;
    detail.append(summary, body);
    detail.addEventListener('toggle', () => expanded.set(id, detail.open));
    root.append(detail);
    return detail;
  };
  const move = (node, target) => {
    if (node && target && node.parentElement !== target) target.append(node);
  };

  const compactBoard = root => {
    (root?.matches?.('.bao-native-status-board')
      ? root.querySelectorAll(':scope > .bao-native-status-section:not([data-chat-section-ready])')
      : root?.querySelectorAll('.bao-native-status-board > .bao-native-status-section:not([data-chat-section-ready])') || []).forEach(section => {
      const heading = section.querySelector(':scope > h4');
      if (!heading) return;
      const title = heading.textContent.trim();
      const count = section.querySelectorAll('.bao-native-status-person').length;
      const key = title.replace(/^\S+\s*/, '');
      const detail = document.createElement('details');
      detail.className = 'bao-chat-status-detail';
      detail.open = nativeExpanded.has(key) ? nativeExpanded.get(key) : title.includes('玩家資料');
      const summary = document.createElement('summary');
      summary.textContent = title + (count && !title.includes('玩家資料') ? ` · ${count}` : '');
      const content = document.createElement('div');
      content.className = 'bao-chat-status-detail-body';
      heading.remove();
      while (section.firstChild) content.append(section.firstChild);
      detail.append(summary, content);
      detail.addEventListener('toggle', () => nativeExpanded.set(key, detail.open));
      section.append(detail);
      section.dataset.chatSectionReady = 'true';
    });
  };

  const openStatusManager = () => {
    if (!window.GameState?.current) { window.alert('請先開始或讀取故事。'); return; }
    if (window.BAOCharacterStatusUI?.openSettings) {
      window.BAOCharacterStatusUI.openSettings();
      return;
    }
    const original = aside()?.querySelector('[data-open-status-manager]');
    if (original) original.click();
    else window.alert('狀態欄管理仍在載入，請稍後再試。');
  };

  const ensureShortcuts = () => {
    const main = document.querySelector('#chat-view .chat-main');
    if (!main) return;
    let bar = main.querySelector('#bao-chat-tool-shortcuts');
    if (bar) return;
    bar = document.createElement('nav');
    bar.id = 'bao-chat-tool-shortcuts';
    bar.setAttribute('aria-label', '常用故事工具');
    const status = document.createElement('button');
    status.type = 'button';
    status.className = 'secondary';
    status.textContent = '⚙ 狀態欄管理';
    status.addEventListener('click', openStatusManager);
    const menu = document.createElement('button');
    menu.type = 'button';
    menu.className = 'secondary';
    menu.textContent = '☰ 全部功能';
    menu.addEventListener('click', openDrawer);
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'secondary';
    save.textContent = '快速儲存';
    save.addEventListener('click', () => App.saveStory?.(true));
    bar.append(save, status, menu);
    main.querySelector('.chat-topline')?.insertAdjacentElement('afterend', bar);
  };

  const sync = () => {
    const sidebar = aside();
    if (!sidebar) return;
    addStyle();
    ensureShortcuts();
    let quick = sidebar.querySelector('#bao-chat-quick-actions');
    let groups = sidebar.querySelector('#bao-chat-tool-groups');
    if (!quick) {
      quick = document.createElement('div');
      quick.id = 'bao-chat-quick-actions';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary bao-chat-status-launch';
      button.textContent = '⚙ 狀態欄管理';
      button.addEventListener('click', openStatusManager);
      quick.append(button);
      (sidebar.querySelector('.chat-meta') || sidebar.querySelector('#chat-character-card'))?.insertAdjacentElement('afterend', quick);
      if (!quick.isConnected) sidebar.prepend(quick);
    }
    if (!groups) {
      groups = document.createElement('div');
      groups.id = 'bao-chat-tool-groups';
      quick.insertAdjacentElement('afterend', groups);
    }
    groupDefinitions.forEach(([id, label]) => ensureGroup(groups, id, label));
    const targets = Object.fromEntries(groupDefinitions.map(([id]) => [id, groupBody(groups, id)]));
    const save = sidebar.querySelector('button[onclick*="App.saveStory"]');
    if (save) move(save, quick);
    move(sidebar.querySelector('#bao-scene-controls'), targets.scene);
    move(sidebar.querySelector('[data-open-status-manager]'), targets.world);
    move(sidebar.querySelector('[data-open-world-manager]'), targets.world);
    for (const selector of ['#save-slot-button', '#story-branch-button', '#list-slots-button', '#import-save-button', '#slot-list', '#export-story-button', '[data-bao-open="story-tools"]', '[data-open-story-backup]']) {
      move(sidebar.querySelector(selector), targets.story);
    }
    move(sidebar.querySelector('#bao-chat-api-aside'), targets.settings);
    move(sidebar.querySelector('#bao-player-settings'), targets.settings);
    move(sidebar.querySelector('.text-button[onclick*="exitChat"]'), targets.other);
    move(sidebar.querySelector('a[href*="ko-fi.com"]'), targets.other);
    [...sidebar.children].filter(node => node.matches('button, a')).forEach(node => move(node, targets.other));
    compactBoard(sidebar);
    compactBoard(document.getElementById('ui-panel'));
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; sync(); });
  };
  const watchSidebar = () => {
    const sidebar = aside();
    if (!sidebar || sidebar === watchedAside) return;
    watcher?.disconnect();
    watchedAside = sidebar;
    watcher = new MutationObserver(schedule);
    watcher.observe(sidebar, { childList: true, subtree: true });
  };

  const closeDrawer = () => {
    const backdrop = document.getElementById('bao-chat-tool-drawer');
    if (!backdrop) return;
    const slots = backdrop.querySelector('#slot-list');
    if (slots) move(slots, aside()?.querySelector('[data-chat-tool-body="story"]'));
    backdrop.remove();
    document.removeEventListener('keydown', drawerKeys);
  };
  const drawerKeys = event => { if (event.key === 'Escape') closeDrawer(); };

  const proxy = (source, destination) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bao-chat-tool-proxy';
    button.textContent = source.textContent.trim();
    button.disabled = source.disabled;
    button.addEventListener('click', () => {
      if (source.id === 'list-slots-button') {
        source.click();
        const slots = document.getElementById('slot-list');
        if (slots) destination.append(slots);
        return;
      }
      closeDrawer();
      if (source.isConnected) source.click();
      else window.alert('此功能正在載入，請稍後再試。');
    });
    destination.append(button);
  };

  const openDrawer = () => {
    sync();
    closeDrawer();
    const sidebar = aside();
    if (!sidebar) return;
    const backdrop = document.createElement('div');
    backdrop.id = 'bao-chat-tool-drawer';
    const dialog = document.createElement('section');
    dialog.className = 'bao-chat-tool-dialog';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '故事功能選單');
    const head = document.createElement('header');
    const title = document.createElement('h2'); title.textContent = '故事功能';
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '關閉 ×';
    close.addEventListener('click', closeDrawer);
    head.append(title, close);
    dialog.append(head);
    const body = document.createElement('div');
    body.className = 'bao-chat-tool-dialog-body';
    dialog.append(body);
    backdrop.append(dialog);
    backdrop.addEventListener('click', event => { if (event.target === backdrop) closeDrawer(); });

    const scene = sidebar.querySelector('#bao-scene-controls');
    if (scene) {
      const detail = document.createElement('details');
      detail.open = false;
      const summary = document.createElement('summary'); summary.textContent = '◈ 場景顯示與狀態';
      detail.append(summary);
      scene.querySelectorAll('label').forEach(label => {
        const original = label.querySelector('select');
        if (!original) return;
        const mirrorLabel = document.createElement('label');
        mirrorLabel.className = 'bao-chat-tool-select';
        mirrorLabel.append(document.createTextNode(label.firstChild?.textContent?.trim() || '顯示設定'));
        const mirror = original.cloneNode(true);
        mirror.removeAttribute('id');
        mirror.value = original.value;
        mirror.addEventListener('change', () => {
          original.value = mirror.value;
          original.dispatchEvent(new Event('change', { bubbles: true }));
        });
        mirrorLabel.append(mirror);
        detail.append(mirrorLabel);
      });
      const board = window.BAONativeStatusPacks?.board?.();
      if (board) { compactBoard(board); detail.append(board); }
      else if (window.GameState?.current) {
        const status = document.createElement('p');
        status.textContent = `時間：${GameState.current.time || '未設定'}　地點：${GameState.current.location || '未設定'}`;
        detail.append(status);
      }
      body.append(detail);
    }
    for (const [id, label] of groupDefinitions.filter(([name]) => name !== 'scene')) {
      const source = groupBody(sidebar, id);
      if (!source) continue;
      const buttons = [...source.querySelectorAll('button')].filter(button => !button.closest('#slot-list') && !button.closest('#bao-scene-controls'));
      if (!buttons.length) continue;
      const detail = document.createElement('details');
      detail.open = id === 'world';
      const summary = document.createElement('summary'); summary.textContent = label;
      detail.append(summary);
      const items = document.createElement('div'); items.className = 'bao-chat-tool-dialog-actions';
      buttons.forEach(button => proxy(button, items));
      detail.append(items);
      body.append(detail);
    }
    document.body.append(backdrop);
    document.addEventListener('keydown', drawerKeys);
    close.focus();
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalRender(...args);
    watchSidebar();
    schedule();
    return result;
  };
  window.BAOChatToolNavigation = { sync, openDrawer, closeDrawer, compactBoard };
  watchSidebar();
  schedule();
})();