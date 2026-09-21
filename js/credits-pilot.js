/* BAO/LAB invited credits pilot. Player tokens stay in page memory; never add owner secrets here. */
(() => {
  "use strict";
  if (typeof App === "undefined" || typeof API === "undefined" || window.BAOCreditsPilot) return;

  const BASE = "https://bao-lab-credits-api.ghost80076.workers.dev";
  const ENDPOINT = `${BASE}/chat`;
  const PROVIDER = "bao-credits";
  const MODELS = ["gemini-3-flash-preview", "gemini-3.1-flash-lite"];
  const PRESETS = [
    { provider: PROVIDER, provider_label: "BAO/LAB 測試額度（邀請制）", label: "Gemini 3 Flash · 故事", model: MODELS[0], base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "限邀請測試" },
    { provider: PROVIDER, provider_label: "BAO/LAB 測試額度（邀請制）", label: "Gemini 3.1 Flash-Lite · 摘要", model: MODELS[1], base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "限邀請測試" }
  ];
  const isPilot = config => config?.type === PROVIDER || config?.route === PROVIDER;
  const isEndpoint = value => String(value || "").trim().replace(/\/+$/, "") === ENDPOINT;
  const encoder = new TextEncoder();

  const ensurePresets = () => {
    if (!Array.isArray(App.modelPresets) || !App.modelPresets.length) return false;
    for (const preset of PRESETS) {
      if (!App.modelPresets.some(p => p.provider === PROVIDER && p.model === preset.model)) App.modelPresets.push(preset);
    }
    const types = document.getElementById("api-type");
    if (types && !types.querySelector(`option[value="${PROVIDER}"]`)) {
      const option = document.createElement("option");
      option.value = PROVIDER;
      option.textContent = "BAO/LAB 測試額度（邀請制）";
      types.appendChild(option);
    }
    return true;
  };
  const originalPopulate = App.populateAPIControls;
  App.populateAPIControls = function(...args) {
    ensurePresets();
    return originalPopulate.apply(this, args);
  };
  const setFieldLabel = (field, label) => {
    const parent = field?.closest("label");
    if (parent?.firstChild?.nodeType === 3) parent.firstChild.nodeValue = label;
  };
  const refreshBuilder = () => {
    const enabled = document.getElementById("api-type")?.value === PROVIDER;
    const keyField = document.getElementById("api-key");
    setFieldLabel(keyField, enabled ? "玩家金鑰（player_token）" : "連線金鑰（API Key）");
    if (keyField) keyField.placeholder = enabled ? "貼上管理員發給你的個人玩家金鑰" : "貼上自己的 API Key";
    const hint = document.getElementById("api-hint");
    if (enabled && hint) hint.textContent = "邀請制：依模型回報的輸入＋輸出用量計額度（每 100 tokens 為 1 點），不限每日聊天次數。故事內容經 BAO/LAB 後端轉送 Google；僅限文字、非串流，每次最多 96 KB。金鑰不會存入故事備份。";
    const badge = document.getElementById("api-protocol-badge");
    if (enabled && badge) badge.textContent = "BAO/LAB";
  };
  const originalSync = App.syncSelectedPreset;
  App.syncSelectedPreset = function(...args) {
    const result = originalSync.apply(this, args);
    refreshBuilder();
    return result;
  };

  const originalSend = API.send.bind(API);
  API.send = async function(config, messages) {
    if (!isPilot(config)) {
      const main = App.config?.api;
      if (isPilot(main) && main.key && config?.key === main.key && !isEndpoint(config?.baseUrl)) {
        throw new Error("輔助模型使用不同服務商時，必須另外填入自己的 API Key；不可沿用 BAO/LAB 玩家金鑰。");
      }
      return originalSend(config, messages);
    }
    if (!isEndpoint(config.baseUrl) || !MODELS.includes(config.model)) {
      throw new Error("BAO/LAB 測試額度僅支援指定的兩款 Gemini 模型及固定後端網址。請重新選擇模型預設。");
    }
    const token = String(config.key || "").trim();
    if (!/^bao_[A-Za-z0-9_-]{30,}$/.test(token)) throw new Error("請輸入管理員發給你的個人玩家金鑰（player_token），不要使用 ADMIN_TOKEN 或官方 API Key。");
    if (!Array.isArray(messages) || !messages.length || messages.length > 100) {
      throw new Error("BAO/LAB 每次最多傳送 100 則訊息。請縮短近期對話或改用自己的 API Key。");
    }
    const cleaned = messages.map(m => ({ role: m.role, content: this.contentToText(m.content) }));
    if (!cleaned.some(m => m.role === "user") || cleaned.some(m => !["user", "assistant", "system"].includes(m.role) || !m.content || m.content.length > 80000) ||
        encoder.encode(JSON.stringify(cleaned)).length > 96000) {
      throw new Error("本次故事設定與近期對話超過 BAO/LAB 的 96 KB 上限。請縮短內容或改用自己的 API Key；不會刪除故事。");
    }
    const kind = config.__memoryTask ? "summary" : config.__stateTask ? "status" : "chat";
    const requested = Number(config.__connectionTest ? 1024 : (config.maxOutputTokens || 6144));
    const maxOutput = Number.isFinite(requested) ? Math.max(1, Math.min(8192, Math.floor(requested))) : 6144;
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gemini", model: config.model, request_kind: kind, messages: cleaned, max_output_tokens: maxOutput }),
        signal: config.signal || this.activeSignal
      });
    } catch (error) { throw this.networkError(error); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`BAO/LAB 後端回傳了無法解析的內容（HTTP ${response.status}）。`); }
    if (!response.ok) {
      const errors = {
        unauthorized: "玩家金鑰無效或已停用，請向管理員索取新金鑰。",
        insufficient_credits: "個人測試額度不足，請向管理員補充額度。",
        daily_limit_or_insufficient_balance: "後端仍在使用舊的每日次數限制；請管理員更新 Worker。",
        insufficient_balance: "玩家測試額度不足，請管理員更新 Worker。",
        invalid_request_or_model_not_allowed: "模型未開放或故事內容不符合測試版限制。",
        invalid_max_output_tokens: "本次輸出上限超過後端設定，請管理員更新 Worker。",
        request_too_large: "本次故事內容超過後端大小限制。",
        provider_rate_limited: "Google Gemini 回報 API 速率或免費配額限制，與 BAO/LAB 玩家額度不同。",
        provider_empty_text: `Gemini 未回傳可顯示的文字${data?.finish_reason ? `（結束原因：${data.finish_reason}）` : ""}。可試著調整輸出上限。`,
        provider_http_error: `Google Gemini 拒絕本次請求${data?.upstream_http_status ? `（HTTP ${data.upstream_http_status}）` : ""}。`,
        provider_network_error: "BAO/LAB 後端連到 Google 時發生網路或逾時問題。",
        provider_invalid_json: "Google 回覆無法解析，請向管理員回報。",
        provider_not_configured: "BAO/LAB 後端尚未設定此模型金鑰。",
        provider_request_failed: "Gemini 暫時無法回覆；請先確認 Worker 已更新，再檢查 Google 配額。",
        origin_not_allowed: "目前網站網址不在 Worker 的允許來源清單。"
      };
      throw new Error(errors[data?.error] || `BAO/LAB 後端錯誤（HTTP ${response.status}；${String(data?.error || 'unknown').slice(0, 80)}）。`);
    }
    if (typeof data?.content !== "string" || !data.content.trim()) throw new Error("Gemini 沒有回傳可顯示的文字內容。");
    const input = Number.isInteger(data.usage?.input_tokens) ? data.usage.input_tokens : null;
    const output = Number.isInteger(data.usage?.output_tokens) ? data.usage.output_tokens : null;
    return {
      text: data.content,
      usage: this.normalizeUsage({ input_tokens: input, output_tokens: output,
        total_tokens: input != null && output != null ? input + output : null }, "openai"),
      credits: { charged_credits: data.usage?.charged_credits, request_id: data.request_id }
    };
  };

  const refreshDialog = backdrop => {
    const preset = backdrop.querySelector('select[name="preset"]');
    const selected = App.modelPresets?.[Number(preset?.value)];
    const pilot = selected?.provider === PROVIDER && preset?.value !== "custom";
    const key = backdrop.querySelector('input[name="key"]');
    setFieldLabel(key, pilot ? "玩家金鑰（player_token）" : "連線金鑰（API Key）");
    if (key) key.placeholder = pilot ? "貼上你的 BAO/LAB 個人玩家金鑰" : "貼上自己的 API Key";
    const hint = backdrop.querySelector(".bao-chat-api-hint");
    if (pilot && hint) hint.textContent = "邀請制：依實際 token 用量扣除虛擬額度，不設每日聊天次數上限。故事內容會經 BAO/LAB 後端轉送 Google。金鑰不會寫入故事備份；僅支援文字、非串流。";
  };
  const watchDialog = () => {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        const backdrop = node.id === "bao-chat-api-backdrop" ? node : node.querySelector?.("#bao-chat-api-backdrop");
        if (!backdrop || backdrop.dataset.creditsPilotReady) continue;
        backdrop.dataset.creditsPilotReady = "true";
        backdrop.querySelector('select[name="preset"]')?.addEventListener("change", () => refreshDialog(backdrop));
        refreshDialog(backdrop);
      }
    });
    observer.observe(document.body, { childList: true });
  };
  const init = () => {
    ensurePresets();
    refreshBuilder();
    const type = document.getElementById("api-type");
    const key = document.getElementById("api-key");
    type?.addEventListener("change", () => { if (key) key.value = ""; }, true);
    type?.addEventListener("change", refreshBuilder);
    watchDialog();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.BAOCreditsPilot = Object.freeze({ endpoint: ENDPOINT, models: [...MODELS] });
})();