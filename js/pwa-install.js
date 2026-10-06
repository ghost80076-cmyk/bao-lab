(() => {
  const DISMISS_KEY = 'yorubay:pwa-install-dismissed-at';
  const DISMISS_DAYS = 7;
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const recentlyDismissed = () => {
    const value = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return value && Date.now() - value < DISMISS_DAYS * 86400000;
  };

  const removePrompt = () => document.getElementById('yorubay-install-prompt')?.remove();

  const renderPrompt = () => {
    if (!deferredPrompt || isStandalone() || recentlyDismissed() || document.getElementById('yorubay-install-prompt')) return;

    const el = document.createElement('aside');
    el.id = 'yorubay-install-prompt';
    el.className = 'yorubay-install-prompt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '安裝夜灣');
    el.innerHTML = `
      <img src="assets/bao-mark.svg" width="42" height="42" alt="">
      <div class="yorubay-install-copy">
        <strong>把夜灣留在桌面上</strong>
        <span>下次想回到故事時，不必再尋找網址。</span>
      </div>
      <div class="yorubay-install-actions">
        <button type="button" class="yorubay-install-later">稍後再說</button>
        <button type="button" class="yorubay-install-now">安裝夜灣</button>
      </div>`;

    el.querySelector('.yorubay-install-later').addEventListener('click', () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      removePrompt();
    });

    el.querySelector('.yorubay-install-now').addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      removePrompt();
    });

    document.body.appendChild(el);
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    window.setTimeout(renderPrompt, 1800);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    localStorage.removeItem(DISMISS_KEY);
    removePrompt();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
  }
})();
