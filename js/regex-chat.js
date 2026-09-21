/* Display-only chat adapter; never mutate Chat.messages, state, saves, prompts, or API payloads. */
(() => {
  'use strict';
  if (!window.BAORegex) return;
  const R = window.BAORegex;
  const signatures = new WeakMap();
  let scheduled = false;
  const setPlainText = (bubble, value) => {
    const lines = value.split('\n');
    const fragment = document.createDocumentFragment();
    lines.forEach((line, index) => {
      if (index) fragment.appendChild(document.createElement('br'));
      fragment.appendChild(document.createTextNode(line));
    });
    bubble.replaceChildren(fragment);
  };
  const render = () => {
    scheduled = false;
    const stream = document.getElementById('chat-stream');
    const records = window.Chat?.messages;
    if (!stream || !Array.isArray(records)) return;
    const nodes = [...stream.children].filter(node => node.classList?.contains('message'));
    const hasGreeting = nodes.length === records.length + 1 && nodes[0]?.classList.contains('assistant') &&
      (nodes[0].dataset.storyGreeting === 'true' || nodes[0].querySelector('.bubble')?.dataset.authoredGreeting === 'true' || records[0]?.role === 'user');
    const shift = hasGreeting ? 1 : 0;
    if (nodes.length !== records.length + shift || !records.every((message, i) =>
      nodes[i + shift]?.classList.contains(message.role === 'user' ? 'user' : 'assistant'))) return;
    const state = R.load();
    const active = state.active && state.rules.some(rule => rule.enabled);
    const stamp = JSON.stringify([active, state.rules]);
    nodes.forEach((node, index) => {
      if (!node.classList.contains('assistant') || node.classList.contains('is-streaming')) return;
      const message = records[index - shift];
      if (message?.role !== 'assistant') return;
      const source = String(message.content ?? '');
      // Rich authored markup and control blocks belong to their existing dedicated renderer.
      if (/<\/?[a-z][\w:-]*[^>]*>/i.test(source) || /\[(?:\/?STATUS|SCENE:|\/?NARRATION|\/?CHOICE)\]/i.test(source)) return;
      const bubble = node.querySelector(':scope > .bubble');
      if (!bubble || bubble.querySelector('.story-inline-editor')) return;
      if ([...bubble.querySelectorAll('*')].some(el => el.tagName !== 'BR')) return;
      const previous = signatures.get(bubble);
      if (!active && !previous) return;
      const signature = `${String(message.id || index)}|${source}|${stamp}`;
      const value = active ? R.apply(source, state.rules) : source;
      const flatValue = value.replace(/\n/g, '');
      // The reader may repaint the same bubble after our first pass. Compare its
      // current content as well as its signature before skipping the regex pass.
      if (previous?.signature === signature && bubble.textContent === flatValue) return;
      signatures.set(bubble, { signature, flatValue });
      setPlainText(bubble, value);
    });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(render);
  };
  const init = () => {
    const nav = document.querySelector('.topbar nav');
    if (nav && !nav.querySelector('[data-bao-regex-link]')) {
      const link = document.createElement('a');
      link.href = 'regex-manager.html';
      link.dataset.baoRegexLink = '1';
      link.textContent = '正則工具';
      nav.append(link);
    }
    const stream = document.getElementById('chat-stream');
    if (!stream) return;
    new MutationObserver(schedule).observe(stream, { childList: true, subtree: true, characterData: true });
    window.addEventListener('storage', event => { if (event.key === R.KEY) schedule(); });
    window.addEventListener('focus', schedule);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.BAORegexChat = { render, schedule };

  // Keep the legacy plain-text regex path intact. Load the author sandbox only
  // after its independent parsing core is available; it never touches chat DOM.
  const core = document.createElement('script');
  core.src = 'js/author-regex-core.js';
  core.onload = () => {
    if (document.querySelector('script[src="js/author-regex-compat.js"]')) return;
    const compat = document.createElement('script');
    compat.src = 'js/author-regex-compat.js';
    compat.onerror = () => console.warn('BAO/LAB author regex compatibility failed to load');
    document.head.appendChild(compat);
  };
  core.onerror = () => console.warn('BAO/LAB author regex core failed to load');
  document.head.appendChild(core);
})();