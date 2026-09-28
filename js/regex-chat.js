/* Display-only chat adapter; never mutate Chat.messages, state, saves, prompts, or API payloads. */
(() => {
  'use strict';
  if (!window.BAORegex) return;
  const R = window.BAORegex;
  const AUTHOR_PREFIX = 'bao-lab:author-regex:v1:';
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
    const authorId = String(window.App?.activeCharacter?.id || '').slice(0, 80);
    let authorRules = [];
    try {
      const Core = window.BAOAuthorRegexCore;
      const saved = authorId ? JSON.parse(localStorage.getItem(AUTHOR_PREFIX + encodeURIComponent(authorId)) || 'null') : null;
      if (Core && saved?.enabled === true && Array.isArray(saved.rules)) {
        const normalized = Core.normalize(saved.rules).filter(rule => rule.enabled && !rule.reason);
        // Rich author packs keep using the isolated iframe renderer. Pure text packs
        // can safely apply to every assistant bubble without touching Chat.messages.
        if (!normalized.some(rule => rule.rich)) authorRules = normalized;
      }
    } catch (_) { authorRules = []; }
    const authorActive = authorRules.length > 0;
    const stamp = JSON.stringify([active, state.rules, authorId, authorRules]);
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
      if (!active && !authorActive && !previous) return;
      const signature = `${String(message.id || index)}|${source}|${stamp}`;
      let value = source;
      if (authorActive) {
        const rendered = window.BAOAuthorRegexCore.render(value, authorRules, false);
        if (rendered?.matched && !rendered.rich) value = rendered.text;
      }
      // Player-global plain rules run last, so the player's own display preference
      // can override a card-scoped author MOD without changing the story.
      if (active) value = R.apply(value, state.rules);
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
      window.addEventListener('storage', event => {
      if (event.key === R.KEY || event.key?.startsWith(AUTHOR_PREFIX)) schedule();
    });
    window.addEventListener('bao:author-regex-changed', schedule);
    window.addEventListener('focus', schedule);
    schedule();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  window.BAORegexChat = { render, schedule };

  // Keep the legacy plain-text regex path intact and load the author modules in order.
  const core = document.createElement('script');
  core.src = 'js/author-regex-core.js';
  core.onload = () => {
    window.BAORegexChat?.schedule?.();
    if (document.querySelector('script[src="js/author-regex-compat.js"]')) return;
    const compat = document.createElement('script');
    compat.src = 'js/author-regex-compat.js';
    compat.onload = () => {
      if (!document.querySelector('script[src="js/author-regex-studio.js"]')) {
        const studio = document.createElement('script');
        studio.src = 'js/author-regex-studio.js';
        studio.onerror = () => console.warn('BAO/LAB author Regex MOD studio failed to load');
        document.head.appendChild(studio);
      }
      const mobile = document.createElement('script');
      mobile.src = 'js/author-regex-mobile.js';
      mobile.onerror = () => console.warn('BAO/LAB responsive author controls failed to load');
      document.head.appendChild(mobile);
      const style = document.createElement('style');
      style.textContent = '.bao-author-inline iframe[hidden]{display:none!important}';
      document.head.appendChild(style);
      const cardBind = document.createElement('script');
      cardBind.src = 'js/author-regex-card-bind.js';
      cardBind.onload = () => {
        const inline = document.createElement('script');
        inline.src = 'js/author-regex-inline.js';
        inline.onload = () => {
          const dock = document.createElement('script');
          dock.src = 'js/author-regex-dock.js';
          dock.onerror = () => console.warn('BAO/LAB persistent author interface failed to load');
          document.head.appendChild(dock);
        };
        inline.onerror = () => console.warn('BAO/LAB inline author interface failed to load');
        document.head.appendChild(inline);
      };
      cardBind.onerror = () => console.warn('BAO/LAB imported-card regex could not be linked');
      document.head.appendChild(cardBind);
    };
    compat.onerror = () => console.warn('BAO/LAB author regex compatibility failed to load');
    document.head.appendChild(compat);
  };
  core.onerror = () => console.warn('BAO/LAB author regex core failed to load');
  document.head.appendChild(core);
})();
