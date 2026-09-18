(() => {
  if (typeof API === "undefined" || API.__streamingUIPatched) return;

  const originalSend = API.send.bind(API);
  const isMainStoryRequest = config => !config?.__connectionTest
    && !config?.__memoryTask
    && !config?.__stateTask
    && !config?.__storyTool
    && !config?.__auxiliaryTask
    && document.getElementById("chat-view")?.classList.contains("active");

  API.send = async function(config, messages) {
    if (!isMainStoryRequest(config)) return originalSend(config, messages);
    let scheduled = false;
    let pendingText = "";
    const render = () => {
      scheduled = false;
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
    return originalSend({ ...config, stream: true, onDelta }, messages);
  };

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
