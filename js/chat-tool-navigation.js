/* Group existing chat controls without replacing their event handlers. */
(() => {
  'use strict';
  if (window.BAOChatToolNavigation || !window.App) return;

  const aside = () => document.querySelector('#chat-view .chat-layout > aside');
  const expanded = new Map();
  const nativeExpanded = new Map();
  // Group tools by what the player wants to do, not by underlying modules.
  const groupDefinitions = [
    ['scene', '◈ 此刻與顯示'],
    ['story', '▤ 故事與存檔'],
    ['world', '◇ 人物與世界'],
    ['settings', '⚙ 故事體驗與 AI'],
    ['other', '其他與支援']
  ];
  const defaultExpanded = () => window.YoruExperienceCore?.expandedGroups(
    window.YoruExperience?.get?.().level || 'easy'
  ) || ['story'];
  let scheduled = false;
  let watcher = null;
  let watchedAside = null;

  const addStyle = () => {
    if (document.querySelector('link[href^="css/chat-tool-navigation.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/chat-tool-navigation.css?v=3';
    document.head.append(link);
  };
  const groupBody = (root, id) => root.querySelector(`[data-chat-tool-body="${id}"]`);
  const ensureGroup = (root, id, title) => {
    let detail = root.querySelector(`[data-chat-tool-group="${id}"]`);
    if (detail) return detail;
    detail = document.createElement('details');
    detail.dataset.chatToolGroup = id;
    detail.open = expanded.has(id) ? expanded.get(id) : defaultExpanded().includes(id);
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
    // Worldbooks contain story lore, not support links: keep their existing
    // button and click handler together with the other world tools.
    move(sidebar.querySelector('[data-open-worldbook-library]'), targets.world);
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
    const help = window.BAOFeatureHelp?.button?.('tools');
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '關閉 ×';
    close.addEventListener('click', closeDrawer);
    const appearance = document.createElement('button');
    appearance.type = 'button';
    appearance.className = 'yoru-tool-appearance';
    appearance.textContent = '◐ 外觀與操作';
    appearance.addEventListener('click', () => {
      closeDrawer();
      window.YoruExperience?.open?.();
    });
    head.append(title);
    if (help) head.append(help);
    head.append(appearance, close);
    dialog.append(head);
    const body = document.createElement('div');
    body.className = 'bao-chat-tool-dialog-body';
    const introduction = document.createElement('p');
    introduction.className = 'yoru-tool-intro';
    const level = window.YoruExperience?.get?.().level || 'easy';
    introduction.textContent = level === 'pro'
      ? '完整工具都在這裡；想減少選項，可在「外觀與操作」切回輕鬆模式。'
      : level === 'standard'
        ? '故事與人物工具已展開。更多設定可視需要開啟。'
        : '先玩故事就好。常用工具放在前面，其餘功能需要時再展開。';
    body.append(introduction);
    const quick = document.createElement('div');
    quick.className = 'yoru-tool-actions';
    const quickAction = (label, handler) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => { closeDrawer(); handler(); });
      quick.append(button);
    };
    quickAction('人物與故事資訊', () => window.BAOStorySurface?.openStatus?.());
    if (window.BAOConversationSearch?.open) {
      quickAction('搜尋對話', () => window.BAOConversationSearch.open());
    }
    body.append(quick);
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
      detail.open = defaultExpanded().includes(id);
      const summary = document.createElement('summary'); summary.textContent = label;
      detail.append(summary);
      const items = document.createElement('div'); items.className = 'bao-chat-tool-dialog-actions';
      buttons.forEach(button => proxy(button, items));
      detail.append(items);
      body.append(detail);
    }
    // Filter the existing actions in place. Never clone tool state, APIs or
    // handlers; the mobile module may inject its own quick actions afterward.
    const searchWrap = document.createElement('label');
    searchWrap.className = 'bao-tool-search';
    const searchCaption = document.createElement('span');
    searchCaption.textContent = '找工具';
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'bao-tool-search';
    searchInput.autocomplete = 'off';
    searchInput.placeholder = '搜尋存檔、記憶、模型、世界書…';
    searchInput.setAttribute('aria-label', '搜尋故事工具');
    searchWrap.append(searchCaption, searchInput);
    body.prepend(searchWrap);
    const searchEmpty = document.createElement('p');
    searchEmpty.className = 'bao-tool-search-empty';
    searchEmpty.textContent = '找不到相符工具。可以換個關鍵字，或清除搜尋查看全部。';
    searchEmpty.setAttribute('role', 'status');
    searchEmpty.hidden = true;
    body.append(searchEmpty);
    const groupOpenBefore = new Map();
    let mobileMoreOpenBefore = null;
    const filterTools = () => {
      const q = searchInput.value.trim().toLocaleLowerCase();
      const groups = [...body.children].filter(node => node.tagName === 'DETAILS');
      const mobile = body.querySelector('.bao-mobile-quick');
      const extra = mobile?.querySelector('.bao-mobile-more');
      if (q) {
        groups.forEach(group => {
          if (!groupOpenBefore.has(group)) groupOpenBefore.set(group, group.open);
        });
        if (extra && mobileMoreOpenBefore === null) mobileMoreOpenBefore = extra.open;
      }
      let found = 0;
      const matches = value => String(value || '').toLocaleLowerCase().includes(q);
      for (const group of groups) {
        const titleMatch = matches(group.querySelector(':scope > summary')?.textContent);
        const actions = [...group.querySelectorAll('.bao-chat-tool-proxy')];
        let visible = 0;
        actions.forEach(action => {
          const show = !q || titleMatch || matches(action.textContent);
          action.hidden = !show;
          if (show) visible++;
        });
        const contentMatch = actions.length === 0 && matches(group.textContent);
        const showGroup = !q || titleMatch || contentMatch || visible > 0;
        group.hidden = !showGroup;
        if (q && showGroup) group.open = true;
        if (!q && groupOpenBefore.has(group)) group.open = groupOpenBefore.get(group);
        if (q && showGroup) found++;
      }
      if (!q) groupOpenBefore.clear();
      const standalone = [...body.querySelectorAll('.yoru-tool-actions > button')];
      standalone.forEach(button => {
        const show = !q || matches(button.textContent);
        button.hidden = !show;
        if (q && show) found++;
      });
      const standaloneHost = body.querySelector('.yoru-tool-actions');
      if (standaloneHost) standaloneHost.hidden = !!q && !standalone.some(button => !button.hidden);
      if (mobile) {
        const buttons = [...mobile.querySelectorAll('button, a.bao-mobile-support-link')];
        buttons.forEach(button => {
          const show = !q || matches(button.textContent);
          button.hidden = !show;
          if (q && show) found++;
        });
        const extraActions = [...(extra?.querySelectorAll('button, a.bao-mobile-support-link') || [])];
        if (extra) {
          const extraMatches = extraActions.some(button => !button.hidden);
          extra.hidden = !!q && !extraMatches;
          if (q && extraMatches) extra.open = true;
          if (!q && mobileMoreOpenBefore !== null) extra.open = mobileMoreOpenBefore;
        }
        const mobileShown = buttons.some(button => !button.hidden);
        mobile.hidden = !!q && !mobileShown;
        const connection = mobile.querySelector(':scope > small');
        if (connection) connection.hidden = !!q;
      }
      if (!q) mobileMoreOpenBefore = null;
      searchEmpty.hidden = !q || found > 0;
    };
    searchInput.addEventListener('input', filterTools);
    document.body.append(backdrop);
    document.addEventListener('keydown', drawerKeys);
    close.focus();
  };

  window.addEventListener('yoru:experience-change', () => {
    expanded.clear();
    const defaults = defaultExpanded();
    document.querySelectorAll('#bao-chat-tool-groups > details[data-chat-tool-group]').forEach(group => {
      group.open = defaults.includes(group.dataset.chatToolGroup);
    });
    // Reopen on demand instead of leaving a drawer in a stale layout.
    if (document.getElementById('bao-chat-tool-drawer')) {
      closeDrawer();
      openDrawer();
    }
  });

  const toolNavigationShellWrapper = function(next, ...args) {
    const result = next(...args);
    watchSidebar();
    schedule();
    return result;
  };
  if (typeof App.wrapRenderChatShell === "function") {
    App.wrapRenderChatShell("chat-tool-navigation:sync", toolNavigationShellWrapper);
  } else {
    // Compatibility fallback for a mixed-cache page where chat-tool-navigation is newer than app.js.
    const originalRender = App.renderChatShell.bind(App);
    App.renderChatShell = (...args) => toolNavigationShellWrapper.call(App, originalRender, ...args);
  }
  window.BAOChatToolNavigation = { sync, openDrawer, closeDrawer, compactBoard };
  watchSidebar();
  schedule();
})();