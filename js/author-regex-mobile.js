/* Keep low-frequency tools available without occupying the mobile reading area. */
(() => {
  'use strict';
  const mobile = matchMedia('(max-width: 820px)');
  const chat = document.getElementById('chat-view');
  const aside = chat?.querySelector('.chat-layout > aside');
  if (!chat || !aside) return;
  let overlay = null;
  let launcher = null;
  let queued = false;
  const panel = () => document.getElementById('bao-author-regex-panel');
  const group = () => aside.querySelector('[data-chat-tool-body="settings"]');

  function close() {
    if (!overlay) return;
    const current = panel();
    if (current) {
      current.open = false;
      aside.append(current);
      current.style.display = mobile.matches ? 'none' : '';
    }
    overlay.remove();
    overlay = null;
    document.removeEventListener('keydown', onKeydown);
    launcher?.focus();
  }
  function onKeydown(event) {
    if (event.key === 'Escape') close();
  }
  function open() {
    const current = panel();
    if (!current || overlay || !chat.classList.contains('active')) return;
    window.BAOChatToolNavigation?.closeDrawer?.();
    if (!mobile.matches) {
      current.open = true;
      current.scrollIntoView({ block: 'nearest' });
      return;
    }
    overlay = document.createElement('div');
    overlay.id = 'bao-author-settings-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147482000;background:#000c;display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
    const dialog = document.createElement('section');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '顯示與排版設定');
    dialog.style.cssText = 'width:min(680px,100%);max-height:92dvh;overflow:auto;background:#171723;color:#fff;border-radius:12px;padding:12px;box-sizing:border-box';
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = '關閉設定 ×';
    dismiss.addEventListener('click', close);
    current.open = true;
    current.style.display = 'block';
    dialog.append(dismiss, current);
    overlay.append(dialog);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.body.append(overlay);
    document.addEventListener('keydown', onKeydown);
    dismiss.focus();
  }
  function sync() {
    queued = false;
    if (overlay && (!mobile.matches || !chat.classList.contains('active'))) close();
    const current = panel();
    if (current && !overlay) {
      if (current.parentElement !== aside) aside.append(current);
      const display = mobile.matches ? 'none' : '';
      if (current.style.display !== display) current.style.display = display;
    }
    const settings = group();
    if (!settings) return;
    if (current) {
      if (!launcher) {
        launcher = document.createElement('button');
        launcher.id = 'bao-author-settings-launcher';
        launcher.type = 'button';
        launcher.textContent = '顯示與排版（作者正則）';
        launcher.title = '進階：管理角色卡提供的自訂顯示效果';
        launcher.addEventListener('click', open);
      }
      if (launcher.parentElement !== settings) settings.append(launcher);
      launcher.hidden = !mobile.matches;
    }
    const image = chat.querySelector('[data-bao-image-prompt]');
    if (image) {
      let images = settings.querySelector('#bao-chat-image-tools');
      if (!images) {
        images = document.createElement('details');
        images.id = 'bao-chat-image-tools';
        const summary = document.createElement('summary');
        summary.textContent = '圖像工具';
        images.append(summary);
        settings.append(images);
      }
      if (image.parentElement !== images) images.append(image);
      if (image.textContent !== '製作圖片提示詞') image.textContent = '製作圖片提示詞';
    }
  }
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(sync);
  }
  function init() {
    sync();
    new MutationObserver(schedule).observe(chat, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    mobile.addEventListener?.('change', schedule);
  }
  window.BAOAdvancedToolPlacement = { open, close, sync: schedule };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
