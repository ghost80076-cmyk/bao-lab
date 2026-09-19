(() => {
  if (typeof API === "undefined" || API.__streamingUIPatched) return;

  const originalSend = API.send.bind(API);
  const isMainStoryRequest = config => !config?.__connectionTest
    && !config?.__memoryTask
    && !config?.__stateTask
    && !config?.__storyTool
    && !config?.__auxiliaryTask
    && document.getElementById("chat-view")?.classList.contains("active");

  // A streaming bubble is temporary. After a request completes, restore the
  // committed source using the same selected reader mode as saved messages.
  // In particular, the fresh-story greeting does not belong to Chat.messages.
  const paintCommitted = () => {
    const stream = document.getElementById("chat-stream");
    const messages = window.Chat?.messages;
    if (!stream || !Array.isArray(messages) || !messages.length) return;
    const nodes = [...stream.querySelectorAll(":scope > .message")];
    const offset = nodes.length === messages.length + 1 && (
      nodes[0]?.dataset.storyGreeting === "true" ||
      nodes[0]?.querySelector(".bubble")?.dataset.authoredGreeting === "true"
    ) ? 1 : 0;
    if (nodes.length !== messages.length + offset) return; // Do not touch the pending bubble.
    if (!messages.every((message, i) => nodes[i + offset].classList.contains(message.role === "user" ? "user" : "assistant"))) return;

    const sceneView = window.BAOSceneChat;
    const sceneEnabled = sceneView?.prefs?.enabled === true;
    const renderer = window.BAOSceneHTML;
    const mode = renderer?.prefs?.mode || "native";
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const node = nodes[i + offset];
      const bubble = node?.querySelector(".bubble");
      if (!bubble) return;
      if (bubble.querySelector(".story-inline-editor")) continue;
      const source = String(message.content || "");
      if (message.role === "user") {
        const html = App.formatMessage(source);
        if (bubble.innerHTML !== html) bubble.innerHTML = html;
        continue;
      }
      node.classList.remove("is-streaming");
      if (sceneEnabled) {
        // An earlier renderer may have replaced the scene while keeping its
        // fingerprint; force the optional scene-view renderer to restore it.
        if (!bubble.querySelector(".bao-scene-body")) delete bubble.dataset.sceneFingerprint;
        continue;
      }
      if (bubble.dataset.sceneFingerprint) {
        delete bubble.dataset.sceneFingerprint;
        delete bubble.dataset.sceneType;
        bubble.classList.remove("bao-scene-plain");
        bubble.style.cssText = "";
      }
      // Always use the same renderer as story loading and scene refresh. A
      // separate HTML shortcut used to include [STATUS] and other metadata in
      // the displayed story, creating a second version of the same response.
      const html = renderer?.render ? renderer.render(source)
        : window.BAOChatMarkup?.sanitize ? BAOChatMarkup.sanitize(source) : App.formatMessage(source);
      if (bubble.innerHTML !== html) bubble.innerHTML = html;
      bubble.classList.toggle("authored-rich-message", mode !== "native");
    }
    if (sceneEnabled) sceneView.paint?.();
    renderer?.paintStatus?.();
  };

  let pendingPaint = false;
  const scheduleCommittedPaint = () => {
    if (!pendingPaint) {
      pendingPaint = true;
      queueMicrotask(() => { pendingPaint = false; paintCommitted(); });
    }
    // Story reader re-decorates at 0/100ms after a completed turn or shell
    // redraw; restore the selected HTML after those late DOM writes as well.
    setTimeout(paintCommitted, 160);
  };

  API.send = async function(config, messages) {
    if (!isMainStoryRequest(config)) return originalSend(config, messages);
    let scheduled = false;
    let pendingText = "";
    let settled = false;
    const render = () => {
      scheduled = false;
      if (settled) return; // A delayed animation frame must not overwrite the final message.
      const bubble = document.querySelector("#chat-stream > .message.assistant:last-child .bubble");
      if (!bubble || !pendingText) return;
      bubble.innerHTML = App.formatMessage(pendingText);
      bubble.closest(".message")?.classList.add("is-streaming");
      const stream = document.getElementById("chat-stream");
      if (stream) stream.scrollTop = stream.scrollHeight;
    };
    const onDelta = (delta, fullText) => {
      pendingText = fullText;
      window.dispatchEvent(new CustomEvent("bao:stream-delta", { detail: { delta, text: fullText } }));
      if (scheduled) return;
      scheduled = true;
      (window.requestAnimationFrame || window.setTimeout)(render);
    };
    try { return await originalSend({ ...config, stream: true, onDelta }, messages); }
    finally { settled = true; }
  };

  if (window.App?.sendMessage) {
    const originalSendMessage = App.sendMessage;
    App.sendMessage = async function(...args) {
      try { return await originalSendMessage.apply(this, args); }
      finally { scheduleCommittedPaint(); }
    };
    const originalShell = App.renderChatShell;
    App.renderChatShell = function(...args) {
      const result = originalShell.apply(this, args);
      scheduleCommittedPaint();
      return result;
    };
  }
  const stream = document.getElementById("chat-stream");
  if (stream) new MutationObserver(scheduleCommittedPaint).observe(stream, { childList: true });
  API.__streamingUIPatched = true;
})();

// Keep the original streaming preview untouched. Once a reply is committed,
// the coordinator renders it through the same player-selected scene renderer.
(() => {
  const src = 'js/scene-render-coordinator.js';
  if (document.querySelector(`script[src="${src}"]`)) return;
  const script = document.createElement('script');
  script.src = src;
  script.onerror = () => console.warn('BAO/LAB scene coordinator failed to load');
  document.head.appendChild(script);
})();
