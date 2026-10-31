/* Display-only chat adapter; never mutate Chat.messages, state, saves, prompts, or API payloads. */
(() => {
  'use strict';
  if (!window.BAORegex) return;
  const R = window.BAORegex;
  const AUTHOR_PREFIX = 'bao-lab:author-regex:v1:';
  const signatures = new WeakMap();
  const pending = new WeakMap();
  const queue = [];
  const WORKER_URL = new URL('regex-chat-worker.js', document.currentScript?.src || location.href).href;
  let scheduled = false, worker = null, busy = false, haltedStamp = null, currentStamp = '';
  const setPlainText = (bubble, value) => {
    const lines = value.split('\n');
    const fragment = document.createDocumentFragment();
    lines.forEach((line, index) => {
      if (index) fragment.appendChild(document.createElement('br'));
      fragment.appendChild(document.createTextNode(line));
    });
    bubble.replaceChildren(fragment);
  };
  // Only one worker operation may run at a time. A catastrophic expression can
  // always be terminated; never fall back to running it on the UI thread.
  const pump = () => {
    if (busy || !queue.length) return;
    // Newer messages take priority over old history on initial render.
    const job = queue.pop();
    if (haltedStamp === job.stamp) {
      job.deliver(job.source);
      queueMicrotask(pump);
      return;
    }
    if (!worker) {
      try {
        worker = new Worker(WORKER_URL);
      } catch (error) {
        haltedStamp = job.stamp;
        console.warn('BAO/LAB regex worker unavailable; keeping original text', error);
        job.deliver(job.source);
        queueMicrotask(pump);
        return;
      }
    }
    busy = true;
    let finished = false;
    let timeout;
    const finish = (value, failed) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (failed) {
        haltedStamp = job.stamp;
        worker?.terminate();
        worker = null;
        console.warn('BAO/LAB regex timed out or failed; keeping original text');
      }
      busy = false;
      job.deliver(failed ? job.source : value);
      queueMicrotask(pump);
    };
    worker.onmessage = event => {
      const result = event.data;
      if (result?.ok === true && typeof result.text === 'string') finish(result.text, false);
      else finish(null, true);
    };
    worker.onerror = () => finish(null, true);
    timeout = setTimeout(() => finish(null, true), 2000);
    try {
      worker.postMessage({
        source: job.source, authorRules: job.authorRules, regexRules: job.regexRules
      });
    } catch (_) {
      finish(null, true);
    }
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
    const regexActive = state.active && state.rules.some(rule => rule.enabled);
    const authorId = String(window.App?.activeCharacter?.id || '').slice(0, 80);
    let authorRules = [];
    try {
      const saved = authorId ? JSON.parse(localStorage.getItem(AUTHOR_PREFIX + encodeURIComponent(authorId)) || 'null') : null;
      if (saved?.enabled === true && Array.isArray(saved.rules)) authorRules = saved.rules;
    } catch (_) { authorRules = []; }
    const authorActive = authorRules.length > 0;
    const playerState = window.BAOPlayerTextReplace?.get?.() || { active: false, rules: [] };
    const playerActive = playerState.active && playerState.rules.some(rule => rule.enabled && rule.find);
    const active = authorActive || regexActive || playerActive;
    const stamp = JSON.stringify([authorId, authorRules, regexActive, state.rules, playerActive, playerState.rules]);
    currentStamp = stamp;
    if (haltedStamp !== stamp) haltedStamp = null;
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
      if (!active && !previous && !pending.has(bubble)) return;
      const signature = String(message.id || index) + '|' + source + '|' + stamp;
      if (previous?.signature === signature && bubble.textContent === previous.flatValue) return;
      const display = value => {
        // Literal player replacements are bounded and contain no regex engine.
        if (playerActive) value = window.BAOPlayerTextReplace.applyChat(value, playerState);
        const flatValue = value.replace(/\n/g, '');
        if (signatures.get(bubble)?.signature === signature && bubble.textContent === flatValue) return;
        signatures.set(bubble, { signature, flatValue });
        setPlainText(bubble, value);
      };
      if (!authorActive && !regexActive) {
        pending.delete(bubble);
        display(source);
        return;
      }
      if (pending.get(bubble) === signature) return;
      pending.set(bubble, signature);
      queue.push({
        stamp, source, authorRules, regexRules: regexActive ? state.rules : [],
        deliver(value) {
          if (pending.get(bubble) !== signature) return;
          pending.delete(bubble);
          // A previous turn, character or render must never paint over a new one.
          if (currentStamp !== stamp || !bubble.isConnected || !node.isConnected ||
              window.Chat?.messages !== records || records[index - shift] !== message ||
              String(message.content ?? '') !== source ||
              node.querySelector(':scope > .bubble') !== bubble ||
              bubble.querySelector('.story-inline-editor') ||
              [...bubble.querySelectorAll('*')].some(el => el.tagName !== 'BR')) return;
          display(value);
        }
      });
    });
    pump();
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
    window.addEventListener('bao:player-text-replace-changed', schedule);
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
    if (document.querySelector('script[src="js/author-regex-compat.js?v=2"]')) return;
    const compat = document.createElement('script');
    compat.src = 'js/author-regex-compat.js?v=2';
    compat.onload = () => {
      if (!document.querySelector('script[src="js/author-regex-text-mod.js"]')) {
        const textMod = document.createElement('script');
        textMod.src = 'js/author-regex-text-mod.js';
        textMod.onerror = () => console.warn('BAO/LAB author text Regex MOD failed to load');
        document.head.appendChild(textMod);
      }
      const mobile = document.createElement('script');
      mobile.src = 'js/author-regex-mobile.js?v=2';
      mobile.onerror = () => console.warn('BAO/LAB responsive author controls failed to load');
      document.head.appendChild(mobile);
      const style = document.createElement('style');
      style.textContent = '.bao-author-inline iframe[hidden]{display:none!important}';
      document.head.appendChild(style);
      const cardBind = document.createElement('script');
      cardBind.src = 'js/author-regex-card-bind.js?v=5';
      cardBind.onload = () => {
        const inline = document.createElement('script');
        inline.src = 'js/author-regex-inline.js?v=6';
        inline.onload = () => {
          const dock = document.createElement('script');
          dock.src = 'js/author-regex-dock.js?v=6';
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
