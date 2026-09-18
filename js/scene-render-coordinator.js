/* One presentation path for committed assistant replies. No API calls or state writes. */
(() => {
  'use strict';
  if (!window.App || !window.Chat || window.BAOSceneRenderCoordinator) return;

  const painted = new WeakMap();
  let queued = false;
  const stream = () => document.getElementById('chat-stream');

  function reconcile() {
    const root = stream();
    const renderer = window.BAOSceneHTML;
    if (!root || !renderer?.render || !App.activeCharacter) return;
    const nodes = [...root.querySelectorAll(':scope > .message')];
    const messages = Chat.messages || [];
    // A pending assistant bubble is not in Chat.messages. Never replace its partial text.
    const greetingOnly = messages.length === 0 && nodes.length === 1 && nodes[0].classList.contains('assistant');
    const offset = greetingOnly ? 0 : nodes.length === messages.length ? 0 :
      nodes.length === messages.length + 1 && nodes[0]?.classList.contains('assistant') ? 1 : -1;
    if (offset < 0) return;

    const entries = greetingOnly
      ? [{ role: 'assistant', content: App.activeCharacter.greeting || '', greeting: true }]
      : messages;
    const mode = renderer.prefs?.mode || 'efficient';
    for (let i = 0; i < entries.length; i++) {
      const message = entries[i];
      const node = nodes[i + offset];
      if (message?.role !== 'assistant' || !node?.classList.contains('assistant')) continue;
      const bubble = node.querySelector('.bubble');
      if (!bubble || bubble.querySelector('.story-inline-editor')) continue;
      const raw = String(message.content || '');
      const greeting = Boolean(message.greeting);
      const fingerprint = JSON.stringify([mode, raw, greeting]);
      const previous = painted.get(bubble);
      if (previous?.fingerprint === fingerprint && previous.html === bubble.innerHTML) continue;

      // A model may omit only the closing narrative marker. Repair it for display
      // without rewriting the saved conversation or sending a second model request.
      let display = raw;
      if (mode === 'efficient' && /\[SCENE:[a-z-]+\]/i.test(raw)
          && /\[NARRATION\]/i.test(raw) && !/\[\/NARRATION\]/i.test(raw)
          && !/\[(?:CHOICE|STATUS)\]/i.test(raw)) {
        display += '\n[/NARRATION]';
      }
      try {
        const html = renderer.render(display, greeting);
        if (bubble.innerHTML !== html) bubble.innerHTML = html;
        bubble.classList.toggle('authored-rich-message', mode !== 'native');
        painted.set(bubble, { fingerprint, html: bubble.innerHTML });
      } catch (error) {
        console.warn('BAO/LAB scene presentation failed:', error);
      }
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; reconcile(); });
  }

  const root = stream();
  if (root) {
    new MutationObserver(records => {
      // Ignore changes outside message bubbles, such as tool panels and status UI.
      if (records.some(record => {
        const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        return element === root || element?.closest?.('.bubble');
      })) schedule();
    }).observe(root, { childList: true, subtree: true, characterData: true });
  }

  // Reconcile after story-reader's delayed decoration, save restore and first render.
  const originalShell = App.renderChatShell;
  App.renderChatShell = function(...args) {
    const result = originalShell.apply(this, args);
    schedule();
    return result;
  };
  document.addEventListener('load', event => {
    if (event.target?.getAttribute?.('src') === 'js/scene-html-modes.js') schedule();
  }, true);
  window.BAOSceneRenderCoordinator = { reconcile, schedule };
  schedule();
})();
