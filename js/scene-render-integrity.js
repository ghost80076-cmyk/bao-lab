/* Render committed assistant messages from one source; never alter story or API data. */
(() => {
  'use strict';
  if (window.BAOSceneRenderIntegrity || !window.App || !window.Chat) return;
  const stream = document.getElementById('chat-stream');
  if (!stream) return;
  let scheduled = false;

  function reconcile() {
    if (App.__requestPending || App.config?.offlineWorldPreview) return;
    const reader = window.BAOSceneHTML;
    const messages = Chat.messages;
    if (!reader?.render || !Array.isArray(messages) || !App.activeCharacter) return;
    // A separate, explicitly enabled theme owns its own scene cards.
    if (window.BAOSceneChat?.prefs?.enabled) { window.BAOSceneChat.paint?.(); return; }

    const nodes = [...stream.querySelectorAll(':scope > .message')];
    const greeting = nodes[0];
    const greetingBubble = greeting?.querySelector('.bubble');
    const knownGreeting = greeting?.dataset.storyGreeting === 'true'
      || greeting?.dataset.messageIndex === '-1'
      || greetingBubble?.dataset.authoredGreeting === 'true'
      || greetingBubble?.innerHTML === App.formatMessage(App.activeCharacter.greeting || '');
    const greetingOnly = !messages.length && nodes.length === 1 && greeting?.classList.contains('assistant') && knownGreeting;
    const offset = !greetingOnly && nodes.length === messages.length + 1 && knownGreeting ? 1 : 0;
    if (!greetingOnly && (nodes.length !== messages.length + offset ||
        !messages.every((message, index) => nodes[index + offset]?.classList.contains(message.role === 'user' ? 'user' : 'assistant')))) return;
    if (offset) greeting.dataset.storyGreeting = 'true';
    const entries = greetingOnly ? [{ role: 'assistant', content: App.activeCharacter.greeting || '', greeting: true }] : messages;
    for (let i = 0; i < entries.length; i++) {
      const message = entries[i];
      if (message.role !== 'assistant') continue;
      const node = nodes[i + offset];
      if (!node || node.classList.contains('is-streaming')) continue;
      const bubble = node.querySelector('.bubble');
      if (!bubble || bubble.querySelector('.story-inline-editor')) continue;
      const source = window.BAOChatPresentationCore?.stripStatusAppendix?.(message.content) ?? message.content;
      const html = reader.render(source, Boolean(message.greeting || greetingOnly));
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      bubble.classList.toggle('authored-rich-message', reader.prefs?.mode !== 'native');
    }
  }

  function schedule() {
    if (scheduled || App.__requestPending) return;
    scheduled = true;
    requestAnimationFrame(() => { scheduled = false; reconcile(); });
  }
  // The story reader re-decorates at 0/100 ms; wait for its last write.
  const previousSend = App.sendMessage;
  App.sendMessage = async function(...args) {
    try { return await previousSend.apply(this, args); }
    finally { schedule(); setTimeout(schedule, 170); }
  };
  const previousShell = App.renderChatShell;
  App.renderChatShell = function(...args) {
    const result = previousShell.apply(this, args);
    schedule(); setTimeout(schedule, 170);
    return result;
  };
  // Also handle mode switches and late history decorations without touching
  // the temporary streaming bubble while the request is active.
  new MutationObserver(schedule).observe(stream, { childList: true, subtree: true });
  const sceneScript = document.querySelector('script[src="js/scene-html-modes.js"]');
  if (!window.BAOSceneHTML) sceneScript?.addEventListener('load', schedule, { once: true });
  window.BAOSceneRenderIntegrity = { reconcile, schedule };
  schedule();
})();