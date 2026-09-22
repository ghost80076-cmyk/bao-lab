/* Progressive disclosure on phones only; do not alter regex rules, stories or API calls. */
(() => {
  'use strict';
  if (window.BAOChatUISimplify) return;
  const mobile = matchMedia('(max-width: 820px)');
  const choices = new Map();
  const seenDocks = new WeakSet();
  let queued = false;
  const aside = () => document.querySelector('#chat-view .chat-layout > aside');
  const settings = () => aside()?.querySelector('[data-chat-tool-body="settings"]');
  const panel = () => document.getElementById('bao-author-regex-panel');
  const storage = () => {
    let host = document.getElementById('bao-author-settings-storage');
    if (!host) {
      host = document.createElement('div');
      host.id = 'bao-author-settings-storage';
      host.hidden = true;
      document.body.append(host);
    }
    return host;
  };
  const close = () => {
    const overlay = document.getElementById('bao-author-settings-dialog');
    if (!overlay) return;
    const editor = panel();
    if (editor && overlay.contains(editor)) {
      editor.open = false;
      (mobile.matches ? storage() : aside())?.append(editor);
    }
    overlay.remove();
  };
  const open = () => {
    const editor = panel();
    if (!editor) return;
    close();
    window.BAOChatToolNavigation?.closeDrawer?.();
    const overlay = document.createElement('div');
    overlay.id = 'bao-author-settings-dialog';
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
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '關閉 ×';
    dismiss.addEventListener('click', close);
    header.append(title, dismiss);
    dialog.append(header);
    editor.open = true;
    editor.style.maxWidth = '100%';
    editor.style.margin = '12px 0 0';
    dialog.append(editor);
    overlay.append(dialog);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    overlay.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    document.body.append(overlay);
    dismiss.focus();
  };
  const author = () => {
    const editor = panel();
    if (!editor) return;
    const summary = editor.querySelector(':scope > summary');
    if (summary) {
      summary.textContent = '自訂排版與互動（正則）';
      summary.title = '進階功能：匯入或啟用角色卡作者提供的排版與互動規則';
    }
    if (!mobile.matches) {
      close();
      if (editor.parentElement !== aside()) aside()?.append(editor);
      document.getElementById('bao-author-settings-open')?.remove();
      return;
    }
    if (!editor.closest('#bao-author-settings-dialog') && editor.parentElement !== storage()) {
      editor.open = false;
      storage().append(editor);
    }
    const host = settings() || aside();
    let trigger = aside()?.querySelector('#bao-author-settings-open');
    if (!trigger && host) {
      trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.id = 'bao-author-settings-open';
      trigger.className = 'secondary';
      trigger.textContent = '角色卡自訂介面（進階）';
      trigger.title = '管理作者排版與互動規則；一般聊天不需要設定';
      trigger.addEventListener('click', open);
      host.append(trigger);
    } else if (trigger && host && trigger.parentElement !== host) host.append(trigger);
  };
  const image = () => {
    const trigger = aside()?.querySelector('[data-bao-image-prompt]');
    if (!trigger) return;
    trigger.textContent = '配圖工具（提示詞）';
    trigger.title = '需要為當前故事製作圖片時使用；平常聊天不需要開啟';
    const host = mobile.matches && settings();
    if (host && trigger.parentElement !== host) host.append(trigger);
  };
  const dock = () => {
    const root = document.getElementById('bao-author-dock');
    if (!root || seenDocks.has(root)) return;
    seenDocks.add(root);
    const owner = String(window.App?.activeCharacter?.id || '');
    const summary = root.querySelector(':scope > summary');
    if (summary) {
      summary.textContent = summary.textContent.replace(/^常駐作者介面/, '故事互動面板').replace('正則排版', '自訂排版');
      summary.title = '點此展開或收起作者設計的互動介面';
    }
    if (mobile.matches) root.open = choices.get(owner) === true;
    root.addEventListener('toggle', () => { if (mobile.matches) choices.set(owner, root.open); });
  };
  const sync = () => {
    queued = false;
    author();
    image();
    dock();
    const link = document.querySelector('.topbar nav [data-bao-regex-link]');
    if (link) { link.textContent = '排版工具'; link.title = '進階：文字替換與正則規則'; }
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  };
  const init = () => {
    const sidebar = aside();
    if (sidebar) new MutationObserver(schedule).observe(sidebar, { childList: true, subtree: true });
    const main = document.querySelector('#chat-view .chat-main');
    if (main) new MutationObserver(mutations => {
      if (mutations.some(record => [...record.addedNodes].some(node => node.nodeType === 1 &&
        (node.id === 'bao-author-dock' || node.querySelector?.('#bao-author-dock'))))) schedule();
    }).observe(main, { childList: true, subtree: true });
    mobile.addEventListener?.('change', schedule);
    window.BAOChatUISimplify = Object.freeze({ sync, openAuthorSettings: open, closeAuthorSettings: close });
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
