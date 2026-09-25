(() => {
  if (typeof App === "undefined" || typeof Storage === "undefined" || window.BAOChatAPISettings) return;

  const sameConnection = (left = {}, right = {}) =>
    String(left.baseUrl || "").trim().replace(/\/+$/, "") === String(right.baseUrl || "").trim().replace(/\/+$/, "") &&
    String(left.protocol || "openai") === String(right.protocol || "openai");
  const escape = value => App.escapeHTML(String(value ?? ""));
  const hasKey = () => Boolean(String(App.config?.api?.key || "").trim()) || Boolean(window.BAOCreditsPilot?.isAccountReady?.(App.config?.api));
  const status = () => {
    const connected = hasKey();
    document.querySelectorAll("[data-bao-api-status]").forEach(node => {
      node.textContent = App.config?.demoMode ? "離線體驗" : connected
        ? `已連接：${App.config?.api?.model || "自訂模型"}` : "尚未設定連線金鑰（API Key）";
      node.dataset.connected = connected ? "true" : "false";
    });
  };
  const close = () => document.getElementById("bao-chat-api-backdrop")?.remove();

  const open = () => {
    if (!App.activeCharacter || !GameState.current) return false;
    close();
    const api = App.config?.api || {};
    const presets = App.modelPresets || [];
    let exactIndex = presets.findIndex(p => p.protocol === api.protocol && p.model === api.model &&
      String(p.base_url || "").replace(/\/+$/, "") === String(api.baseUrl || "").replace(/\/+$/, ""));
    if (exactIndex < 0 && window.BAOCreditsPilot?.isAccountConnection?.(api)) {
      exactIndex = presets.findIndex(p => p.provider === window.BAOCreditsPilot.provider && p.model === api.model);
    }
    const backdrop = document.createElement("div");
    backdrop.id = "bao-chat-api-backdrop";
    backdrop.innerHTML = `<section class="bao-chat-api-dialog" role="dialog" aria-modal="true" aria-labelledby="bao-chat-api-title">
      <header><h2 id="bao-chat-api-title">目前故事的 AI 連線設定</h2><button type="button" data-api-close aria-label="關閉設定">×</button></header>
      <p>直接為目前故事連接或更換模型。故事、對話、記憶與世界狀態都不會重置。</p>
      <form id="bao-chat-api-form" autocomplete="off">
        <label>AI 服務與模型預設<select name="preset"><option value="custom">自訂／保留現有連線</option>${presets.map((p, i) =>
          `<option value="${i}">${escape(p.provider_label || p.provider || "API")} · ${escape(p.label || p.model || "自訂模型")}</option>`).join("")}</select></label>
        <label>連線格式（API Protocol）<select name="protocol"><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select></label>
        <label>模型代號（Model ID）<input name="model" required placeholder="例如：gemini-2.5-flash" autocomplete="off"></label>
        <label>連線網址（Base URL）<input name="baseUrl" required placeholder="https://..." autocomplete="off" spellcheck="false"></label>
        <label>連線金鑰（API Key）<input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="${hasKey() ? "留空會維持目前金鑰（相同連線）" : "貼上自己的 API Key"}"></label>
        <p class="bao-chat-api-hint">連線金鑰（API Key）只保留在目前開啟的頁面記憶體，不寫入故事存檔或備份。更換 AI 服務商或連線網址時，必須輸入新的金鑰。</p>
        <p class="bao-chat-api-error" role="status" aria-live="polite"></p>
        <footer><button type="button" class="secondary" data-api-test>測試連線（可能計費）</button><button type="submit" class="primary">套用到目前故事</button></footer>
      </form>
    </section>`;
    document.body.appendChild(backdrop);
    const form = backdrop.querySelector("form");
    const error = backdrop.querySelector(".bao-chat-api-error");
    const field = name => form.elements.namedItem(name);
    field("preset").value = exactIndex < 0 ? "custom" : String(exactIndex);
    field("protocol").value = api.protocol || "openai";
    field("model").value = api.model || "";
    field("baseUrl").value = api.baseUrl || "";
    const setError = message => { error.textContent = message || ""; };
    const currentInput = () => {
      const model = field("model").value.trim();
      const baseUrl = field("baseUrl").value.trim();
      const protocol = field("protocol").value;
      const enteredKey = field("key").value.trim();
      if (!model || !baseUrl) throw new Error("請填寫模型代號（Model ID）與連線網址（Base URL）。");
      if (!/^https:\/\/[^\s]+$/i.test(baseUrl)) throw new Error("請使用有效的 HTTPS 連線網址（Base URL）。");
      const connection = { baseUrl, protocol };
      const key = enteredKey || (sameConnection(api, connection) ? String(api.key || "").trim() : "");
      const selected = presets[Number(field("preset").value)];
      const matchingPreset = selected &&
        String(selected.base_url || "").replace(/\/+$/, "") === baseUrl.replace(/\/+$/, "") &&
        selected.model === model ? selected : null;
      const explicitCache = matchingPreset &&
        (matchingPreset.explicit_cache === true || (matchingPreset.route === "official" && protocol === "anthropic" && matchingPreset.cache === "explicit"));
      const candidate = {
        ...api,
        type: matchingPreset?.provider || "custom",
        protocol, model, baseUrl, key,
        route: matchingPreset?.route || "custom",
        cacheMode: explicitCache ? "explicit" : (matchingPreset?.cache || "unknown"),
        explicitCacheModel: explicitCache ? model : "",
        cacheEnabled: App.config?.memory?.cache !== false
      };
      if (window.BAOCreditsPilot?.prepareAccountConfig?.(candidate)) return candidate;
      if (!candidate.key) throw new Error("請輸入這個 AI 服務商的連線金鑰（API Key）。");
      return candidate;
    };
    field("preset").addEventListener("change", () => {
      const selected = presets[Number(field("preset").value)];
      if (field("preset").value === "custom" || !selected) return;
      field("protocol").value = selected.protocol || "openai";
      field("model").value = selected.model || "";
      field("baseUrl").value = selected.base_url || "";
      setError("");
    });
    backdrop.querySelector("[data-api-close]").onclick = close;
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
    form.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const next = currentInput();
        const wasOffline = Boolean(App.config?.offlineWorldPreview);
        App.config.api = next;
        App.config.demoMode = false;
        if (wasOffline) App.config.offlineWorldPreview = false;
        if (GameState.current) GameState.current.config = App.config;
        if (wasOffline) App.renderChatShell(false);
        const modelLabel = document.getElementById("chat-model");
        if (modelLabel) modelLabel.textContent = next.model;
        const input = document.getElementById("user-input");
        if (wasOffline && input) input.placeholder = "輸入你的行動或台詞…";
        App.saveStory?.(false);
        status();
        close();
        input?.focus();
      } catch (cause) { setError(cause.message || "AI 連線設定無效。"); }
    });
    backdrop.querySelector("[data-api-test]").onclick = async event => {
      const button = event.currentTarget;
      try {
        const candidate = currentInput();
        if (typeof API?.test !== "function") throw new Error("目前不支援連線測試，仍可儲存設定後實際聊天。");
        button.disabled = true;
        setError("測試連線中，可能產生模型費用……");
        await API.test(candidate);
        setError("連線測試成功。請按「套用到目前故事」保存本次設定。");
      } catch (cause) { setError(`連線測試失敗：${cause.message || cause}`); }
      finally { button.disabled = false; }
    };
    field(window.BAOCreditsPilot?.isAccountReady?.(api) ? "preset" : (hasKey() ? "model" : "key")).focus();
    return true;
  };

  const restore = save => {
    if (!save) { alert("目前沒有存檔。"); return false; }
    const previous = App.config?.api || {};
    if (!Storage.restoreStory(save)) { alert("無法讀取這份存檔，角色資料可能已變更。"); return false; }
    App.config.api = App.config.api || {};
    if (sameConnection(previous, App.config.api) && previous.key && !save.config?.demoMode) {
      App.config.api.key = previous.key;
    }
    window.BAOCreditsPilot?.prepareAccountConfig?.(App.config.api);
    if (GameState.current) GameState.current.config = App.config;
    App.renderChatShell(false);
    App.showView("chat");
    status();
    if (!save.config?.demoMode && !hasKey()) open();
    return true;
  };

  const installEntries = () => {
    const main = document.querySelector("#chat-view .chat-main");
    if (main && !document.getElementById("bao-chat-api-toolbar")) {
      const toolbar = document.createElement("div");
      toolbar.id = "bao-chat-api-toolbar";
      toolbar.innerHTML = '<span data-bao-api-status aria-live="polite"></span><button type="button" class="secondary" data-bao-api-open>AI 連線／切換模型</button>';
      main.querySelector("#chat-stream")?.before(toolbar);
      toolbar.querySelector("button").onclick = open;
    }
    const aside = document.querySelector("#chat-view aside");
    if (aside && !document.getElementById("bao-chat-api-aside")) {
      const button = document.createElement("button");
      button.type = "button";
      button.id = "bao-chat-api-aside";
      button.className = "secondary";
      button.textContent = "AI 連線／切換模型";
      button.onclick = open;
      aside.querySelector("#save-slot-button")?.before(button);
    }
    status();
  };

  if (!document.getElementById("bao-chat-api-styles")) {
    const styles = document.createElement("style");
    styles.id = "bao-chat-api-styles";
    styles.textContent = `
      #bao-chat-api-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 14px;border:1px solid #41465c;border-radius:12px;margin:0 0 10px;background:#202431}
      #bao-chat-api-toolbar [data-bao-api-status]{font-size:13px;overflow-wrap:anywhere;color:#d6e7d7}
      #bao-chat-api-toolbar [data-connected="false"]{color:#ffd7a0}
      #bao-chat-api-toolbar button{width:auto;min-height:38px}
      #bao-chat-api-backdrop{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;overflow-y:auto;padding:16px;background:rgba(0,0,0,.78)}
      .bao-chat-api-dialog{width:min(100%,540px);max-height:calc(100dvh - 32px);overflow-y:auto;padding:clamp(18px,4vw,28px);background:#20232d;color:#f4f4fa;border:1px solid #62677a;border-radius:18px;box-shadow:0 16px 52px #0008}
      .bao-chat-api-dialog header,.bao-chat-api-dialog footer{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .bao-chat-api-dialog header h2{margin:0;font-size:22px}.bao-chat-api-dialog header button{font-size:27px;line-height:1;color:inherit;border:0;background:none;cursor:pointer}
      .bao-chat-api-dialog p{font-size:14px;line-height:1.6;color:#d4d7e4}
      .bao-chat-api-dialog form{display:grid;gap:12px}.bao-chat-api-dialog label{display:grid;gap:5px;font-size:14px}
      .bao-chat-api-dialog input,.bao-chat-api-dialog select{box-sizing:border-box;width:100%;min-width:0;padding:10px;border:1px solid #697086;border-radius:8px;background:#141720;color:#fff;font:inherit}
      .bao-chat-api-dialog .bao-chat-api-hint{margin:0;color:#c1c8d7}.bao-chat-api-dialog .bao-chat-api-error{min-height:1.5em;margin:0;color:#ffcc93}
      .bao-chat-api-dialog footer button{min-height:42px;flex:1 1 180px}
      @media(max-width:700px){#bao-chat-api-toolbar{margin:8px 0;padding:8px 10px}#bao-chat-api-toolbar button{flex:1 1 auto}.bao-chat-api-dialog{max-height:calc(100dvh - 20px)}}`;
    document.head.appendChild(styles);
  }

  App.resumeSavedStory = () => restore(Storage.loadStory());
  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(...args) {
    const result = originalRender(...args);
    installEntries();
    return result;
  };
  const originalSend = App.sendMessage.bind(App);
  App.sendMessage = function(...args) {
    if (App.config?.offlineWorldPreview || (!App.config?.demoMode && !hasKey())) {
      open();
      return Promise.resolve();
    }
    return originalSend(...args);
  };
  installEntries();
  window.BAOChatAPISettings = { open, restore, refresh: status };
})();
