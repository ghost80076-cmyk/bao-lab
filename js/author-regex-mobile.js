/* Load presentation-only chat refinements after the author tools initialize. */
(() => {
  'use strict';
  const load = () => {
    const stylesheet = 'css/chat-desktop-reading.css';
    if (!document.querySelector(`link[href="${stylesheet}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = stylesheet;
      document.head.append(link);
    }
    for (const src of ['js/chat-ui-simplify.js', 'js/story-entry-visibility.js', 'js/chat-controls-clarity.js']) {
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
