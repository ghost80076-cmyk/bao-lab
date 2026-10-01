/* Player-facing builder presentation. Existing provider/model/storage logic remains the source of truth. */
(() => {
  "use strict";
  if (window.BAOPlayerBuilderV2 || !window.App) return;

  const HOSTED_PROVIDER = "bao-credits";
  if (!document.querySelector('link[href^="css/player-builder-v2.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/player-builder-v2.css?v=4";
    document.head.appendChild(link);
  }
  const view = document.getElementById("builder-view");
  const step = document.querySelector('.builder-step[data-step-panel="4"]');
  const $ = id => document.getElementById(id);
  if (!view || !step) return;

  let lastByokProvider = "";
  const accountSession = () => {
    try { return /^yb_s_[A-Za-z0-9_-]{30,}$/.test(String(localStorage.getItem("yorubay:session") || "").trim()); }
    catch (_) { return false; }
  };
  const provider = () => $("api-type");
  const model = () => $("model-select");

  const setLabel = (id, text) => {
    const label = $(id)?.closest("label");
    if (!label) return;
    const node = [...label.childNodes].find(item => item.nodeType === Node.TEXT_NODE);
    if (node) node.nodeValue = text;
  };

  const markFields = () => {
    const classes = {
      "api-type": "bao-builder-provider",
      "model-select": "bao-builder-model",
      "api-key": "bao-builder-key",
      "model-id": "bao-builder-technical",
      "base-url": "bao-builder-technical",
      "bao-builder-discovery-protocol": "bao-builder-technical"
    };
    Object.entries(classes).forEach(([id, name]) => $(id)?.closest("label")?.classList.add(name));
    setLabel("api-type", "模型服務");
    setLabel("model-select", "模型");
    setLabel("api-key", "連線金鑰（API Key）");
    setLabel("model-id", "模型代號（進階）");
    setLabel("base-url", "連線網址（進階）");
  };

  const hostedAvailable = () => Boolean(provider()?.querySelector(`option[value="${HOSTED_PROVIDER}"]`));
  const firstByokProvider = () => {
    const options = [...(provider()?.options || [])].map(option => option.value).filter(value => value && value !== HOSTED_PROVIDER);
    return options.includes(lastByokProvider) ? lastByokProvider
      : options.includes("gemini") ? "gemini"
      : options[0] || "";
  };

  const setProvider = value => {
    const select = provider();
    if (!select || !value || ![...select.options].some(option => option.value === value)) return false;
    if (select.value === value) return true;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const route = () => provider()?.value === HOSTED_PROVIDER ? "hosted" : "byok";

  const markConditionalSurfaces = () => {
    const legacyTest = $("test-api")?.parentElement;
    if (legacyTest) legacyTest.classList.add("bao-builder-test-row");
    const demo = $("bao-demo-mode")?.closest(".bao-demo-box") || $("bao-demo-mode")?.closest("label") || $("bao-demo-mode")?.parentElement;
    if (demo) demo.classList.add("bao-builder-demo");
    step.querySelector("[data-relay-probe]")?.closest("section")?.classList.add("bao-relay-probe");
  };

  const sync = () => {
    markFields();
    const current = route();
    const currentProvider = provider()?.value || "custom";
    if (current === "byok" && provider()?.value) lastByokProvider = provider().value;
    view.dataset.baoConnection = current;
    view.dataset.baoProvider = currentProvider;
    markConditionalSurfaces();

    const box = $("bao-connection-mode");
    if (!box) return;
    const hosted = box.querySelector('[data-bao-connection="hosted"]');
    const byok = box.querySelector('[data-bao-connection="byok"]');
    hosted.hidden = !hostedAvailable();
    hosted.setAttribute("aria-pressed", String(current === "hosted"));
    byok.setAttribute("aria-pressed", String(current === "byok"));

    const note = $("bao-connection-note");
    const account = $("bao-connection-account");
    const help = $("bao-connection-help");
    if (current === "hosted") {
      if (note) note.textContent = accountSession()
        ? "已登入。選擇模型後會使用夜灣燈火，不需要自己的連線金鑰。"
        : "先登入夜灣帳號再使用燈火；舊版測試玩家仍可使用既有玩家金鑰。";
      if (account) {
        account.hidden = false;
        account.textContent = accountSession() ? "查看帳號與燈火 →" : "登入／查看我的燈火 →";
      }
      if (help) {
        help.href = "quick-start.html";
        help.textContent = "第一次玩？三步開始 →";
      }
    } else {
      if (note) note.textContent = "使用自己的模型連線；費用與免費額度由你選擇的模型服務計算。";
      if (account) account.hidden = true;
      if (help) {
        help.href = currentProvider === "lmstudio" ? "lm-studio-guide.html" : "api-guide.html";
        help.textContent = currentProvider === "lmstudio" ? "LM Studio 連線教學 →" : "完整連線說明 →";
      }
    }

    const quickIntro = $("bao-quick-intro");
    const progressNote = $("bao-first-run-ai-note");
    if (quickIntro && view.dataset.baoSetup === "quick") {
      if (current === "hosted") {
        quickIntro.textContent = "使用夜灣燈火：選一個可用模型就能開始，不需要自己的連線金鑰。";
        if (progressNote) progressNote.textContent = accountSession() ? "夜灣燈火 · 選模型" : "夜灣燈火 · 先登入";
      } else if (currentProvider === "lmstudio") {
        quickIntro.textContent = "使用本機模型：先在 LM Studio 啟動 Local Server 並開啟 CORS，再從下方讀取本機模型。不需要雲端連線金鑰。";
        if (progressNote) progressNote.textContent = "LM Studio · 本機模型";
      } else {
        quickIntro.innerHTML = '使用自己的模型連線：選模型服務與模型，再貼上相符的連線金鑰。<a href="api-guide.html" target="_blank" rel="noopener noreferrer">連線遇到問題？看完整說明 ↗</a>';
        const providerLabel = provider()?.selectedOptions?.[0]?.textContent?.trim() || "自己的 API";
        if (progressNote) progressNote.textContent = `${providerLabel} · 模型與金鑰`;
      }
    }
  };

  const selectRoute = next => {
    if (next === "hosted") {
      if (!hostedAvailable()) {
        const note = $("bao-connection-note");
        if (note) note.textContent = "夜灣燈火仍在載入，請稍後再試。";
        return;
      }
      setProvider(HOSTED_PROVIDER);
    } else if (provider()?.value === HOSTED_PROVIDER || !provider()?.value) {
      setProvider(firstByokProvider());
    }
    sync();
  };

  const ensure = () => {
    if (!$("bao-connection-mode")) {
      const box = document.createElement("section");
      box.id = "bao-connection-mode";
      box.className = "bao-connection-mode";
      box.setAttribute("aria-label", "選擇模型連線方式");
      box.innerHTML = `
        <div class="bao-connection-mode-head">
          <div><span>STEP 2 · CONNECT</span><h4>選一種模型連線方式</h4></div>
          <small>第一次玩只需要完成這裡；進階故事設定可以之後再調整。</small>
        </div>
        <div class="bao-connection-mode-grid">
          <button type="button" data-bao-connection="hosted" aria-pressed="false">
            <b>使用夜灣燈火</b>
            <span>不需要自己的連線金鑰；生成時會依使用量消耗燈火。</span>
          </button>
          <button type="button" data-bao-connection="byok" aria-pressed="false">
            <b>使用自己的模型連線</b>
            <span>自己的服務、自己的費用，不消耗夜灣燈火。</span>
          </button>
        </div>
        <div class="bao-connection-mode-foot">
          <p id="bao-connection-note" role="status"></p>
          <div class="bao-connection-help-links">
            <a id="bao-connection-account" href="account.html" hidden>登入／查看我的燈火 →</a>
            <a id="bao-connection-help" href="api-guide.html">完整連線說明 →</a>
          </div>
        </div>`;
      const intro = $("bao-quick-intro");
      (intro || step.querySelector("h3"))?.insertAdjacentElement("afterend", box);
      box.querySelectorAll("[data-bao-connection]").forEach(button =>
        button.addEventListener("click", () => selectRoute(button.dataset.baoConnection)));
    }

    step.classList.add("bao-builder-ai-v2");
    const heading = step.querySelector("h3");
    if (heading) heading.textContent = "模型連線";
    markFields();
    sync();
  };

  const init = () => {
    ensure();
    provider()?.addEventListener("change", sync);
    model()?.addEventListener("change", sync);
    if (provider()) new MutationObserver(sync).observe(provider(), { childList: true });
    new MutationObserver(markConditionalSurfaces).observe(step, { childList: true, subtree: true });
    setTimeout(() => { markFields(); sync(); }, 250);
    window.addEventListener("storage", event => { if (event.key === "yorubay:session") sync(); });
  };

  window.BAOPlayerBuilderV2 = Object.freeze({ sync, selectRoute });
  init();
})();
