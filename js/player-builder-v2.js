/* Player-facing builder presentation. Existing provider/model/storage logic remains the source of truth. */
(() => {
  "use strict";
  if (window.BAOPlayerBuilderV2 || !window.App) return;

  const HOSTED_PROVIDER = "bao-credits";
  if (!document.querySelector('link[href^="css/player-builder-v2.css"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/player-builder-v2.css?v=1";
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
    setLabel("api-type", "AI 服務商");
    setLabel("model-select", "模型");
    setLabel("api-key", "API Key");
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

  const sync = () => {
    markFields();
    const current = route();
    if (current === "byok" && provider()?.value) lastByokProvider = provider().value;
    view.dataset.baoConnection = current;

    const box = $("bao-connection-mode");
    if (!box) return;
    const hosted = box.querySelector('[data-bao-connection="hosted"]');
    const byok = box.querySelector('[data-bao-connection="byok"]');
    hosted.hidden = !hostedAvailable();
    hosted.setAttribute("aria-pressed", String(current === "hosted"));
    byok.setAttribute("aria-pressed", String(current === "byok"));

    const note = $("bao-connection-note");
    const account = $("bao-connection-account");
    if (current === "hosted") {
      if (note) note.textContent = accountSession()
        ? "已登入。選擇模型後會使用帳號 API 額度，不需要貼自己的 API Key。"
        : "先登入帳號再使用 API 額度；舊版測試玩家仍可使用既有玩家金鑰。";
      if (account) {
        account.hidden = false;
        account.textContent = accountSession() ? "查看帳號與額度 →" : "登入／查看 API 額度 →";
      }
    } else {
      if (note) note.textContent = "使用自己的 API Key；模型費用與免費額度由你選擇的 AI 服務商計算。";
      if (account) account.hidden = true;
    }

    const quickIntro = $("bao-quick-intro");
    if (quickIntro && view.dataset.baoSetup === "quick") {
      quickIntro.innerHTML = current === "hosted"
        ? "選一個模型就能開始。帳號 API 額度只處理你主動送出的模型請求。"
        : '選 AI 服務商、模型，再貼上自己的 API Key。還沒有 Key？<a href="quick-start.html" target="_blank" rel="noopener noreferrer">看三步驟教學 ↗</a>';
    }
  };

  const selectRoute = next => {
    if (next === "hosted") {
      if (!hostedAvailable()) {
        const note = $("bao-connection-note");
        if (note) note.textContent = "帳號 API 額度仍在載入，請稍後再試。";
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
      box.setAttribute("aria-label", "選擇 AI 連線方式");
      box.innerHTML = `
        <div class="bao-connection-mode-head">
          <div><span>CONNECT</span><h4>你想怎麼使用 AI？</h4></div>
          <small>兩種方式都不會把 API Key 寫進故事存檔。</small>
        </div>
        <div class="bao-connection-mode-grid">
          <button type="button" data-bao-connection="hosted" aria-pressed="false">
            <b>使用帳號 API 額度</b>
            <span>不用自己處理 API Key；依目前開放模型與 Wallet 扣款。</span>
          </button>
          <button type="button" data-bao-connection="byok" aria-pressed="false">
            <b>使用自己的 API</b>
            <span>自己選服務商與模型，費用直接由服務商計算。</span>
          </button>
        </div>
        <div class="bao-connection-mode-foot">
          <p id="bao-connection-note" role="status"></p>
          <a id="bao-connection-account" href="account.html" hidden>登入／查看 API 額度 →</a>
        </div>`;
      const intro = $("bao-quick-intro");
      (intro || step.querySelector("h3"))?.insertAdjacentElement("afterend", box);
      box.querySelectorAll("[data-bao-connection]").forEach(button =>
        button.addEventListener("click", () => selectRoute(button.dataset.baoConnection)));
    }

    step.classList.add("bao-builder-ai-v2");
    const heading = step.querySelector("h3");
    if (heading) heading.textContent = "選擇 AI";
    markFields();
    sync();
  };

  const init = () => {
    ensure();
    provider()?.addEventListener("change", sync);
    model()?.addEventListener("change", sync);
    if (provider()) new MutationObserver(sync).observe(provider(), { childList: true });
    setTimeout(() => { markFields(); sync(); }, 250);
    window.addEventListener("storage", event => { if (event.key === "yorubay:session") sync(); });
  };

  window.BAOPlayerBuilderV2 = Object.freeze({ sync, selectRoute });
  init();
})();