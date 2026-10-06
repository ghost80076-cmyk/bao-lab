(() => {
  const DISMISS_KEY = 'yorubay:pwa-install-dismissed-at';
  const DISMISS_DAYS = 7;
  const PROMPT_DELAY = 1800;
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const recentlyDismissed = () => {
    const value = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return value && Date.now() - value < DISMISS_DAYS * 86400000;
  };

  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isSafari = () => /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios|chrome|android/i.test(navigator.userAgent);
  const isHomeVisible = () => document.querySelector('#home-view.view.active, #home-view.active') !== null;

  const removePrompt = () => document.getElementById('yorubay-install-prompt')?.remove();

  const fallbackCopy = () => {
    if (isIOS()) {
      return isSafari()
        ? '點 Safari 的分享按鈕，再選「加入主畫面」。'
        : '若沒有直接安裝按鈕，請用 Safari 開啟夜灣，再從分享選單選「加入主畫面」。';
    }
    return '瀏覽器若沒有跳出安裝視窗，可從瀏覽器選單選「安裝應用程式」或「加到主畫面」。';
  };

  const renderPrompt = ({ fallback = false } = {}) => {
    if (isStandalone() || recentlyDismissed() || document.getElementById('yorubay-install-prompt')) return;
    if (!deferredPrompt && !fallback) return;
    // The fallback is an onboarding hint, not a modal that should interrupt someone
    // who has already opened Explore, setup, or a story.
    if (fallback && !isHomeVisible()) return;

    const nativeInstall = Boolean(deferredPrompt);
    const el = document.createElement('aside');
    el.id = 'yorubay-install-prompt';
    el.className = 'yorubay-install-prompt';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '安裝夜灣');
    el.innerHTML = `
      <img src="assets/bao-mark.svg" width="42" height="42" alt="">
      <div class="yorubay-install-copy">
        <strong>把夜灣留在主畫面</strong>
        <span>${nativeInstall ? '下次想回到故事時，不必再尋找網址。' : fallbackCopy()}</span>
      </div>
      <div class="yorubay-install-actions">
        <button type="button" class="yorubay-install-later">稍後再說</button>
        ${nativeInstall ? '<button type="button" class="yorubay-install-now">安裝夜灣</button>' : '<button type="button" class="yorubay-install-ok">知道了</button>'}
      </div>`;

    el.querySelector('.yorubay-install-later').addEventListener('click', () => {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
      removePrompt();
    });

    el.querySelector('.yorubay-install-now')?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      removePrompt();
    });

    el.querySelector('.yorubay-install-ok')?.addEventListener('click', removePrompt);
    document.body.appendChild(el);
  };

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    window.setTimeout(() => renderPrompt(), PROMPT_DELAY);
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    localStorage.removeItem(DISMISS_KEY);
    removePrompt();
  });

  window.addEventListener('load', () => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    window.setTimeout(() => {
      if (!deferredPrompt) renderPrompt({ fallback: true });
    }, PROMPT_DELAY + 700);
  });
})();
