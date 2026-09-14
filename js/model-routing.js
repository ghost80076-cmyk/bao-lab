(() => {
  if (typeof App === "undefined") return;

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
    if (intro) intro.textContent = "先選 API 服務，再選模型。官方預設會自動填入 Model ID 與連線網址；OpenRouter 可用一把 Key 切換多家模型；自訂中轉則請自行確認價格、隱私與服務品質。";

    const rename = (id, text) => {
      const label = document.getElementById(id)?.closest("label");
      if (label?.childNodes?.[0]) label.childNodes[0].textContent = text;
    };
    rename("api-type", "API 服務 / 路由");
    rename("model-select", "模型與連線預設");
    rename("model-id", "Model ID");
    rename("base-url", "API 連線網址");
    rename("api-key", "API Key");

    addHelp("model-id", "通常不需要手填。只有自訂 API、中轉站或服務商改名時才修改。");
    addHelp("base-url", "這是實際送出請求的 endpoint。不同官方、區域與中轉站可能不同。");
    addHelp("api-key", "只留在目前頁面記憶體中，不會寫入故事存檔。請不要分享你的 Key。");
  };

  const helperPresets = () => (App.modelPresets || []).filter(p => p.model && p.base_url && p.route !== "custom");
  const optionHTML = selected => {
    const groups = new Map();
    helperPresets().forEach((preset, index) => {
      const label = preset.provider_label || preset.provider || "其他";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ preset, index });
    });
    return [...groups.entries()].map(([group, items]) => `<optgroup label="${App.escapeAttr(group)}">${items.map(({preset,index}) => `<option value="${index}" ${String(index) === String(selected) ? "selected" : ""}>${App.escapeHTML(preset.label)}</option>`).join("")}</optgroup>`).join("");
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
        <label>快速選擇模型
          <select id="${kind}-preset-select"><option value="">選擇官方 / OpenRouter 預設…</option>${optionHTML("")}</select>
        </label>
        <div class="form-grid">
          <label>Model ID<input id="${kind}-model-id" placeholder="Model ID"></label>
          <label>相容格式<select id="${kind}-protocol"><option value="openai">OpenAI-compatible</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option></select></label>
          <label>API 連線網址<input id="${kind}-base-url" placeholder="API endpoint"></label>
          <label>API Key<input id="${kind}-api-key" type="password" autocomplete="off" placeholder="若與主 API 不同，貼上另一把 Key"></label>
        </div>
        <div id="${kind}-route-hint" class="note">可以使用和主聊天完全不同的服務商。</div>
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
    if (hint) hint.textContent = `${preset.provider_label || preset.provider} · ${preset.use_case || "輔助模型"}${preset.pricing ? ` · Input $${preset.pricing.input}/M · Output $${preset.pricing.output}/M` : ""}`;
  };

  const toggleHelper = kind => {
    const choice = document.getElementById(`${kind}-route-choice`);
    document.getElementById(`${kind}-route-advanced`)?.classList.toggle("hidden", choice?.value !== "separate");
  };

  const injectControls = () => {
    const step = document.querySelector('[data-step-panel="5"]');
    if (!step || document.getElementById("helper-routing-box")) return;
    const box = document.createElement("div");
    box.id = "helper-routing-box";
    box.className = "cost-control-box";
    box.innerHTML = `<h3>主模型演戲，便宜模型做整理</h3>
      <p class="note">選填。你可以讓 Claude / Gemini 負責故事，再用 Qwen、MiMo、DeepSeek 等較便宜模型整理記憶與狀態。若不想準備第二把 API Key，全部保持「沿用主聊天」即可。</p>
      <div class="helper-route-grid">${helperCard("memory")}${helperCard("state")}</div>`;
    step.appendChild(box);
    ["memory","state"].forEach(kind => {
      document.getElementById(`${kind}-route-choice`)?.addEventListener("change", () => toggleHelper(kind));
      document.getElementById(`${kind}-preset-select`)?.addEventListener("change", () => applyPreset(kind));
    });
  };

  const readHelperApi = kind => {
    if (document.getElementById(`${kind}-route-choice`)?.value !== "separate") return null;
    const mainKey = document.getElementById("api-key")?.value.trim() || "";
    return {
      type: "custom",
      protocol: document.getElementById(`${kind}-protocol`)?.value || "openai",
      model: document.getElementById(`${kind}-model-id`)?.value.trim() || "",
      baseUrl: document.getElementById(`${kind}-base-url`)?.value.trim() || "",
      key: document.getElementById(`${kind}-api-key`)?.value.trim() || mainKey
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
      // Legacy fields remain for old saves; new stories use the full connection object above.
      config.memory.summaryModel = config.memory.summaryApi?.model || "";
      config.cost.stateModel = config.cost.stateApi?.model || "";
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
      // API keys are intentionally not restored from story saves.
      document.getElementById(`${kind}-api-key`).value = "";
    }
    toggleHelper(kind);
  };

  const restoreInputs = () => {
    restoreHelper("memory", App.config?.memory?.summaryApi || null);
    restoreHelper("state", App.config?.cost?.stateApi || null);
  };

  const init = () => {
    simplifyMainAPISection();
    injectControls();
    patchConfig();
    restoreInputs();
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 50));
  else setTimeout(init, 50);
})();
