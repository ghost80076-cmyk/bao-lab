/* YoruBay account wallet bridge. Player sessions stay in page memory; never add owner secrets here. */
(() => {
  "use strict";
  if (typeof App === "undefined" || typeof API === "undefined" || window.BAOCreditsPilot) return;

  const BASE = "https://bao-lab-credits-api.ghost80076.workers.dev";
  const ENDPOINT = `${BASE}/chat`;
  const PROVIDER = "bao-credits";
  // The front-end route is always bao-credits. The Worker requires the real
  // upstream provider for its MODELS_JSON allowlist and providerCall routing.
  const MODEL_PROVIDERS = Object.freeze({
    "gemini-3-flash-preview": "gemini",
    "gemini-3.1-flash-lite": "gemini",
    "gemini-3.1-pro-preview": "gemini",
    "google/gemini-3.1-pro-preview": "openrouter",
    "anthropic/claude-sonnet-4.5": "openrouter",
    "anthropic/claude-sonnet-4.6": "openrouter",
    "anthropic/claude-opus-4.5": "openrouter",
    "anthropic/claude-opus-4.6": "openrouter"
  });
  const MODELS = Object.keys(MODEL_PROVIDERS);
  const PRESETS = [
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Gemini 3 Flash · Google 官方", model: "gemini-3-flash-preview", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，依 Wallet 扣除模型成本" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Gemini 3.1 Flash-Lite · Google 官方", model: "gemini-3.1-flash-lite", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，適合摘要與低成本整理" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Gemini 3.1 Pro · Google 官方", model: "gemini-3.1-pro-preview", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，依 Google 官方模型成本扣款" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Gemini 3.1 Pro · OpenRouter", model: "google/gemini-3.1-pro-preview", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，經 OpenRouter 路由" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Claude Sonnet 4.5 · OpenRouter", model: "anthropic/claude-sonnet-4.5", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，Claude 舊版文風相容" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Claude Sonnet 4.6 · OpenRouter", model: "anthropic/claude-sonnet-4.6", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，適合高品質長篇" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Claude Opus 4.5 · OpenRouter", model: "anthropic/claude-opus-4.5", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，Opus 舊版相容" },
    { provider: PROVIDER, provider_label: "YoruBay API 額度", label: "Claude Opus 4.6 · OpenRouter", model: "anthropic/claude-opus-4.6", base_url: ENDPOINT, protocol: "openai", route: PROVIDER, use_case: "登入 YoruBay 後直接使用，適合高品質重要劇情" }
  ];
  const isEndpoint = value => String(value || "").trim().replace(/\/+$/, "") === ENDPOINT;
  const encoder = new TextEncoder();
  const accountToken = () => String(window.localStorage?.getItem?.("yorubay:session") || "").trim();
  const accountSentinel = "__YORUBAY_ACCOUNT__";
  const validAccountSession = () => /^yb_s_[A-Za-z0-9_-]{30,}$/.test(accountToken());
  const isAccountConnection = config => isEndpoint(config?.baseUrl) && Boolean(MODEL_PROVIDERS[config?.model]);
  const isPilot = config => config?.type === PROVIDER || config?.route === PROVIDER || isAccountConnection(config);
  const isAccountReady = config => validAccountSession() && isAccountConnection(config);
  const prepareAccountConfig = config => {
    if (!config || !isAccountReady(config)) return false;
    config.type = PROVIDER;
    config.route = PROVIDER;
    config.protocol = "openai";
    config.key = accountSentinel;
    return true;
  };
  const upstreamName = model => MODEL_PROVIDERS[model] === "openrouter" ? "OpenRouter" : "Google Gemini";

  const ensurePresets = () => {
    if (!Array.isArray(App.modelPresets) || !App.modelPresets.length) return false;
    for (const preset of PRESETS) {
      if (!App.modelPresets.some(p => p.provider === PROVIDER && p.model === preset.model)) App.modelPresets.push(preset);
    }
    const types = document.getElementById("api-type");
    if (types && !types.querySelector(`option[value="${PROVIDER}"]`)) {
      const option = document.createElement("option");
      option.value = PROVIDER;
      option.textContent = "YoruBay API 額度";
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
  const setLabelHidden = (field, hidden) => {
    const label = field?.closest?.("label");
    if (label) label.hidden = Boolean(hidden);
  };
  const refreshBuilderFields = enabled => {
    const loggedIn = validAccountSession();
    setLabelHidden(document.getElementById("model-id"), enabled);
    setLabelHidden(document.getElementById("base-url"), enabled);
    setLabelHidden(document.getElementById("api-key"), enabled && loggedIn);
  };
  const selectedPilotModel = () => {
    const select = document.getElementById("model-select");
    const preset = App.getSelectedPreset?.() || App.modelPresets?.[Number(select?.value)];
    return preset?.provider === PROVIDER ? preset.model : null;
  };
  const pilotHint = model => {
    if (validAccountSession()) {
      const route = MODEL_PROVIDERS[model] === "openrouter" ? "OpenRouter" : "Google Gemini";
      return `已登入 YoruBay。此模型由 YoruBay 後端轉送 ${route}，不需要自己的 API Key；成功請求會依帳號 Wallet 扣除 API 額度。故事內容不會寫入帳號資料庫。`;
    }
    return "請先點上方「YoruBay 帳號」使用邀請碼註冊或登入。舊版封測玩家仍可在下方貼上 bao_ 玩家金鑰。";
  };
  const refreshBuilder = () => {
    const enabled = document.getElementById("api-type")?.value === PROVIDER;
    const keyField = document.getElementById("api-key");
    const loggedIn = validAccountSession();
    setFieldLabel(keyField, enabled ? (loggedIn ? "YoruBay 帳號" : "玩家金鑰（舊版）") : "連線金鑰（API Key）");
    if (keyField) {
      if (enabled && loggedIn) {
        keyField.value = accountSentinel;
        keyField.readOnly = true;
        keyField.placeholder = "已使用目前登入的 YoruBay 帳號";
      } else {
        if (keyField.value === accountSentinel) keyField.value = "";
        keyField.readOnly = false;
        keyField.placeholder = enabled ? "先登入 YoruBay；舊版玩家可貼 bao_ 金鑰" : "貼上自己的 API Key";
      }
    }
    const hint = document.getElementById("api-hint");
    if (enabled && hint) hint.textContent = pilotHint(selectedPilotModel());
    const badge = document.getElementById("api-protocol-badge");
    if (enabled && badge) badge.textContent = "YoruBay Wallet";
    refreshBuilderFields(enabled);
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
    const upstreamProvider = MODEL_PROVIDERS[config.model];
    if (!isEndpoint(config.baseUrl) || !upstreamProvider) {
      throw new Error("YoruBay API 額度僅支援已開放模型及固定後端網址。請重新選擇模型預設。");
    }
    const sessionToken = accountToken();
    const legacyToken = String(config.key || "").trim();
    const token = sessionToken || legacyToken;
    const validSession = /^yb_s_[A-Za-z0-9_-]{30,}$/.test(token);
    const validLegacy = /^bao_[A-Za-z0-9_-]{30,}$/.test(token);
    if (!validSession && !validLegacy) throw new Error("請先登入 YoruBay 帳號；舊版封測玩家也可以使用管理員發給你的 bao_ 玩家金鑰。");
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
    // Limit the paid model's normal requests in the UI. The Worker and the
    // OpenRouter account still need independent spending limits before rollout.
    const outputCap = upstreamProvider === "openrouter" ? 2048 : 8192;
    const maxOutput = Number.isFinite(requested) ? Math.max(1, Math.min(outputCap, Math.floor(requested))) : Math.min(6144, outputCap);
    let response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ provider: upstreamProvider, model: config.model, request_kind: kind, messages: cleaned, max_output_tokens: maxOutput }),
        signal: config.signal || this.activeSignal
      });
    } catch (error) { throw this.networkError(error); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`BAO/LAB 後端回傳了無法解析的內容（HTTP ${response.status}）。`); }
    if (!response.ok) {
      const name = upstreamName(config.model);
      const errors = {
        unauthorized: "玩家金鑰無效或已停用，請向管理員索取新金鑰。",
        insufficient_credits: "舊版測試額度不足，請向管理員補充額度。",
        insufficient_wallet_balance: "YoruBay API 額度不足，請儲值後再試。",
        wallet_disabled: "這個 YoruBay Wallet 已停用，請聯絡管理員。",
        daily_limit_or_insufficient_balance: "後端仍在使用舊的每日次數限制；請管理員更新 Worker。",
        insufficient_balance: "玩家測試額度不足，請管理員更新 Worker。",
        invalid_request_or_model_not_allowed: "模型未開放或故事內容不符合測試版限制；請確認 Worker 的 MODELS_JSON 已包含此模型。",
        invalid_max_output_tokens: "本次輸出上限超過後端設定，請管理員更新 Worker。",
        request_too_large: "本次故事內容超過後端大小限制。",
        provider_rate_limited: `${name} 回報 API 速率或配額限制，與 BAO/LAB 玩家額度不同。`,
        provider_empty_text: `${name} 未回傳可顯示的文字${data?.finish_reason ? `（結束原因：${data.finish_reason}）` : ""}。可試著調整輸出上限。`,
        provider_http_error: `${name} 拒絕本次請求${data?.upstream_http_status ? `（HTTP ${data.upstream_http_status}）` : ""}。`,
        provider_network_error: `BAO/LAB 後端連到 ${name} 時發生網路或逾時問題。`,
        provider_invalid_json: `${name} 回覆無法解析，請向管理員回報。`,
        provider_not_configured: "BAO/LAB 後端尚未設定此模型金鑰。",
        provider_request_failed: `${name} 暫時無法回覆；請管理員檢查上游服務及配額。`,
        google_bad_request_region: "Google Gemini 回報目前請求來源區域不受支援。",
        google_bad_request_billing: "Google Gemini 回報此專案的付費／Billing 條件尚未滿足。",
        google_bad_request_model_not_allowed: "AWS Gemini 中繼尚未允許這個模型，請管理員更新 Relay 模型清單。",
        google_bad_request_model_unavailable: "Google Gemini 回報此模型不存在、不可用或已停用。",
        google_bad_request_permission: "Google Gemini 回報目前 API 專案沒有使用此模型的權限。",
        google_bad_request_api_key: "Google Gemini 回報 API Key 或驗證設定有問題。",
        google_bad_request_generation_config: "Google Gemini 不接受目前的生成參數設定。",
        google_bad_request_system_instruction: "Google Gemini 不接受目前的 system instruction 格式。",
        google_bad_request_message_format: "Google Gemini 不接受目前的對話訊息格式。",
        google_bad_request_context_limit: "本次內容超過 Google Gemini 可接受的上下文或請求大小。",
        google_bad_request_invalid_argument: "Google Gemini 回報請求參數無效。",
        google_bad_request_precondition: "Google Gemini 回報目前專案或模型尚未滿足必要條件。",
        google_bad_request_quota: "Google Gemini 回報供應商配額不足或已達限制。",
        google_bad_request_unavailable: "Google Gemini 目前暫時不可用。",
        google_bad_request_thought_signature: "Google Gemini 回報 thought signature 格式不符合要求。",
        google_bad_request_invalid_error_payload: "AWS Gemini 中繼回傳了無法辨識的錯誤格式，請管理員檢查 Relay 日誌。",
        origin_not_allowed: "目前網站網址不在 Worker 的允許來源清單。"
      };
      const detail = errors[data?.error] || `BAO/LAB 後端錯誤（HTTP ${response.status}；${String(data?.error || 'unknown').slice(0, 80)}）。`;
      const diagnosticId = /^[0-9a-f-]{36}$/.test(data?.request_id || '') ? `（診斷編號：${data.request_id}）` : '';
      const googleStatus = ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'PERMISSION_DENIED', 'UNAUTHENTICATED',
        'RESOURCE_EXHAUSTED', 'NOT_FOUND', 'UNAVAILABLE'].includes(data?.provider_status)
        ? `（供應商：${data.provider_status}）` : '';
      throw new Error(`${detail}${googleStatus}${diagnosticId}`);
    }
    if (typeof data?.content !== "string" || !data.content.trim()) throw new Error(`${upstreamName(config.model)} 沒有回傳可顯示的文字內容。`);
    const input = Number.isInteger(data.usage?.input_tokens) ? data.usage.input_tokens : null;
    const output = Number.isInteger(data.usage?.output_tokens) ? data.usage.output_tokens : null;
    const cached = Number.isInteger(data.usage?.cached_tokens) ? data.usage.cached_tokens : null;
    const cacheWrite = Number.isInteger(data.usage?.cache_write_tokens) ? data.usage.cache_write_tokens : null;
    const result = {
      text: data.content,
      usage: this.normalizeUsage({
        input_tokens: input,
        output_tokens: output,
        cached_tokens: cached,
        cache_write_tokens: cacheWrite,
        new_input_tokens: input != null && cached != null ? Math.max(0, input - cached) : null,
        total_tokens: input != null && output != null ? input + output : null
      }, "openai"),
      credits: {
        charged_credits: data.usage?.charged_credits ?? null,
        charged_usd: data.usage?.charged_usd ?? null,
        charged_microusd: data.usage?.charged_microusd ?? null,
        wallet_balance_usd: data.usage?.wallet_balance_usd ?? null,
        request_id: data.request_id,
        provider_cost_usd: data.usage?.provider_cost_usd ?? null,
        actual_cost_usd: data.usage?.actual_cost_usd ?? null,
        reasoning_tokens: data.usage?.reasoning_tokens ?? null,
        billing_mode: data.usage?.billing_mode ?? null,
        settlement_status: data.usage?.settlement_status ?? null
      }
    };
    // This route bypasses the base API transport, so account usage here as well.
    // recordRequestUsage is idempotent: an outer wrapper may safely see the same result.
    if (!config.__connectionTest && window.Chat) {
      Chat.recordRequestUsage?.(config, result);
      Chat.renderUsage?.(result.usage || {});
      if (!config.__memoryTask && !config.__stateTask && !config.__auxiliaryTask && !config.__storyTool) {
        Chat.recordStoryUsage?.(result.usage || {}, App?.config);
      }
    }
    return result;
  };

  const refreshDialog = backdrop => {
    const preset = backdrop.querySelector('select[name="preset"]');
    const modelField = backdrop.querySelector('input[name="model"]');
    const baseUrlField = backdrop.querySelector('input[name="baseUrl"]');
    const protocolField = backdrop.querySelector('select[name="protocol"]');
    const key = backdrop.querySelector('input[name="key"]');
    let selected = App.modelPresets?.[Number(preset?.value)];

    if ((!selected || preset?.value === "custom") && isEndpoint(baseUrlField?.value) && MODEL_PROVIDERS[modelField?.value]) {
      const walletIndex = App.modelPresets?.findIndex(p => p.provider === PROVIDER && p.model === modelField.value);
      if (Number.isInteger(walletIndex) && walletIndex >= 0) {
        preset.value = String(walletIndex);
        selected = App.modelPresets[walletIndex];
        protocolField.value = selected.protocol || "openai";
        modelField.value = selected.model || "";
        baseUrlField.value = selected.base_url || "";
      }
    }

    const pilot = selected?.provider === PROVIDER && preset?.value !== "custom";
    const loggedIn = validAccountSession();
    if (pilot) {
      protocolField.value = selected.protocol || "openai";
      modelField.value = selected.model || "";
      baseUrlField.value = selected.base_url || "";
    }
    setFieldLabel(key, pilot ? (loggedIn ? "YoruBay 帳號" : "玩家金鑰（舊版）") : "連線金鑰（API Key）");
    if (key) {
      if (pilot && loggedIn) {
        key.value = accountSentinel;
        key.readOnly = true;
        key.placeholder = "已使用目前登入的 YoruBay 帳號";
      } else {
        if (key.value === accountSentinel) key.value = "";
        key.readOnly = false;
        key.placeholder = pilot ? "先登入 YoruBay；舊版玩家可貼 bao_ 金鑰" : "貼上自己的 API Key";
      }
    }

    setLabelHidden(protocolField, pilot);
    setLabelHidden(modelField, pilot);
    setLabelHidden(baseUrlField, pilot);
    setLabelHidden(key, pilot && loggedIn);

    const hint = backdrop.querySelector(".bao-chat-api-hint");
    if (pilot && hint) hint.textContent = pilotHint(selected.model);
    else if (hint) hint.textContent = "連線金鑰（API Key）只保留在目前開啟的頁面記憶體，不寫入故事存檔或備份。更換 AI 服務商或連線網址時，必須輸入新的金鑰。";
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
    type?.addEventListener("change", () => { if (key && key.value !== accountSentinel) key.value = ""; }, true);
    type?.addEventListener("change", refreshBuilder);
    watchDialog();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  window.BAOCreditsPilot = Object.freeze({ endpoint: ENDPOINT, provider: PROVIDER, models: [...MODELS], isAccountConnection, isAccountReady, prepareAccountConfig });
})();
