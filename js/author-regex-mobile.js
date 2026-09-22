/* Keep optional regex settings outside the mobile story column. */
(() => {
  'use strict';
  const mobile = matchMedia('(max-width: 820px)');
  const place = () => {
    const panel = document.getElementById('bao-author-regex-panel');
    const aside = document.querySelector('#chat-view aside');
    if (!panel || !aside) return;
    if (panel.parentElement !== aside) aside.append(panel);
    panel.style.position = '';
    panel.style.inset = '';
    panel.style.width = '';
    panel.style.maxHeight = '';
    panel.style.overflowY = '';
    panel.style.zIndex = '';
    panel.style.background = '';
    panel.style.flexShrink = '';
    panel.style.display = mobile.matches ? 'none' : '';
  };
  const init = () => {
    place();
    mobile.addEventListener?.('change', place);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
