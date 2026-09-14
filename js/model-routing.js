(() => {
  if (typeof App === "undefined") return;

  const escape = value => App.escapeHTML(String(value ?? ""));
  const escapeAttr = value => App.escapeAttr(String(value ?? ""));

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
    if (intro) intro.textContent = "先選 API 來源與模型。官方直連、OpenRouter 與其他中轉都可以；預設會自動填入常用連線網址，進階玩家仍可自己修改 Model ID 與 Base URL。";

    const labels = {
      "api-type": "你使用哪個 API 來源？",
      "model-select": "模型 / 連線方式",
      "model-id": "模型名稱",
      "base-url": "API 連線網址",
      "api-key": "API 金鑰"
    };
    Object.entries(labels).forEach(([id, text]) => {
      const label = document.getElementById(id)?.closest("label");
      if (label?.childNodes?.[0]) label.childNodes[0].textContent = text;
    });
    const modelInput = document.getElementById("model-id");
    if (modelInput) modelInput.placeholder = "例如：claude-sonnet-4-6";
    const baseInput = document.getElementById("base-url");
    if (baseInput) baseInput.placeholder = "官方預設通常會自動填好";
    const keyInput = document.getElementById("api-key");
    if (keyInput) keyInput.placeholder = "貼上服務商提供的 API Key";
    addHelp("model-id", "Model ID 是模型名稱代碼，不是 API Key。使用網站預設時通常不用改。" );
    addHelp("base-url", "官方、OpenRouter 預設會自動填好；其他中轉或自架服務才需要依服務商文件修改。" );
    addHelp("api-key", "只保留在目前頁面工作階段，故事存檔與匯出檔不會保存 API Key。" );
  };

  const presetOptionsHTML = () => {
    const groups = new Map();
    (App.modelPresets || []).forEach((preset, index) => {
      const label = preset.provider_label || preset.provider || "其他";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push({ preset, index });
    });
    return [...groups.entries()].map(([label, items]) => `<optgroup label="${escapeAttr(label)}">${items.map(({ preset, index }) => `<option value="${index}">${escape(preset.label || preset.model || "自訂")}</option>`).join("")}</optgroup>`).join("");
  };

  const helperBlock = ({ prefix, title, description, sameModelId, example }) => `
    <section class="helper-route-card" data-helper="${prefix}">
      <h4>${escape(title)}</h4>
      <p class="note">${escape(description)}</p>
      <label>連線方式
        <select id="${prefix}-model-choice">
          <option value="same">沿用聊天 API 與聊天模型（最簡單）</option>
          <option value="same_api">沿用聊天 API，只換 Model ID</option>
          <option value="independent">使用獨立 API（可跨供應商）</option>
        </select>
      </label>
      <div id="${prefix}-same-api" class="hidden helper-route-advanced">
        <label>同一 API 的另一個 Model ID
          <input id="${sameModelId}" placeholder="${escapeAttr(example)}">
        </label>
        <small class="note">只有當這個模型能用同一組 Base URL / API Key 呼叫時才選這個。</small>
      </div>
      <div id="${prefix}-independent" class="hidden helper-route-advanced">
        <label>獨立 API 預設
          <select id="${prefix}-helper-preset">${presetOptionsHTML()}</select>
        </label>
        <div class="form-grid helper-api-grid">
          <label>Model ID<input id="${prefix}-helper-model"></label>
          <label>Base URL<input id="${prefix}-helper-base"></label>
        </div>
        <label>這個輔助 API 的 Key<input id="${prefix}-helper-key" type="password" autocomplete="off" placeholder="不會寫入故事存檔"></label>
        <div id="${prefix}-helper-note" class="note"></div>
      </div>
    </section>`;

  const selectedPreset = select => App.modelPresets?.[Number(select?.value)] || null;

  const syncIndependentPreset = prefix => {
    const select = document.getElementById(`${prefix}-helper-preset`);
    const preset = selectedPreset(select);
    const model = document.getElementById(`${prefix}-helper-model`);
    const base = document.getElementById(`${prefix}-helper-base`);
    const note = document.getElementById(`${prefix}-helper-note`);
    if (model) model.value = preset?.model || "";
    if (base) base.value = preset?.base_url || "";
    if (note) note.textContent = preset ? `${preset.provider_label || preset.provider} · ${preset.summary || "可作為輔助模型使用。"}` : "";
  };

  const syncMode = prefix => {
    const mode = document.getElementById(`${prefix}-model-choice`)?.value || "same";
    document.getElementById(`${prefix}-same-api`)?.classList.toggle("hidden", mode !== "same_api");
    document.getElementById(`${prefix}-independent`)?.classList.toggle("hidden", mode !== "independent");
  };

  const injectControls = () => {
    const step = document.querySelector('[data-step-panel="5"]');
    if (!step || document.getElementById("memory-model-choice")) return;
    const box = document.createElement("div");
    box.className = "cost-control-box helper-routing-box";
    box.innerHTML = `
      <h3>輔助模型 · 可選</h3>
      <p class="note">主模型負責演戲；記憶摘要與狀態整理可以交給便宜模型。若要「Claude 聊天＋Qwen 狀態」，必須選獨立 API，因為兩家使用不同的 Base URL 與 Key。</p>
      <div class="helper-route-grid">
        ${helperBlock({ prefix: "memory", title: "長期記憶整理", description: "只整理舊對話，不會替角色回覆玩家。", sameModelId: "memory-summary-model", example: "例如同一服務內的便宜模型" })}
        ${helperBlock({ prefix: "state", title: "NPC／事件／狀態整理", description: "只負責 JSON 狀態；通常很適合使用低成本模型。", sameModelId: "state-summary-model", example: "例如同一服務內的 Flash / Lite 模型" })}
      </div>
      <p class="note helper-key-note">獨立輔助 API Key 只存在目前工作階段；關閉或重新載入存檔後需要再次輸入。若 Key 不存在，系統會安全地回退到主聊天 API。</p>`;
    step.appendChild(box);

    ["memory", "state"].forEach(prefix => {
      document.getElementById(`${prefix}-model-choice`)?.addEventListener("change", () => syncMode(prefix));
      document.getElementById(`${prefix}-helper-preset`)?.addEventListener("change", () => syncIndependentPreset(prefix));
      syncIndependentPreset(prefix);
      syncMode(prefix);
    });
  };

  const readIndependentApi = prefix => {
    const preset = selectedPreset(document.getElementById(`${prefix}-helper-preset`));
    const model = document.getElementById(`${prefix}-helper-model`)?.value.trim() || "";
    const baseUrl = document.getElementById(`${prefix}-helper-base`)?.value.trim() || "";
    const key = document.getElementById(`${prefix}-helper-key`)?.value.trim() || "";
    if (!model || !baseUrl) return null;
    return {
      type: preset?.provider || "custom",
      protocol: preset?.protocol || "openai",
      model,
      baseUrl,
      key,
      cache: document.getElementById("cache-enabled")?.checked !== false,
      sourceKind: preset?.source_kind || "custom"
    };
  };

  const patchConfig = () => {
    if (App.__modelRoutingPatched) return;
    const original = App.collectConfig.bind(App);
    App.collectConfig = function() {
      const config = original();
      config.memory = config.memory || {};
      config.cost = config.cost || {};

      const memoryMode = document.getElementById("memory-model-choice")?.value || "same";
      const stateMode = document.getElementById("state-model-choice")?.value || "same";
      config.memory.summaryModel = memoryMode === "same_api" ? (document.getElementById("memory-summary-model")?.value.trim() || "") : "";
      config.memory.summaryApi = memoryMode === "independent" ? readIndependentApi("memory") : null;
      config.cost.stateModel = stateMode === "same_api" ? (document.getElementById("state-summary-model")?.value.trim() || "") : "";
      config.cost.stateApi = stateMode === "independent" ? readIndependentApi("state") : null;
      return config;
    };
    App.__modelRoutingPatched = true;
  };

  const findPresetIndex = api => {
    if (!api) return -1;
    return (App.modelPresets || []).findIndex(p => p.protocol === api.protocol && p.model === api.model && p.base_url === api.baseUrl);
  };

  const restoreHelper = (prefix, modelId, api) => {
    const choice = document.getElementById(`${prefix}-model-choice`);
    if (!choice) return;
    if (api && (api.model || api.baseUrl)) {
      choice.value = "independent";
      const index = findPresetIndex(api);
      const presetSelect = document.getElementById(`${prefix}-helper-preset`);
      if (presetSelect && index >= 0) presetSelect.value = String(index);
      const model = document.getElementById(`${prefix}-helper-model`);
      const base = document.getElementById(`${prefix}-helper-base`);
      if (model) model.value = api.model || "";
      if (base) base.value = api.baseUrl || "";
      const key = document.getElementById(`${prefix}-helper-key`);
      if (key) key.value = api.key || "";
    } else if (modelId) {
      choice.value = "same_api";
      const input = document.getElementById(prefix === "memory" ? "memory-summary-model" : "state-summary-model");
      if (input) input.value = modelId;
    } else {
      choice.value = "same";
    }
    syncMode(prefix);
  };

  const restoreInputs = () => {
    restoreHelper("memory", App.config?.memory?.summaryModel || "", App.config?.memory?.summaryApi || null);
    restoreHelper("state", App.config?.cost?.stateModel || "", App.config?.cost?.stateApi || null);
  };

  const init = () => {
    simplifyMainAPISection();
    injectControls();
    patchConfig();
    restoreInputs();
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 30));
  else setTimeout(init, 30);
})();
