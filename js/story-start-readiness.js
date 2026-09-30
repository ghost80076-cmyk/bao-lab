(() => {
  "use strict";
  if (window.BAOStoryStartReadiness || !window.BAOStoryStartReadinessCore || !window.App) return;

  const core = window.BAOStoryStartReadinessCore;
  if (!document.querySelector('link[href^="css/story-start-readiness.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/story-start-readiness.css?v=1";
    document.head.appendChild(link);
  }
  const view = document.getElementById("builder-view");
  if (!view) return;
  const $ = id => document.getElementById(id);
  let syncing = false;

  const safeConfig = () => {
    try { return App.collectConfig?.() || {}; }
    catch (_) {
      return {
        demoMode: Boolean($("bao-demo-mode")?.checked),
        api: {
          type: $("api-type")?.value || "custom",
          model: $("model-id")?.value || "",
          baseUrl: $("base-url")?.value || "",
          key: $("api-key")?.value || ""
        }
      };
    }
  };

  const snapshot = () => {
    const config = safeConfig();
    const api = { ...(config.api || {}) };
    const provider = String($("api-type")?.value || api.type || "").trim();
    const hosted = provider === "bao-credits" || api.type === "bao-credits" || api.route === "bao-credits";
    const local = provider === "lmstudio" || api.type === "lmstudio" || api.local === true;
    let accountReady = false;
    if (hosted) {
      try { accountReady = Boolean(window.BAOCreditsPilot?.isAccountReady?.(api)); }
      catch (_) { accountReady = false; }
    }
    return core.evaluate({
      workSelected: Boolean(App.activeCharacter),
      workName: App.activeCharacter?.name || App.activeCharacter?.title || "",
      connection: {
        provider,
        type: api.type,
        model: api.model,
        baseUrl: api.baseUrl,
        key: api.key,
        hosted,
        local,
        accountReady,
        demoMode: config.demoMode === true
      }
    });
  };

  const ensure = () => {
    const choice = $("bao-setup-choice");
    if (!choice) return null;
    let panel = $("bao-start-readiness");
    if (panel) return panel;
    panel = document.createElement("section");
    panel.id = "bao-start-readiness";
    panel.className = "bao-start-readiness";
    panel.setAttribute("aria-live", "polite");
    panel.innerHTML = `
      <div class="bao-start-readiness-head">
        <div><span>READY CHECK</span><b>開始前確認</b></div>
        <strong data-start-ready-summary>檢查中…</strong>
      </div>
      <div class="bao-start-readiness-missing" data-start-ready-missing hidden>
        <span data-start-ready-message></span>
        <button type="button" class="secondary" data-start-ready-action></button>
        <a data-start-ready-link hidden></a>
      </div>`;
    const progress = choice.querySelector(".bao-first-run-progress");
    if (progress) progress.insertAdjacentElement("afterend", panel);
    else choice.prepend(panel);
    panel.querySelector("[data-start-ready-action]")?.addEventListener("click", () => performAction(snapshot().missing));
    return panel;
  };

  const actionLabel = action => ({
    account: "登入帳號",
    key: "貼上 API Key",
    model: "選擇模型",
    endpoint: "補上連線網址",
    "local-model": "設定本機模型",
    work: "回作品區"
  }[action] || "完成設定");

  const performAction = action => {
    if (action === "work") {
      App.showView?.("explore");
      return;
    }
    if (action === "account") {
      window.location.href = "account.html";
      return;
    }
    if (action === "local-model") {
      const target = $("bao-lm-builder") || $("bao-lm-models");
      target?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      if ($("bao-lm-models")) $("bao-lm-models").focus();
      return;
    }
    if (action === "model") {
      const field = $("model-select") || $("model-id");
      field?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      field?.focus?.();
      return;
    }
    if (action === "endpoint") {
      const toggle = $("bao-quick-technical-toggle");
      if (toggle && toggle.getAttribute("aria-expanded") !== "true") toggle.click();
      const advanced = $("api-advanced-settings");
      if (advanced) advanced.open = true;
      $("base-url")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      $("base-url")?.focus?.();
      return;
    }
    if (action === "key") {
      $("api-key")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
      $("api-key")?.focus?.();
    }
  };

  const updateProgress = state => {
    const items = [...document.querySelectorAll("#bao-setup-choice .bao-first-run-progress li")];
    if (items.length < 3) return;
    const [work, ai, start] = items;
    items.forEach(item => item.classList.remove("is-done", "is-current", "is-ready", "is-pending"));

    work.classList.add(state.work.ready ? "is-done" : "is-current");
    ai.classList.add(state.ai.ready ? "is-done" : (state.work.ready ? "is-current" : "is-pending"));
    start.classList.add(state.start.ready ? "is-ready" : "is-pending");

    const workSmall = work.querySelector("small");
    if (workSmall) workSmall.textContent = state.work.ready ? `已選：${state.work.detail}` : state.work.detail;
    const aiSmall = ai.querySelector("small");
    if (aiSmall) aiSmall.textContent = state.ai.ready ? `已完成：${state.ai.detail}` : state.ai.label;
    const startSmall = start.querySelector("small");
    if (startSmall) startSmall.textContent = state.start.ready ? state.start.label : state.start.detail;
  };

  const sync = () => {
    if (syncing || view.dataset.baoSetup !== "quick") return false;
    syncing = true;
    try {
      const panel = ensure();
      if (!panel) return false;
      const state = snapshot();
      updateProgress(state);
      const summary = panel.querySelector("[data-start-ready-summary]");
      const missing = panel.querySelector("[data-start-ready-missing]");
      const message = panel.querySelector("[data-start-ready-message]");
      const button = panel.querySelector("[data-start-ready-action]");
      const link = panel.querySelector("[data-start-ready-link]");

      panel.dataset.ready = state.canStart ? "true" : "false";
      if (summary) summary.textContent = state.canStart
        ? (state.ai.mode === "demo" ? "可開始離線體驗" : "可以開始故事")
        : "還差 1 項";

      if (state.canStart) {
        if (missing) missing.hidden = true;
      } else {
        if (missing) missing.hidden = false;
        if (message) message.textContent = state.ai.ready ? state.start.detail : `${state.ai.label}：${state.ai.detail}`;
        if (button) {
          button.hidden = state.missing === "account";
          button.textContent = actionLabel(state.missing);
        }
        if (link) {
          const account = state.missing === "account";
          link.hidden = !account;
          if (account) {
            link.href = "account.html";
            link.textContent = "登入／查看帳號 →";
          }
        }
      }

      const startButton = $("start-story");
      if (startButton) {
        startButton.dataset.baoReady = state.canStart ? "true" : "false";
        startButton.title = state.canStart ? state.start.label : `還不能開始：${state.start.detail}`;
      }
      return state;
    } finally {
      syncing = false;
    }
  };

  const visibilityObserver = new MutationObserver(() => {
    if (view.classList.contains("active")) window.setTimeout(sync, 0);
  });
  visibilityObserver.observe(view, { attributes: true, attributeFilter: ["class"] });

  view.addEventListener("input", event => {
    if (event.target?.matches?.("input,select,textarea")) window.setTimeout(sync, 0);
  });
  view.addEventListener("change", event => {
    if (event.target?.matches?.("input,select,textarea")) window.setTimeout(sync, 0);
  });
  view.addEventListener("click", () => {
    if (view.classList.contains("active")) window.setTimeout(sync, 120);
  });

  let mountAttempts = 0;
  const mountTimer = window.setInterval(() => {
    mountAttempts += 1;
    if (view.classList.contains("active")) sync();
    if ($("bao-start-readiness") || mountAttempts >= 80) window.clearInterval(mountTimer);
  }, 100);

  window.addEventListener("storage", event => {
    if (event.key === "yorubay:session") window.setTimeout(sync, 0);
  });
  window.addEventListener("focus", () => {
    if (view.classList.contains("active")) window.setTimeout(sync, 0);
  });

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function(...args) {
    const result = originalOpenBuilder(...args);
    window.setTimeout(sync, 0);
    return result;
  };

  window.BAOStoryStartReadiness = Object.freeze({ sync, snapshot, performAction });
  window.setTimeout(sync, 0);
})();
