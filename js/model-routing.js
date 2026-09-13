(() => {
  if (typeof App === "undefined") return;

  const syncAdvanced = (selectId, inputWrapId) => {
    const select = document.getElementById(selectId);
    const wrap = document.getElementById(inputWrapId);
    if (!select || !wrap) return;
    wrap.classList.toggle("hidden", select.value !== "custom");
  };

  const injectControls = () => {
    const step = document.querySelector('[data-step-panel="5"]');
    if (!step || document.getElementById("memory-summary-model")) return;

    const box = document.createElement("div");
    box.className = "cost-control-box";
    box.innerHTML = `
      <h3>要不要用另一個模型幫你整理？</h3>
      <p class="note">看不懂這裡也沒關係。一般玩家兩個都保持「跟聊天用同一個模型」就可以直接開始。只有想省費用或加快整理速度時，才需要另外指定模型。</p>

      <div class="form-grid">
        <div>
          <label>長期記憶要用哪個模型整理？
            <select id="memory-model-choice">
              <option value="same">跟聊天用同一個模型（推薦）</option>
              <option value="custom">改用另一個模型</option>
            </select>
          </label>
          <small class="note">它只負責把舊對話整理成記憶，不會替角色回覆玩家。</small>
          <div id="memory-model-advanced" class="hidden" style="margin-top:10px">
            <label>另一個模型的名稱代碼
              <input id="memory-summary-model" placeholder="例如：gemini-2.5-flash">
            </label>
            <small class="note">這就是常見的 Model ID。不是 API Key，而是你的 API 服務商用來辨認模型的名稱。請填服務商提供的模型名稱。</small>
          </div>
        </div>

        <div>
          <label>NPC、事件和狀態要用哪個模型整理？
            <select id="state-model-choice">
              <option value="same">跟聊天用同一個模型（推薦）</option>
              <option value="custom">改用另一個模型</option>
            </select>
          </label>
          <small class="note">它只整理世界狀態，不影響主要故事的文筆和角色回覆。</small>
          <div id="state-model-advanced" class="hidden" style="margin-top:10px">
            <label>另一個模型的名稱代碼
              <input id="state-summary-model" placeholder="例如：gemini-2.5-flash-lite">
            </label>
            <small class="note">如果不知道要填什麼，就回到上面選「跟聊天用同一個模型」。</small>
          </div>
        </div>
      </div>`;
    step.appendChild(box);

    document.getElementById("memory-model-choice")?.addEventListener("change", () => syncAdvanced("memory-model-choice", "memory-model-advanced"));
    document.getElementById("state-model-choice")?.addEventListener("change", () => syncAdvanced("state-model-choice", "state-model-advanced"));
  };

  const patchConfig = () => {
    if (App.__modelRoutingPatched) return;
    const original = App.collectConfig.bind(App);
    App.collectConfig = function() {
      const config = original();
      config.memory = config.memory || {};
      config.cost = config.cost || {};

      const memoryChoice = document.getElementById("memory-model-choice")?.value || "same";
      const stateChoice = document.getElementById("state-model-choice")?.value || "same";
      config.memory.summaryModel = memoryChoice === "custom"
        ? (document.getElementById("memory-summary-model")?.value.trim() || "")
        : "";
      config.cost.stateModel = stateChoice === "custom"
        ? (document.getElementById("state-summary-model")?.value.trim() || "")
        : "";
      return config;
    };
    App.__modelRoutingPatched = true;
  };

  const restoreInputs = () => {
    const memoryInput = document.getElementById("memory-summary-model");
    const stateInput = document.getElementById("state-summary-model");
    const memoryChoice = document.getElementById("memory-model-choice");
    const stateChoice = document.getElementById("state-model-choice");

    const savedMemory = App.config?.memory?.summaryModel || "";
    const savedState = App.config?.cost?.stateModel || "";

    if (memoryInput) memoryInput.value = savedMemory;
    if (stateInput) stateInput.value = savedState;
    if (memoryChoice) memoryChoice.value = savedMemory ? "custom" : "same";
    if (stateChoice) stateChoice.value = savedState ? "custom" : "same";

    syncAdvanced("memory-model-choice", "memory-model-advanced");
    syncAdvanced("state-model-choice", "state-model-advanced");
  };

  const init = () => {
    injectControls();
    patchConfig();
    restoreInputs();
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 30));
  else setTimeout(init, 30);
})();
