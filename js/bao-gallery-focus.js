/* Quiet discovery surface: move existing secondary controls; never replace their handlers. */
(() => {
  'use strict';
  if (window.BAOGalleryFocus) return;
  const root = document.getElementById('explore-view');
  if (!root) return;
  // Each proposal layer loads in order, after the original BAO/LAB brand CSS.
  for (const stylesheet of ['css/bao-editorial-polish.css?v=2', 'css/bao-editorial-cinema.css?v=7']) {
    if (document.querySelector(`link[href="${stylesheet}"]`)) continue;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = stylesheet;
    document.head.appendChild(link);
  }
  const sync = () => {
    const tools = root.querySelector('.character-tools');
    if (!tools) return;
    let more = tools.querySelector(':scope > details.bao-gallery-more');
    if (!more) {
      more = document.createElement('details');
      more.className = 'bao-gallery-more';
      const summary = document.createElement('summary');
      summary.textContent = '管理與匯入 · 更多工具';
      summary.setAttribute('aria-label', '展開管理與匯入等更多角色工具');
      const body = document.createElement('div');
      body.className = 'bao-gallery-more-body';
      more.append(summary, body);
      tools.append(more);
    }
    const body = more.querySelector('.bao-gallery-more-body');
    // Keep creation and both downloadable templates discoverable without opening the drawer.
    // Everything else (including file picker, messages and local-character manager) is moved intact.
    [...tools.children].forEach(node => {
      if (node === more || node.matches?.('a[href="character-studio.html"],a[download]')) return;
      if (node.parentElement !== body) body.append(node);
    });
  };
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; sync(); });
  };
  new MutationObserver(records => {
    if (records.some(record => record.target.matches?.('.character-tools') ||
      [...record.addedNodes].some(node => node.nodeType === 1 &&
        (node.matches?.('.character-tools') || node.querySelector?.('.character-tools'))))) schedule();
  }).observe(root, { childList: true, subtree: true });
  window.BAOGalleryFocus = Object.freeze({ sync });
  schedule();
})();
