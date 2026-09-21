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
    const hasGreeting = nodes.length > records.length && nodes[0]?.classList.contains('assistant') && records[0]?.role === 'user';
    const shift = hasGreeting ? 1 : 0;
    const state = R.load();
    const stamp = JSON.stringify([state.active, state.rules]);
    nodes.forEach((node, index) => {
      if (!node.classList.contains('assistant')) return;
      const message = records[index - shift];
      if (message?.role !== 'assistant') return;
      const bubble = node.querySelector(':scope > .bubble');
      if (!bubble) return;
      // Do not interfere with existing HTML/Markdown/status renderers.
      if ([...bubble.querySelectorAll('*')].some(el => el.tagName !== 'BR')) return;
      const signature = `${String(message.id || index)}|${message.content}|${stamp}`;
      if (signatures.get(bubble) === signature) return;
      signatures.set(bubble, signature);
      const value = state.active ? R.apply(message.content, state.rules) : String(message.content ?? '');
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
})();