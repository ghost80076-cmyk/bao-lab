/* Shared collapsible turn-choice dock for story cards. Keeps optional actions out of the composer's permanent footprint. */
(() => {
  'use strict';
  if (window.BAOActionChoiceDock) return;

  const states = new Map();

  const ownerNodes = owner => [...document.querySelectorAll('[data-bao-choice-owner]')]
    .filter(node => node.dataset.baoChoiceOwner === owner);

  const clear = owner => ownerNodes(String(owner || '')).forEach(node => node.remove());

  const reset = owner => {
    const key = String(owner || '');
    clear(key);
    states.delete(key);
  };

  const sync = (owner, wrap, toggle, collapsed) => {
    const state = states.get(owner) || {};
    state.collapsed = Boolean(collapsed);
    states.set(owner, state);
    wrap.hidden = state.collapsed;
    wrap.setAttribute('aria-hidden', String(state.collapsed));
    toggle.hidden = !state.collapsed;
    toggle.setAttribute('aria-expanded', String(!state.collapsed));
  };

  const mount = options => {
    const owner = String(options?.owner || '').trim();
    const id = String(options?.id || '').trim();
    const toggleId = String(options?.toggleId || `${id}-toggle`).trim();
    const className = String(options?.className || '').trim();
    const choiceAttribute = String(options?.choiceAttribute || 'data-bao-choice').trim();
    const choices = Array.isArray(options?.choices) ? options.choices.filter(item => item?.text) : [];
    const messageKey = String(options?.messageKey || '');
    const freeKeys = new Set((Array.isArray(options?.freeKeys) ? options.freeKeys : []).map(String));
    const stream = document.getElementById('chat-stream');
    if (!owner || !id || !className || !stream || choices.length < 2) {
      if (owner) clear(owner);
      return false;
    }

    clear(owner);
    const prior = states.get(owner);
    const state = prior && prior.messageKey === messageKey
      ? prior
      : { messageKey, collapsed: false };
    state.messageKey = messageKey;
    states.set(owner, state);

    const wrap = document.createElement('section');
    wrap.id = id;
    wrap.className = `${className} bao-turn-choice-dock`;
    wrap.dataset.baoChoiceOwner = owner;
    wrap.setAttribute('aria-label', options?.label || '本輪行動建議');

    const head = document.createElement('div');
    head.className = 'bao-turn-choice-head';
    head.innerHTML = '<div><strong>行動建議</strong><span>點選後只會填入輸入框</span></div>';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'bao-turn-choice-close';
    close.textContent = '×';
    close.setAttribute('aria-label', '收合行動建議');
    close.title = '收合';
    head.append(close);

    const list = document.createElement('div');
    list.className = 'bao-turn-choice-list';
    for (const item of choices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bao-turn-choice-option';
      button.setAttribute(choiceAttribute, String(item.key || ''));
      const badge = document.createElement('span');
      badge.textContent = String(item.key || '');
      button.append(badge, document.createTextNode(String(item.text || '')));
      button.addEventListener('click', () => {
        const input = document.getElementById('user-input');
        if (!input) return;
        input.value = freeKeys.has(String(item.key || '')) ? '' : String(item.text || '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange?.(input.value.length, input.value.length);
        sync(owner, wrap, toggle, true);
      });
      list.append(button);
    }
    wrap.append(head, list);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = toggleId;
    toggle.className = 'bao-turn-choice-toggle';
    toggle.dataset.baoChoiceOwner = owner;
    toggle.textContent = '⌁ 行動建議';
    toggle.setAttribute('aria-controls', id);
    toggle.setAttribute('aria-label', '展開行動建議');
    close.addEventListener('click', () => sync(owner, wrap, toggle, true));
    toggle.addEventListener('click', () => {
      sync(owner, wrap, toggle, false);
      wrap.querySelector('.bao-turn-choice-option')?.focus({ preventScroll: true });
    });

    const stayAtBottom = (stream.scrollHeight - stream.scrollTop - stream.clientHeight) < 96;
    stream.append(toggle, wrap);
    sync(owner, wrap, toggle, state.collapsed);
    if (stayAtBottom) requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
    return true;
  };

  window.BAOActionChoiceDock = Object.freeze({ mount, clear, reset });
})();