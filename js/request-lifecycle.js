(() => {
  if (typeof App === "undefined" || typeof API === "undefined" || App.__requestLifecyclePatched) return;

  const controls = () => {
    const composer = document.querySelector("#chat-view .composer");
    if (!composer) return {};
    const send = composer.querySelector("button.primary");
    if (send) {
      send.dataset.sendMessage = "true";
      send.setAttribute("aria-label", "送出訊息");
    }
    let cancel = composer.querySelector("[data-cancel-generation]");
    if (!cancel) {
      cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "secondary story-cancel-generation hidden";
      cancel.dataset.cancelGeneration = "true";
      cancel.textContent = "取消生成";
      cancel.addEventListener("click", () => App.cancelGeneration?.());
      send?.before(cancel);
    }
    return { composer, send, cancel, input: document.getElementById("user-input") };
  };

  const setPending = pending => {
    const { composer, send, cancel, input } = controls();
    composer?.classList.toggle("story-request-pending", pending);
    if (send) send.disabled = pending;
    if (cancel) {
      cancel.classList.toggle("hidden", !pending);
      cancel.disabled = false;
      cancel.textContent = "取消生成";
    }
    input?.setAttribute("aria-busy", pending ? "true" : "false");
  };

  App.cancelGeneration = function() {
    if (!this.__activeRequestController || !this.__requestPending) return false;
    const cancel = document.querySelector("[data-cancel-generation]");
    if (cancel) {
      cancel.disabled = true;
      cancel.textContent = "取消中…";
    }
    this.__activeRequestController.abort();
    return true;
  };

  const originalSendMessage = App.sendMessage.bind(App);
  App.sendMessage = async function() {
    if (this.config?.demoMode) return originalSendMessage();
    const text = document.getElementById("user-input")?.value.trim();
    if (!text || !this.config?.api?.key) return originalSendMessage();
    if (this.__requestPending) return;

    const controller = new AbortController();
    this.__requestPending = true;
    this.__activeRequestController = controller;
    API.activeSignal = controller.signal;
    setPending(true);
    try {
      return await originalSendMessage();
    } finally {
      if (API.activeSignal === controller.signal) API.activeSignal = null;
      if (this.__activeRequestController === controller) this.__activeRequestController = null;
      this.__requestPending = false;
      setPending(false);
    }
  };

  const originalExitChat = App.exitChat?.bind(App);
  if (originalExitChat) App.exitChat = function() { this.cancelGeneration?.(); return originalExitChat(); };

  controls();
  App.__requestLifecyclePatched = true;
  // Real browsers have document.head; headless core tests deliberately do not.
  if (document.head?.append && !document.querySelector('script[src="js/scene-render-integrity.js"]')) {
    const script = document.createElement('script');
    script.src = 'js/scene-render-integrity.js';
    script.onerror = () => console.warn('BAO/LAB scene render integrity failed to load');
    document.head.append(script);
  }
})();