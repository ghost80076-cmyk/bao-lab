/* Progressive disclosure for author regex settings and optional visual tools. */
(() => {
  'use strict';
  const load = () => {
    if (document.querySelector('script[src="js/chat-ui-simplify.js"]')) return;
    const script = document.createElement('script');
    script.src = 'js/chat-ui-simplify.js';
    script.onerror = () => console.warn('BAO/LAB advanced chat settings could not load');
    document.head.append(script);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
