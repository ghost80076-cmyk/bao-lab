(() => {
  if (typeof App === "undefined") return;

  const loadExtra = src => {
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.onerror = () => console.warn(`BAO/LAB failed to load ${src}`);
    document.head.appendChild(script);
  };

  const normalizeUrl = value => String(value || "").trim().replace(/\/$/, "");

  const addHelp = (fieldId, text) => {
    const field = document.getElementById(fieldId);
    const label = field?.closest("label");
    if (!field || !label || label.querySelector(".bao-field-help")) return;
    const help = document.createElement("small");
    help.className = "note bao-field-help";
    help.textContent = text;
    label.appendChild(help);
  };

  const simplifyMainAPISection = () => {
    const step = document.querySelector('[data-step-panel="4"]');
    if (!step || step.dataset.beginnerCopy === "true") return;
    step.dataset.beginnerCopy = "true";
    const title = step.querySelector("h3");
    if (title) title.textContent = "模型連線";
    const intro = step.querySelector("p.note");
    if (intro) intro.textContent = "先選 API 服務，再選模型。部分官方服務會直接填好 Model ID；Z.AI、OpenAI 等可保留官方連線網址並自行輸入 Model ID；OpenRouter 可用一把 Key 切換多家模型。";
    const rename = (id, text) => {
      const label = document.getElementById(id)?.closest("label");
      if (label?.childNodes?.[0]) label.childNodes[0].textContent = text;
    };
    rename("api-type", "API 服務 / 路由");
    rename("model-select", "模型與連線預設");
    rename("model-id", "Model ID");
    rename("base-url", "API 連線網址");
    rename("api-key", "API Key");
    addHelp("model-id", "官方服務若未綁定單一模型，請依服務商目前文件填入 Model ID；BAO/LAB 不會把某個 GLM 或 OpenAI 型號寫死。");
    addHelp("base-url", "這是實際送出請求的 endpoint。不同官方、區域與中轉站可能不同。");
    addHelp("api-key", "只留在目前頁面記憶體中，不會寫入故事存檔。請不要分享你的 Key。");
  };

  const patchMainProviderHint = () => {
    if (App.__providerHintPatched || typeof App.syncSelectedPreset !== "function") return;
    const original = App.syncSelectedPreset.bind(App);
    App.syncSelectedPreset = function() {
      const result = original();
      const preset = App.getSelectedPreset?.();
      const hint = document.getElementById("api-hint");
      if (hint && preset?.route === "official" && preset?.base_url && !preset?.model) {
        hint.textContent = `${preset.provider_label || "官方服務"}已填好官方 API 連線網址。請依服務商文件輸入 Model ID，再貼上自己的 API Key。`;
      }
      return result;
    };
    App.__providerHintPatched = true;
  };

  const helperPresets = () => (App.modelPresets || []).filter(p => p.base_url && p.route !== "custom");
  const optionHTML = () => {
    const groups = new Map();
    helperPresets().forEach(preset => {
      const index = App.modelPresets.indexOf(preset);
      const label = preset.provider_label || preset.provider || "其他";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ preset, index });
    });
    return [...groups.entries()].map(([group, items]) => `<optgroup label="${App.escapeAttr(group)}">${items.map(({preset,index}) => `<option value="${index}">${App.escapeHTML(preset.label)}</option>`).join("")}</optgroup>`).join("");
  };

  const helperCard = kind => {
    const isMemory = kind === "memory";
    return `<div class="helper-route-card" data-helper-card="${kind}">
      <label>${isMemory ? "長期記憶摘要" : "NPC／事件／狀態整理"}要用哪個連線？
        <select id="${kind}-route-choice">
          <option value="same">沿用主聊天模型與 API（最簡單）</option>
          <option value="separate">使用另一個 API／模型（省費用或分工）</option>
        </select>
      </label>
      <small class="note">${isMemory ? "只整理舊對話，不會替角色演戲。" : "只做 JSON 狀態整理，不影響主要故事文筆。"}</small>
      <div id="${kind}-route-advanced" class="hidden helper-route-advanced">
        <label>快速選擇服務 / 模型<select id="${kind}-preset-select"><option value="">選擇官方 / OpenRouter 預設…</option>${optionHTML()}</select></label>
        <div class="form-grid">
          <label>Model ID<input id="${kind}-model-id" placeholder="Model ID"></label>
          <label>相容格式<select id="${kind}-protocol"><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select></label>
          <label>API 連線網址<input id="${kind}-base-url" placeholder="API endpoint"></label>
          <label>API Key<input id="${kind}-api-key" type="password" autocomplete="off" placeholder="若與主 API 不同，貼上另一把 Key"></label>
        </div>
        <div id="${kind}-route-hint" class="note">可以使用和主聊天完全不同的服務商。</div>
        <div class="helper-route-test-row">
          <button type="button" class="secondary" data-test-helper="${kind}">測試${isMemory ? "記憶" : "狀態"}模型</button>
          <span id="${kind}-route-test-status" class="note">尚未測試</span>
        </div>
      </div>
    </div>`;
  };

  const applyPreset = kind => {
    const select = document.getElementById(`${kind}-preset-select`);
    if (!select?.value) return;
    const preset = App.modelPresets?.[Number(select.value)];
    if (!preset) return;
    document.getElementById(`${kind}-model-id`).value = preset.model || "";
    document.getElementById(`${kind}-base-url`).value = preset.base_url || "";
    document.getElementById(`${kind}-protocol`).value = preset.protocol || "openai";
    const hint = document.getElementById(`${kind}-route-hint`);
    if (hint) {
      const modelHint = preset.model ? "" : " · 請自行填入 Model ID";
      hint.textContent = `${preset.provider_label || preset.provider} · ${preset.use_case || "輔助模型"}${modelHint}${preset.pricing ? ` · Input $${preset.pricing.input}/M · Output $${preset.pricing.output}/M` : ""}`;
    }
  };

  const toggleHelper = kind => {
    const choice = document.getElementById(`${kind}-route-choice`);
    document.getElementById(`${kind}-route-advanced`)?.classList.toggle("hidden", choice?.value !== "separate");
  };

  const selectedHelperPreset = kind => {
    const select = document.getElementById(`${kind}-preset-select`);
    if (!select || select.value === "") return null;
    return App.modelPresets?.[Number(select.value)] || null;
  };

  const testHelper = async kind => {
    const button = document.querySelector(`[data-test-helper="${kind}"]`);
    const status = document.getElementById(`${kind}-route-test-status`);
    const config = App.collectConfig();
    const route = kind === "memory" ? config.memory?.summaryApi : config.cost?.stateApi;
    if (!route?.model || !route?.baseUrl || !route?.key) {
      if (status) status.textContent = "✕ 請完成 Model ID、連線網址與 API Key";
      return;
    }
    const mainApi = config.api || {};
    if (normalizeUrl(route.baseUrl) !== normalizeUrl(mainApi.baseUrl) && route.key === mainApi.key) {
      if (status) status.textContent = "✕ 不同服務商必須填入自己的 API Key";
      return;
    }
    if (button) button.disabled = true;
    if (status) status.textContent = "測試中…";
    try {
      const result = await API.test(route);
      const total = result?.usage?.total_tokens;
      if (status) status.textContent = `✓ ${kind === "memory" ? "記憶" : "狀態"}模型連線成功${total != null ? ` · ${Number(total).toLocaleString()} tok` : ""}`;
    } catch (err) {
      if (status) status.textContent = `✕ ${String(err?.message || err).split("\n")[0]}`;
    } finally {
      if (button) button.disabled = false;
    }
  };

  const injectControls = () => {
    const step = document.querySelector('[data-step-panel="5"]');
    if (!step || document.getElementById("helper-routing-box")) return;
    const box = document.createElement("div");
    box.id = "helper-routing-box";
    box.className = "cost-control-box";
    box.innerHTML = `<h3>主模型演戲，便宜模型做整理</h3><p class="note">選填。可以讓 Claude / Gemini / GLM 負責故事，再用 Qwen、MiMo、DeepSeek、GLM 或其他模型整理記憶與狀態。若不想準備第二把 API Key，維持「沿用主聊天」即可。</p><div class="helper-route-grid">${helperCard("memory")}${helperCard("state")}</div>`;
    step.appendChild(box);
    ["memory","state"].forEach(kind => {
      document.getElementById(`${kind}-route-choice`)?.addEventListener("change", () => toggleHelper(kind));
      document.getElementById(`${kind}-preset-select`)?.addEventListener("change", () => applyPreset(kind));
      document.querySelector(`[data-test-helper="${kind}"]`)?.addEventListener("click", () => testHelper(kind));
    });
  };

  const readHelperApi = kind => {
    if (document.getElementById(`${kind}-route-choice`)?.value !== "separate") return null;
    const mainKey = document.getElementById("api-key")?.value.trim() || "";
    const model = document.getElementById(`${kind}-model-id`)?.value.trim() || "";
    const baseUrl = document.getElementById(`${kind}-base-url`)?.value.trim() || "";
    const preset = selectedHelperPreset(kind);
    const presetEndpointMatches = Boolean(preset?.base_url && normalizeUrl(preset.base_url) === normalizeUrl(baseUrl));
    const presetModelMatches = Boolean(preset?.model && preset.model === model);
    const verifiedExplicit = presetEndpointMatches && presetModelMatches && (preset?.explicit_cache === true || (preset?.route === "official" && preset?.protocol === "anthropic" && preset?.cache === "explicit"));
    return {
      type: presetEndpointMatches ? (preset.provider || "custom") : "custom",
      protocol: document.getElementById(`${kind}-protocol`)?.value || "openai",
      model,
      baseUrl,
      key: document.getElementById(`${kind}-api-key`)?.value.trim() || mainKey,
      route: presetEndpointMatches ? (preset.route || "custom") : "custom",
      cacheMode: verifiedExplicit ? "explicit" : (presetEndpointMatches ? (preset.cache || "unknown") : "unknown"),
      explicitCacheModel: verifiedExplicit ? model : "",
      cacheEnabled: App.config?.memory?.cache !== false
    };
  };

  const patchConfig = () => {
    if (App.__modelRoutingPatched) return;
    const original = App.collectConfig.bind(App);
    App.collectConfig = function() {
      const config = original();
      config.memory = config.memory || {};
      config.cost = config.cost || {};
      config.memory.summaryApi = readHelperApi("memory");
      config.cost.stateApi = readHelperApi("state");
      config.memory.summaryModel = config.memory.summaryApi?.model || "";
      config.cost.stateModel = config.cost.stateApi?.model || "";
      const preset = App.getSelectedPreset?.();
      const presetEndpointMatches = Boolean(preset?.base_url && normalizeUrl(preset.base_url) === normalizeUrl(config.api.baseUrl));
      const presetModelMatches = Boolean(preset?.model && preset.model === config.api.model);
      const verifiedExplicit = presetEndpointMatches && presetModelMatches && (preset?.explicit_cache === true || (preset?.route === "official" && preset?.protocol === "anthropic" && preset?.cache === "explicit"));
      config.api.type = presetEndpointMatches ? (preset?.provider || config.api.type || "custom") : "custom";
      config.api.route = presetEndpointMatches ? (preset?.route || "custom") : "custom";
      config.api.cacheMode = verifiedExplicit ? "explicit" : (presetEndpointMatches ? (preset?.cache || "unknown") : "unknown");
      config.api.explicitCacheModel = verifiedExplicit ? config.api.model : "";
      config.api.cacheEnabled = config.memory.cache !== false;
      return config;
    };
    App.__modelRoutingPatched = true;
  };

  const restoreHelper = (kind, api) => {
    const choice = document.getElementById(`${kind}-route-choice`);
    if (!choice) return;
    const enabled = Boolean(api?.model && api?.baseUrl);
    choice.value = enabled ? "separate" : "same";
    if (enabled) {
      document.getElementById(`${kind}-model-id`).value = api.model || "";
      document.getElementById(`${kind}-base-url`).value = api.baseUrl || "";
      document.getElementById(`${kind}-protocol`).value = api.protocol || "openai";
      document.getElementById(`${kind}-api-key`).value = "";
      const presetIndex = (App.modelPresets || []).findIndex(preset =>
        preset.route !== "custom" &&
        normalizeUrl(preset.base_url) === normalizeUrl(api.baseUrl) &&
        (!api.type || api.type === "custom" || preset.provider === api.type)
      );
      if (presetIndex >= 0) document.getElementById(`${kind}-preset-select`).value = String(presetIndex);
    }
    toggleHelper(kind);
  };

  const init = () => {
    patchMainProviderHint();
    simplifyMainAPISection();
    injectControls();
    patchConfig();
    window.BAOMemoryPreferences?.mount?.();
    restoreHelper("memory", App.config?.memory?.summaryApi || null);
    restoreHelper("state", App.config?.cost?.stateApi || null);
    loadExtra("js/helper-api-routing.js");
    loadExtra("js/model-guide.js");
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 50));
  else setTimeout(init, 50);
})();

