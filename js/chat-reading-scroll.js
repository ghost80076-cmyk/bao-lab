/* Position a new turn at its player message; never follow streaming tokens. */
(() => {
  'use strict';
  if (!window.App || !window.API || window.BAOChatReadingScroll) return;
  const stream = document.getElementById('chat-stream');
  const chat = document.getElementById('chat-view');
  if (!stream || !chat) return;

  const isStoryRequest = config => !config?.__connectionTest && !config?.__memoryTask
    && !config?.__stateTask && !config?.__storyTool && !config?.__auxiliaryTask
    && chat.classList.contains('active');
  const userMessages = () => [...stream.querySelectorAll(':scope > .message.user')];
  let activeTurn = null;

  // Capture the player's *current* reading position just before App commits
  // the completed response. App's legacy sendMessage scrolls to the bottom at
  // completion; restoring here prevents that jump without changing its data flow.
  const previousAPISend = API.send;
  API.send = async function(config, ...args) {
    const turn = isStoryRequest(config) ? activeTurn : null;
    try { return await previousAPISend.call(this, config, ...args); }
    finally {
      if (turn && activeTurn === turn) turn.beforeCommitTop = stream.scrollTop;
    }
  };

  const previousSendMessage = App.sendMessage;
  App.sendMessage = async function(...args) {
    const input = document.getElementById('user-input');
    // Non-send operations, offline preview, and nested requests retain their
    // existing behavior. No change to prompts, storage, aborts, or provider calls.
    if (!chat.classList.contains('active') || !input?.value.trim() || activeTurn) {
      return previousSendMessage.apply(this, args);
    }
    const before = new Set(userMessages());
    const turn = { beforeCommitTop: null, player: null, pending: null };
    activeTurn = turn;
    let operation;
    try { operation = previousSendMessage.apply(this, args); }
    catch (error) { activeTurn = null; throw error; }
    const player = userMessages().find(node => !before.has(node));
    if (player) {
      turn.player = player;
      // Allow the player message to reach the top even while the response is
      // just a short "generating" placeholder. Once committed, remove the
      // temporary reading space; short responses may naturally sit lower.
      const pending = player.nextElementSibling;
      if (pending?.classList.contains('assistant') &&
          pending.querySelector('.bubble')?.textContent?.trim() === '正在生成……') {
        turn.pending = pending;
        pending.style.minHeight = `${Math.max(0, stream.clientHeight)}px`;
      }
      const target = stream.scrollTop + player.getBoundingClientRect().top
        - stream.getBoundingClientRect().top - 8;
      stream.scrollTop = Math.max(0, target);
    } else {
      activeTurn = null;
    }
    try { return await operation; }
    finally {
      if (player?.isConnected && turn.beforeCommitTop !== null) {
        stream.scrollTop = turn.beforeCommitTop;
      }
      if (turn.pending?.isConnected) turn.pending.style.minHeight = '';
      if (activeTurn === turn) activeTurn = null;
    }
  };

  window.BAOChatReadingScroll = Object.freeze({ version: 1 });
})();
