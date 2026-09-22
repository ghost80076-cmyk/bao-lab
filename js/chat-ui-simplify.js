/* Presentation-only progressive disclosure. Keep author rules, story data and API handlers intact. */
(() => {
  'use strict';
  if (window.BAOChatUISimplify) return;
  const mobile = matchMedia('(max-width: 820px)');
  const panelId = 'bao-author-regex-panel';
  const storageId = 'bao-author-settings-storage';
  const dialogId = 'bao-author-settings-dialog';
  let scheduled = false;
  let sidebarObserver;
  const dockChoices = new Map();
  const seenDocks = new WeakSet();
  const aside = () => document.querySelector('#chat-view .chat-layout > aside');
  const settings = () => aside()?.querySelector('[data-chat-tool-body="settings"]');
  const panel = () => document.getElementById(panelId);
  const storage = () => {
    let host = document.getElementById(storageId);
    if (!host) {
      host = document.createElement('div');
      host.id = storageId;
      host.hidden = true;
      document.body.append(host);
    }
    return host;
  };
  const closeDialog = () => {
    const overlay = document.getElementById(dialogId);
    if (!overlay) return;
    const editor = panel();
    if (editor && overlay.contains(editor)) {
      editor.open = false;
      storage().append(editor);
    }
    overlay.remove();
    schedule();
  };
  const openDialog = () => {
    const editor = panel();
    if (!editor) return;
    closeDialog();
    const overlay = document.createElement('div');
    overlay.id = dialogId;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147482900;background:#000b;display:grid;place-items:center;padding:12px;box-sizing:border-box';
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '角色卡自訂介面設定');
    dialog.style.cssText = 'width:min(740px,100%);max-height:90dvh;overflow-y:auto;background:#171723;color:#fff;border:1px solid #987a9c;border-radius:14px;padding:14px;box-sizing:border-box';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px';
    const title = document.createElement('strong');
    title.textContent = '角色卡自訂介面 · 進階設定';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '關閉 ×';
    close.addEventListener('click', closeDialog);
    header.append(title, close);
    dialog.append(header);
    editor.open = true;
    editor.style.maxWidth = '100%';
    editor.style.margin = '12px 0 0';
    dialog.append(editor);
    overlay.append(dialog);
    overlay.addEventListener('click', event => { if (event.target === overlay) closeDialog(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') closeDialog(); });
    document.body.append(overlay);
    close.focus();
  };
  const placeAuthorSettings = () => {
    const editor = panel();
    if (!editor) return;
    const summary = editor.querySelector(':scope > summary');
    if (summary) {
      summary.textContent = '自訂排版與互動（正則）';
      summary.title = '進階功能：匯入或啟用角色卡作者提供的排版與互動規則';
    }
    if (!editor.closest('#' + dialogId) && editor.parentElement !== storage()) {
      editor.open = false;
      storage().append(editor);
    }
    const host = settings() || aside();
    if (host && !host.querySelector('#bao-author-settings-open')) {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = 'bao-author-settings-open';
      trigger.className = 'secondary';
      trigger.textContent = '角色卡自訂介面（進階）';
      trigger.title = '管理作者排版與互動規則；一般聊天不需要設定';
      trigger.addEventListener('click', () => {
        window.BAOChatToolNavigation?.closeDrawer?.();
        openDialog();
      });
      host.append(trigger);
    }
    const trigger = aside()?.querySelector('#bao-author-settings-open');
    if (trigger && host && trigger.parentElement !== host) host.append(trigger);
  };
  const placeImageTool = () => {
    const trigger = aside()?.querySelector('[data-bao-image-prompt]');
    if (!trigger) return;
    trigger.textContent = '配圖工具（提示詞）';
    trigger.title = '需要為當前故事製作圖片時使用；平常聊天不需要開啟';
    const host = settings();
    if (host && trigger.parentElement !== host) host.append(trigger);
  };
  const compactDock = () => {
    const root = document.getElementById('bao-author-dock');
    if (!root || seenDocks.has(root)) return;
    seenDocks.add(root);
    const owner = String(window.App?.activeCharacter?.id || '');
    const summary = root.querySelector(':scope > summary');
    if (summary) {
      summary.textContent = summary.textContent.replace(/^常駐作者介面/, '故事互動面板').replace('正則排版', '自訂排版');
      summary.title = '點此展開或收起作者設計的互動介面';
    }
    if (mobile.matches) root.open = dockChoices.get(owner) === true;
    root.addEventListener('toggle', () => {
      // The native details control remains available at all times.
      if (mobile.matches) dockChoices.set(owner, root.open);
    });
  };
  const renameNavigation = () => {
    const link = document.querySelector('.topbar nav [data-bao-regex-link]');
    if (link) {
      link.textContent = '排版工具';
      link.title = '進階：文字替換與正則規則';
    }
  };
  const sync = () => {
    scheduled = false;
    placeAuthorSettings();
    placeImageTool();
    compactDock();
    renameNavigation();
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(sync);
  };
  const init = () => {
    const sidebar = aside();
    if (sidebar) {
      sidebarObserver = new MutationObserver(schedule);
      sidebarObserver.observe(sidebar, { childList: true, subtree: true });
    }
    const main = document.querySelector('#chat-view .chat-main');
    if (main) {
      new MutationObserver(mutations => {
        if (mutations.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
          (node.id === 'bao-author-dock' || node.querySelector?.('#bao-author-dock'))))) schedule();
      }).observe(main, { childList: true, subtree: true });
    }
    mobile.addEventListener?.('change', schedule);
    document.addEventListener('click', event => {
      if (event.target?.closest?.('#bao-chat-tool-drawer .bao-chat-tool-proxy')) queueMicrotask(schedule);
    });
    window.BAOChatUISimplify = Object.freeze({ sync, openAuthorSettings: openDialog, closeAuthorSettings: closeDialog });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
