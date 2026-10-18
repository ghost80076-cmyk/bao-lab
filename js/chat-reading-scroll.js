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
  const readingPositionWrapper = async (next, config, ...args) => {
    const turn = isStoryRequest(config) ? activeTurn : null;
    try { return await next(config, ...args); }
    finally {
      if (turn && activeTurn === turn && turn.isCurrent()) turn.beforeCommitTop = stream.scrollTop;
    }
  };
  if (typeof API.wrapSend === 'function') {
    API.wrapSend('chat-reading-scroll:before-commit', readingPositionWrapper);
  } else {
    // Compatibility for an older cached API without named registration.
    const previousAPISend = API.send;
    API.send = function(config, ...args) {
      return readingPositionWrapper(previousAPISend.bind(this), config, ...args);
    };
  }

  const readingTurnWrapper = async function(next, ...args) {
    // A previous story may still be waiting; it must not reserve this story's anchor.
    if (activeTurn && !activeTurn.isCurrent()) activeTurn = null;
    const owner = window.GameState?.current, config = this.config, character = this.activeCharacter;
    const isCurrent = () => window.GameState?.current === owner && this.config === config && this.activeCharacter === character;
    const input = document.getElementById('user-input');
    // Non-send operations, offline preview, and nested requests retain their
    // existing behavior. No change to prompts, storage, aborts, or provider calls.
    if (!chat.classList.contains('active') || !input?.value.trim() || activeTurn) {
      return next(...args);
    }
    const before = new Set(userMessages());
    const turn = { beforeCommitTop: null, player: null, pending: null, isCurrent };
    activeTurn = turn;
    let operation;
    try { operation = next(...args); }
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
      if (isCurrent() && player?.isConnected && turn.beforeCommitTop !== null) {
        stream.scrollTop = turn.beforeCommitTop;
      }
      if (isCurrent() && turn.pending?.isConnected) turn.pending.style.minHeight = '';
      if (activeTurn === turn) activeTurn = null;
    }
  };

  if (typeof App.wrapSendMessage === 'function') {
    App.wrapSendMessage('chat-reading-scroll:anchor', readingTurnWrapper);
  } else {
    const previousSendMessage = App.sendMessage;
    App.sendMessage = function(...args) { return readingTurnWrapper.call(this, previousSendMessage.bind(this), ...args); };
  }

  window.BAOChatReadingScroll = Object.freeze({ version: 1 });
})();
