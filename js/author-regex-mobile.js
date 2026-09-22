/* Progressive disclosure for author regex settings and optional visual tools. */
(() => {
  'use strict';
  const load = () => {
    for (const src of ['js/chat-ui-simplify.js', 'js/story-entry-visibility.js']) {
      if (document.querySelector(`script[src="${src}"]`)) continue;
      const script = document.createElement('script');
      script.src = src;
      script.onerror = () => console.warn('BAO/LAB compact UI module could not load:', src);
      document.head.append(script);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load, { once: true });
  else load();
})();
