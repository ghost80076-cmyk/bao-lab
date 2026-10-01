/* YoruBay account wallet bridge. Session secrets use HttpOnly cookies; old localStorage tokens are read only for migration. */
(() => {
  "use strict";
  if (typeof App === "undefined" || typeof API === "undefined" || window.BAOCreditsPilot) return;

  const BASE = "https://api.yorubay.com";
  const ENDPOINT = `${BASE}/chat`;
  const PROVIDER = "bao-credits";
  // YoruBay Hosted uses the same logical model registry as BYOK.
  // The Worker MODELS_JSON still remains an independent server-side allowlist.
  const registryModels = () => Array.isArray(App.modelRegistry?.models) ? App.modelRegistry.models : [];
  const hostedEntries = () => registryModels()
    .filter(model => model?.hosted && Array.isArray(model?.routes))
    .map(model => {
      const hosted = model.hosted || {};
      const upstreamRoute = model.routes.find(route => route?.id === hosted.route_id);
      if (!upstreamRoute?.provider || !upstreamRoute?.model) return null;
      return {
        registryId: model.id || "",
        upstreamProvider: upstreamRoute.provider,
        routeId: upstreamRoute.id || "",
        order: Number(hosted.order || 9999),
        preset: {
          provider: PROVIDER,
          provider_label: "夜灣燈火",
          tier: hosted.tier || "",
          label: hosted.label || model.name || model.id || upstreamRoute.model,
          model: upstreamRoute.model,
          base_url: ENDPOINT,
          protocol: "openai",
          route: PROVIDER,
          use_case: hosted.use_case || model.use_case || upstreamRoute.use_case || "",
          registry_id: model.id || "",
          upstream_route_id: upstreamRoute.id || ""
        }
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
  const hostedPresets = () => hostedEntries().map(entry => entry.preset);
  const hostedModels = () => hostedPresets().map(preset => preset.model);
  const hostedProviderFor = model => hostedEntries().find(entry => entry.preset.model === model)?.upstreamProvider || null;
  const isEndpoint = value => String(value || "").trim().replace(/\/+$/, "") === ENDPOINT;
  const encoder = new TextEncoder();
  // The soft target keeps normal hosted story calls compact. The hard ceiling is
  // only a transport / abuse guard; it is deliberately not treated as a model
  // context-window limit.
  const HOSTED_SOFT_PROMPT_BYTES = 88_000;
  const HOSTED_HARD_PROMPT_BYTES = 192_000;
  const promptBytes = messages => encoder.encode(JSON.stringify(messages)).length;
  const cleanMessages = messages => messages.map(m => ({ role: m.role, content: API.contentToText(m.content) }));
  const hostedStorySessionId = () => {
    const cacheId = window.BAOPromptCache?.storySessionId?.();
    const existing = String(cacheId || window.GameState?.current?.storySessionId || "").trim();
    if (existing) return existing;
    const story = window.GameState?.current;
    if (!story) return "";
    const random = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    story.storySessionId = `bao-lab:${random}`;
    return story.storySessionId;
  };
  const hostedSessionId = kind => {
    const base = hostedStorySessionId();
    if (!base) return "";
    const suffix = ["chat", "summary", "status"].includes(kind) ? kind : "chat";
    const safeBase = base.replace(/[^A-Za-z0-9._:-]/g, "-");
    const baseLimit = Math.max(1, 256 - suffix.length - 1);
    return `${safeBase.slice(0, baseLimit)}:${suffix}`;
  };
  let lastContextBudget = null;
  const basicMessagesValid = messages => (
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.length <= 100 &&
    messages.some(m => m.role === "user") &&
    !messages.some(m => !["user", "assistant", "system"].includes(m.role) || !m.content || m.content.length > 80000)
  );
  const rebuildForRounds = async rounds => {
    if (typeof App.buildMessages !== "function") return null;
    const source = App.config || {};
    const scoped = {
      ...source,
      memory: { ...(source.memory || {}), maxRounds: rounds }
    };
    const rebuilt = await App.buildMessages(scoped);
    const cleaned = Array.isArray(rebuilt) ? cleanMessages(rebuilt) : null;
    return basicMessagesValid(cleaned) ? cleaned : null;
  };
  const adaptHostedContext = async (config, input) => {
    let cleaned = input;
    const initialBytes = promptBytes(cleaned);
    let finalBytes = initialBytes;
    let rounds = null;
    let summaryPasses = 0;
    const isStoryChat = !config?.__memoryTask && !config?.__stateTask && !config?.__auxiliaryTask
      && !config?.__storyTool && !config?.__connectionTest;
    const smart = App.config?.memory?.mode === "smart";
    const chat = window.Chat;
    if (initialBytes > HOSTED_SOFT_PROMPT_BYTES && isStoryChat && smart
        && chat?.maybeSummarize && typeof App.buildMessages === "function") {
      const configured = Math.max(4, Number(App.config?.memory?.maxRounds || 20));
      const candidates = [...new Set([Math.min(configured, 8), 4])];
      for (const candidateRounds of candidates) {
        rounds = candidateRounds;
        // Rebuild first: an existing summary may already cover enough history,
        // in which case no extra paid helper request is needed.
        let candidate = await rebuildForRounds(candidateRounds);
        if (candidate) {
          cleaned = candidate;
          finalBytes = promptBytes(cleaned);
          if (finalBytes <= HOSTED_SOFT_PROMPT_BYTES) break;
        }
        const before = Number(chat.summarizedUntil || 0);
        await chat.maybeSummarize(App.config, true, candidateRounds);
        const after = Number(chat.summarizedUntil || 0);
        if (after > before) summaryPasses += 1;
        candidate = await rebuildForRounds(candidateRounds);
        if (candidate) {
          cleaned = candidate;
          finalBytes = promptBytes(cleaned);
          if (finalBytes <= HOSTED_SOFT_PROMPT_BYTES) break;
        }
        if (after <= before && candidateRounds === 4) break;
      }
    }
    lastContextBudget = {
      at: new Date().toISOString(),
      initialBytes,
      finalBytes,
      softBytes: HOSTED_SOFT_PROMPT_BYTES,
      hardBytes: HOSTED_HARD_PROMPT_BYTES,
      adaptive: finalBytes < initialBytes,
      smart,
      rounds,
      summaryPasses
    };
    return cleaned;
  };
  const LEGACY_SESSION_KEY = "yorubay:session";
  const SESSION_HINT_KEY = "yorubay:session:active";
  const accountToken = () => String(window.localStorage?.getItem?.(LEGACY_SESSION_KEY) || "").trim();
  const accountCookieHint = () => {
    try {
      return window.localStorage?.getItem?.(SESSION_HINT_KEY) === "1";
    } catch (_) {
      return false;
    }
  };
  const clearAccountSessionHint = () => {
    try {
      window.localStorage?.removeItem?.(SESSION_HINT_KEY);
      window.localStorage?.removeItem?.(LEGACY_SESSION_KEY);
    } catch (_) {}
  };
  const accountSentinel = "__YORUBAY_ACCOUNT__";
  const validLegacySession = () => /^yb_s_[A-Za-z0-9_-]{30,}$/.test(accountToken());
  const validAccountSession = () => validLegacySession() || accountCookieHint();
  const isAccountConnection = config => isEndpoint(config?.baseUrl) && Boolean(hostedProviderFor(config?.model));
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
  const upstreamName = model => hostedProviderFor(model) === "openrouter" ? "OpenRouter" : "Google Gemini";
  const providerBlockReasons = new Set(["SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "IMAGE_SAFETY", "CONTENT_FILTER"]);
  const providerBlockedStage = data => ["input", "output"].includes(data?.blocked_stage) ? data.blocked_stage : "";
  const emptyTextMessage = (name, data) => {
    const reason = String(data?.finish_reason || "").trim().toUpperCase();
    const blockedStage = providerBlockedStage(data);
    if (reason === "MAX_TOKENS" || reason === "LENGTH") {
      return `${name} 未產生文字（原因：${reason}）。本次輸出預算可能不足，請提高「回覆輸出上限」後重試。`;
    }
    if (providerBlockReasons.has(reason)) {
      if (blockedStage === "input") {
        return `${name} 未接受本次內容（原因：${reason}；階段：輸入內容）。Google 在讀取本次故事脈絡時停止請求；可修改最近內容或故事脈絡後重新生成。`;
      }
      if (blockedStage === "output") {
        return `${name} 中止本次生成（原因：${reason}；階段：生成輸出）。請求已送達供應商；可重新生成，或調整近期劇情。`;
      }
      return `${name} 在供應商端停止本次生成（原因：${reason}）。可重新生成或調整本次內容。`;
    }
    if (reason) {
      return `${name} 已回應，但沒有可顯示文字（原因：${reason}）。請先重新生成；若持續發生，再回報診斷編號。`;
    }
    return `${name} 已回應，但沒有可顯示文字。請先重新生成；若持續發生，再回報診斷編號。`;
  };

  const ensurePresets = () => {
    if (!Array.isArray(App.modelPresets) || !App.modelPresets.length) return false;
    for (const preset of hostedPresets()) {
      if (!App.modelPresets.some(p => p.provider === PROVIDER && p.model === preset.model)) App.modelPresets.push(preset);
    }
    const types = document.getElementById("api-type");
    if (types && !types.querySelector(`option[value="${PROVIDER}"]`)) {
      const option = document.createElement("option");
      option.value = PROVIDER;
      option.textContent = "夜灣燈火";
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
      const route = hostedProviderFor(model) === "openrouter" ? "OpenRouter" : "Google Gemini";
      return `已登入夜灣。這個模型會由夜灣代為連接 ${route}，不需要自己的連線金鑰；成功生成會依實際使用量消耗燈火。故事內容不會寫入帳號資料庫。`;
    }
    return "請先點上方「夜灣帳號」使用邀請碼註冊或登入。夜灣燈火僅供登入帳號使用。";
  };
  const refreshBuilder = () => {
    const enabled = document.getElementById("api-type")?.value === PROVIDER;
    const keyField = document.getElementById("api-key");
    const loggedIn = validAccountSession();
    setFieldLabel(keyField, enabled ? "YoruBay 帳號" : "連線金鑰（API Key）");
    if (keyField) {
      if (enabled && loggedIn) {
        keyField.value = accountSentinel;
        keyField.readOnly = true;
        keyField.placeholder = "已使用目前登入的 YoruBay 帳號";
      } else {
        if (keyField.value === accountSentinel) keyField.value = "";
        keyField.readOnly = enabled;
        keyField.placeholder = enabled ? "請先登入 YoruBay 帳號" : "貼上自己的 API Key";
      }
    }
    const hint = document.getElementById("api-hint");
    if (enabled && hint) hint.textContent = pilotHint(selectedPilotModel());
    const badge = document.getElementById("api-protocol-badge");
    if (enabled && badge) badge.textContent = "夜灣燈火";
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
        throw new Error("輔助模型使用不同服務商時，必須另外填入自己的 API Key；不可沿用 YoruBay 帳號 Session。");
      }
      return originalSend(config, messages);
    }
    const upstreamProvider = hostedProviderFor(config.model);
    if (!isEndpoint(config.baseUrl) || !upstreamProvider) {
      throw new Error("夜灣燈火目前僅支援已開放模型及固定連線路線。請重新選擇模型預設。");
    }
    const token = accountToken();
    const legacySession = /^yb_s_[A-Za-z0-9_-]{30,}$/.test(token);
    if (!legacySession && !accountCookieHint()) throw new Error("請先登入夜灣帳號。舊版 bao_ 玩家金鑰已停止用於夜灣燈火。");
    if (!Array.isArray(messages) || !messages.length || messages.length > 100) {
      throw new Error("夜灣 每次最多傳送 100 則訊息。請縮短近期對話或改用自己的 API Key。");
    }
    let cleaned = cleanMessages(messages);
    if (!basicMessagesValid(cleaned)) {
      throw new Error("本次內容包含無法安全送出的訊息格式或單則內容過大；故事不會刪除。");
    }
    cleaned = await adaptHostedContext(config, cleaned);
    const hostedBytes = promptBytes(cleaned);
    if (hostedBytes > HOSTED_HARD_PROMPT_BYTES) {
      if (App.config?.memory?.mode === "smart") {
        throw new Error("本次送出內容仍過大。夜灣 已嘗試整理較早故事脈絡，但固定角色／世界設定與尚未整理內容仍超過安全上限。故事不會刪除；可先用記憶工作台整理、縮減大型固定設定，或改用自己的 API Key。");
      }
      throw new Error("本次送出內容過大，而且目前不是智慧記憶模式。切換智慧記憶可讓 夜灣 自動整理較早脈絡，或改用自己的 API Key；故事不會刪除。");
    }
    const kind = config.__memoryTask ? "summary" : config.__stateTask ? "status" : "chat";
    const sessionId = upstreamProvider === "openrouter" ? hostedSessionId(kind) : "";
    const requested = Number(config.maxOutputTokens || (config.__connectionTest ? 16 : 6144));
    // Keep YoruBay frontend and Worker ceilings aligned. Auxiliary tasks still
    // pass their own smaller maxOutputTokens values, so this is only a hard cap.
    const outputCap = 8192;
    const maxOutput = Number.isFinite(requested) ? Math.max(1, Math.min(outputCap, Math.floor(requested))) : Math.min(6144, outputCap);
    let response;
    try {
      const headers = { "Content-Type": "application/json" };
      if (legacySession) headers.Authorization = `Bearer ${token}`;
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        credentials: legacySession ? "omit" : "include",
        body: JSON.stringify({
          provider: upstreamProvider,
          model: config.model,
          request_kind: kind,
          messages: cleaned,
          max_output_tokens: maxOutput,
          ...(sessionId ? { session_id: sessionId } : {})
        }),
        signal: config.signal || this.activeSignal
      });
    } catch (error) { throw this.networkError(error); }
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`夜灣 後端回傳了無法解析的內容（HTTP ${response.status}）。`); }
    if (!response.ok) {
      if (response.status === 401) clearAccountSessionHint();
      const name = upstreamName(config.model);
      const errors = {
        unauthorized: "登入已失效，請重新登入夜灣帳號。",
        insufficient_credits: "舊版測試額度不足，請向管理員補充額度。",
        insufficient_wallet_balance: "夜灣燈火不足，請添燈後再試。",
        wallet_disabled: "這個帳號的夜灣燈火功能已停用，請聯絡管理員。",
        daily_limit_or_insufficient_balance: "後端仍在使用舊的每日次數限制；請管理員更新 Worker。",
        insufficient_balance: "玩家測試額度不足，請管理員更新 Worker。",
        invalid_request_or_model_not_allowed: "模型未開放或故事內容不符合測試版限制；請確認 Worker 的 MODELS_JSON 已包含此模型。",
        invalid_max_output_tokens: "本次輸出上限超過後端設定，請管理員更新 Worker。",
        request_too_large: "本次故事內容超過後端大小限制。",
        provider_rate_limited: `${name} 回報速率或配額限制，與你的夜灣燈火餘額無關。`,
        provider_empty_text: emptyTextMessage(name, data),
        provider_http_error: Number(data?.upstream_http_status) >= 500
          ? `夜灣連線鏈路暫時異常（HTTP ${data.upstream_http_status}）。可能是中轉或供應商服務暫時故障，請稍後重試。`
          : `${name} 拒絕本次請求${data?.upstream_http_status ? `（HTTP ${data.upstream_http_status}）` : ""}。`,
        provider_network_error: `夜灣 後端連到 ${name} 時發生網路或逾時問題。`,
        provider_invalid_json: `${name} 回覆無法解析，請向管理員回報。`,
        provider_not_configured: "夜灣 後端尚未設定此模型金鑰。",
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
      const detail = errors[data?.error] || `夜灣 後端錯誤（HTTP ${response.status}；${String(data?.error || 'unknown').slice(0, 80)}）。`;
      const diagnosticId = /^[0-9a-f-]{36}$/.test(data?.request_id || '') ? `（診斷編號：${data.request_id}）` : '';
      const googleStatus = ['INVALID_ARGUMENT', 'FAILED_PRECONDITION', 'PERMISSION_DENIED', 'UNAUTHENTICATED',
        'RESOURCE_EXHAUSTED', 'NOT_FOUND', 'UNAVAILABLE'].includes(data?.provider_status)
        ? `（供應商：${data.provider_status}）` : '';
      const upstreamError = new Error(`${detail}${googleStatus}${diagnosticId}`);
      const finishReason = String(data?.finish_reason || "").trim().toUpperCase();
      if (data?.error === "provider_empty_text" && providerBlockReasons.has(finishReason)) {
        upstreamError.code = "BAO_PROVIDER_BLOCKED";
        upstreamError.blockedStage = providerBlockedStage(data) || null;
        upstreamError.finishReason = finishReason || null;
      }
      throw upstreamError;
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
    const chatUsage = window.Chat;
    if (!config.__connectionTest && chatUsage) {
      chatUsage.recordRequestUsage?.(config, result);
      chatUsage.renderUsage?.(result.usage || {});
      if (!config.__memoryTask && !config.__stateTask && !config.__auxiliaryTask && !config.__storyTool) {
        chatUsage.recordStoryUsage?.(result.usage || {}, App?.config);
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

    if ((!selected || preset?.value === "custom") && isEndpoint(baseUrlField?.value) && hostedProviderFor(modelField?.value)) {
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
    setFieldLabel(key, pilot ? "YoruBay 帳號" : "連線金鑰（API Key）");
    if (key) {
      if (pilot && loggedIn) {
        key.value = accountSentinel;
        key.readOnly = true;
        key.placeholder = "已使用目前登入的 YoruBay 帳號";
      } else {
        if (key.value === accountSentinel) key.value = "";
        key.readOnly = pilot;
        key.placeholder = pilot ? "請先登入 YoruBay 帳號" : "貼上自己的 API Key";
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
  window.BAOCreditsPilot = Object.freeze({
    endpoint: ENDPOINT,
    provider: PROVIDER,
    get models() { return hostedModels(); },
    isAccountConnection,
    isAccountReady,
    prepareAccountConfig,
    contextBudget: () => lastContextBudget ? { ...lastContextBudget } : null
  });
})();
