/* Place only the author regex controls in the visible chat area on small screens. */
(() => {
  'use strict';
  const mobile = matchMedia('(max-width: 820px)');
  const place = () => {
    const panel = document.getElementById('bao-author-regex-panel');
    const main = document.querySelector('#chat-view .chat-main');
    const aside = document.querySelector('#chat-view aside');
    if (!panel || !main || !aside) return;
    const target = mobile.matches ? main : aside;
    if (panel.parentElement !== target) {
      if (target === main) main.insertBefore(panel, main.querySelector('.usage-bar') || main.lastElementChild);
      else target.appendChild(panel);
    }
    const expanded = mobile.matches && panel.open;
    panel.style.position = expanded ? 'fixed' : '';
    panel.style.inset = expanded ? '6vh 3vw' : '';
    panel.style.width = expanded ? '94vw' : '';
    panel.style.maxHeight = expanded ? '88vh' : '';
    panel.style.overflowY = expanded ? 'auto' : '';
    panel.style.zIndex = expanded ? '2147482000' : '';
    panel.style.background = expanded ? '#171723' : '';
    panel.style.flexShrink = '0';
  };
  const init = () => {
    place();
    document.getElementById('bao-author-regex-panel')?.addEventListener('toggle', place);
    mobile.addEventListener?.('change', place);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
