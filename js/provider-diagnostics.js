(() => {
  if (typeof App === "undefined" || typeof API === "undefined" || window.BAOProviderDiagnostics) return;

  const state = { running: false, last: null };
  const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
  const normalize = value => String(value || "").trim();
  const endpointHost = value => { try { return new URL(value).host; } catch { return normalize(value); } };
  const secretReplace = (text, secret) => {
    let value = String(text || "");
    if (!secret) return value;
    const encoded = encodeURIComponent(secret);
    value = value.split(secret).join("[已遮蔽 API Key]");
    if (encoded !== secret) value = value.split(encoded).join("[已遮蔽 API Key]");
    return value;
  };
  const sanitizeError = (error, secret) => secretReplace(error?.message || error || "未知錯誤", secret).slice(0, 900);
  const category = message => {
    const text = String(message || "").toLowerCase();
    if (text.includes("cors") || text.includes("failed to fetch") || text.includes("network") || text.includes("無法連線")) return "browser";
    if (text.includes("api key") || text.includes("authentication") || text.includes("unauthorized") || text.includes("401")) return "key";
    if (text.includes("quota") || text.includes("rate limit") || text.includes("429") || text.includes("額度") || text.includes("餘額")) return "quota";
    if (text.includes("permission") || text.includes("forbidden") || text.includes("403") || text.includes("權限")) return "permission";
    if (text.includes("model") || text.includes("404") || text.includes("找不到") || text.includes("base url")) return "model";
    if (text.includes("stream") || text.includes("sse") || text.includes("串流")) return "stream";
    return "provider";
  };
  const categoryHint = value => ({
    browser: "瀏覽器直連或 CORS 被服務商擋下；Key 不一定有問題。",
    key: "API Key 驗證失敗，請確認貼入的是目前服務商的金鑰。",
    quota: "連線已到服務商，但額度、餘額或速率限制阻止請求。",
    permission: "金鑰可被辨識，但目前帳號／地區／模型權限不足。",
    model: "請核對 Model ID 與 Base URL 是否屬於同一服務。",
    stream: "一般回覆可能可用，但 Streaming 協議沒有通過。",
    provider: "服務商回傳未分類錯誤；可依下方訊息核對設定。"
  }[value] || "");

  const storageContains = (storage, secret) => {
    if (!storage || !secret) return false;
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && String(storage.getItem(key) || "").includes(secret)) return true;
      }
    } catch {}
    return false;
  };

  const privacyCheck = secret => {
    const leaks = [];
    if (!secret) return { ok: true, leaks };
    if (storageContains(window.localStorage, secret)) leaks.push("localStorage");
    if (storageContains(window.sessionStorage, secret)) leaks.push("sessionStorage");
    try {
      if (typeof Storage !== "undefined" && typeof Storage.buildStoryPayload === "function" && App.activeCharacter && window.GameState?.current) {
        const payload = Storage.buildStoryPayload("provider-diagnostics");
        if (JSON.stringify(payload || {}).includes(secret)) leaks.push("故事存檔 payload");
      }
    } catch {}
    return { ok: leaks.length === 0, leaks };
  };

  const usageTotal = usage => {
    const value = usage?.total_tokens ?? usage?.input_tokens ?? usage?.prompt_tokens;
    return Number.isFinite(Number(value)) ? Number(value) : null;
  };

  const publicMeta = config => ({
    provider: normalize(config.type || "custom"),
    protocol: normalize(config.protocol || "openai"),
    model: normalize(config.model),
    endpoint: endpointHost(config.baseUrl)
  });

  const validate = config => {
    if (!normalize(config.key)) return "請先填入 API Key。";
    if (!normalize(config.model)) return "請先填入 Model ID。";
    if (!normalize(config.baseUrl) && config.protocol !== "gemini") return "請先填入 Base URL。";
    return "";
  };

  const runConfig = async input => {
    const config = { ...(input || {}) };
    const secret = normalize(config.key);
    const meta = publicMeta(config);
    const validation = validate(config);
    const result = {
      ...meta,
      ok: false,
      standard: { ok: false, skipped: false },
      streaming: { ok: false, skipped: true, chunks: 0, mode: "skipped" },
      privacy: privacyCheck(secret)
    };
    if (validation) {
      result.standard = { ok: false, skipped: true, category: "config", error: validation };
      return result;
    }

    const standardStart = now();
    try {
      const response = await API.test({ ...config, stream: false, onDelta: undefined });
      result.standard = {
        ok: true,
        skipped: false,
        ms: Math.max(0, Math.round(now() - standardStart)),
        totalTokens: usageTotal(response?.usage)
      };
    } catch (error) {
      const message = sanitizeError(error, secret);
      result.standard = {
        ok: false,
        skipped: false,
        ms: Math.max(0, Math.round(now() - standardStart)),
        category: category(message),
        error: message
      };
      result.privacy = privacyCheck(secret);
      return result;
    }

    let chunks = 0;
    const streamStart = now();
    try {
      const response = await API.test({
        ...config,
        stream: true,
        onDelta: delta => { if (String(delta || "")) chunks += 1; }
      });
      const verified = chunks > 0;
      result.streaming = {
        ok: verified,
        responseOk: true,
        skipped: false,
        ms: Math.max(0, Math.round(now() - streamStart)),
        chunks,
        mode: verified ? "sse" : "buffered",
        totalTokens: usageTotal(response?.usage),
        ...(verified ? {} : {
          category: "stream",
          error: "API 回覆成功，但沒有收到可即時顯示的 Streaming delta。"
        })
      };
    } catch (error) {
      const message = sanitizeError(error, secret);
      result.streaming = {
        ok: false,
        responseOk: false,
        skipped: false,
        ms: Math.max(0, Math.round(now() - streamStart)),
        chunks,
        mode: "failed",
        category: category(message),
        error: message
      };
    }
    result.privacy = privacyCheck(secret);
    result.ok = result.standard.ok && result.streaming.ok && result.privacy.ok;
    return result;
  };

  const currentConfig = () => {
    let api = {};
    try { api = { ...(App.collectConfig?.().api || {}) }; } catch {}
    const preset = App.getSelectedPreset?.();
    api.key = normalize(document.getElementById("api-key")?.value || api.key);
    api.model = normalize(document.getElementById("model-id")?.value || api.model);
    api.baseUrl = normalize(document.getElementById("base-url")?.value || api.baseUrl);
    api.type = preset?.provider || api.type || document.getElementById("api-type")?.value || "custom";
    api.protocol = preset?.protocol || api.protocol || "openai";
    api.route = preset?.route || api.route || "custom";
    return api;
  };

  const escape = value => App.escapeHTML ? App.escapeHTML(String(value ?? "")) : String(value ?? "");
  const statusText = item => {
    if (item?.skipped) return "尚未執行";
    if (!item?.ok) return `${item?.responseOk ? "未確認" : "失敗"} · ${item?.ms ?? 0} ms`;
    return `成功 · ${item?.ms ?? 0} ms${item?.totalTokens != null ? ` · ${Number(item.totalTokens).toLocaleString()} 字詞用量（tok）` : ""}`;
  };

  const render = result => {
    const status = document.getElementById("provider-diagnostics-status");
    const output = document.getElementById("provider-diagnostics-result");
    if (!status || !output) return;
    const streamDetail = result.streaming.skipped
      ? "尚未執行"
      : result.streaming.ok
        ? `即時輸出（Streaming）已確認 · ${result.streaming.chunks} 段資料`
        : result.streaming.error || "即時輸出失敗";
    const failure = !result.standard.ok ? result.standard : (!result.streaming.ok ? result.streaming : null);
    status.textContent = result.ok
      ? "✓ 完整驗收通過"
      : result.standard.ok && result.streaming.ok && !result.privacy.ok
        ? "✕ 發現本機持久化風險"
        : failure?.skipped ? "尚未完成設定" : "△ 驗收未完全通過";
    output.innerHTML = `
      <div class="provider-diagnostics-meta"><b>${escape(result.provider || "custom")}</b><span>${escape(result.protocol || "openai").toUpperCase()}</span><span>${escape(result.model || "—")}</span><span>${escape(result.endpoint || "—")}</span></div>
      <div class="provider-diagnostics-grid">
        <div><small>一般回覆</small><b>${escape(statusText(result.standard))}</b>${result.standard.error ? `<span>${escape(result.standard.error)}</span>` : ""}</div>
        <div><small>即時輸出（Streaming）</small><b>${escape(statusText(result.streaming))}</b><span>${escape(streamDetail)}</span></div>
        <div><small>本機隱私</small><b>${result.privacy.ok ? "✓ 未發現金鑰持久化" : "✕ 發現金鑰"}</b><span>${result.privacy.ok ? "未出現在瀏覽器儲存空間或故事資料中" : escape(result.privacy.leaks.join("、"))}</span></div>
      </div>
      ${failure?.category ? `<p class="note provider-diagnostics-hint">${escape(categoryHint(failure.category))}</p>` : ""}`;
  };

  const run = async () => {
    if (state.running) return state.last;
    const button = document.querySelector("[data-run-provider-diagnostics]");
    const status = document.getElementById("provider-diagnostics-status");
    state.running = true;
    if (button) button.disabled = true;
    if (status) status.textContent = "驗收中：先測一般回覆，再測即時輸出（Streaming）…";
    try {
      const result = await runConfig(currentConfig());
      state.last = result;
      render(result);
      return result;
    } finally {
      state.running = false;
      if (button) button.disabled = false;
    }
  };

  const clearKey = () => {
    const field = document.getElementById("api-key");
    if (field) field.value = "";
    state.last = null;
    const status = document.getElementById("provider-diagnostics-status");
    const output = document.getElementById("provider-diagnostics-result");
    if (status) status.textContent = "連線金鑰（API Key）已從輸入框清除。";
    if (output) output.innerHTML = "";
  };

  const mount = () => {
    const step = document.querySelector('[data-step-panel="4"]');
    if (!step || document.getElementById("provider-diagnostics-box")) return false;
    const box = document.createElement("div");
    box.id = "provider-diagnostics-box";
    box.className = "cost-control-box provider-diagnostics-box";
    box.innerHTML = `
      <h3>AI 服務商（Provider）實際連線測試</h3>
      <p class="note">完整測試最多送出 2 次極短 AI 請求：先確認一般回覆，再確認即時輸出（Streaming）。連線金鑰（API Key）只從目前輸入框讀取，不寫入測試結果、故事存檔或瀏覽器儲存空間。</p>
      <div class="provider-diagnostics-actions">
        <button type="button" class="secondary" data-run-provider-diagnostics>測試目前 AI 連線</button>
        <button type="button" class="text-button" data-clear-provider-key>清除連線金鑰</button>
        <span id="provider-diagnostics-status" class="note" aria-live="polite">尚未驗收</span>
      </div>
      <div id="provider-diagnostics-result" aria-live="polite"></div>
      <p class="note">若 Anthropic 官方回報組織禁止瀏覽器跨網站連線（CORS），代表該帳戶政策不允許直接從網頁呼叫；這和連線金鑰錯誤是不同問題。</p>`;
    step.appendChild(box);
    if (!document.getElementById("provider-diagnostics-style")) {
      const style = document.createElement("style");
      style.id = "provider-diagnostics-style";
      style.textContent = `.provider-diagnostics-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.provider-diagnostics-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.provider-diagnostics-meta span,.provider-diagnostics-meta b{font-size:12px;padding:4px 8px;border:1px solid var(--line,#333);border-radius:999px}.provider-diagnostics-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:10px}.provider-diagnostics-grid>div{display:flex;flex-direction:column;gap:5px;padding:12px;border:1px solid var(--line,#333);border-radius:12px;min-width:0}.provider-diagnostics-grid span{font-size:12px;overflow-wrap:anywhere}.provider-diagnostics-hint{margin-top:10px}@media(max-width:720px){.provider-diagnostics-grid{grid-template-columns:1fr}}`;
      document.head.appendChild(style);
    }
    box.querySelector("[data-run-provider-diagnostics]")?.addEventListener("click", run);
    box.querySelector("[data-clear-provider-key]")?.addEventListener("click", clearKey);
    return true;
  };

  window.BAOProviderDiagnostics = {
    mount,
    run,
    runConfig,
    currentConfig,
    privacyCheck,
    redact: secretReplace,
    classify: category,
    snapshot: () => state.last ? JSON.parse(JSON.stringify(state.last)) : null
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(mount, 90));
  else setTimeout(mount, 90);
})();
