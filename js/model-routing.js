(() => {
  if (typeof App === "undefined") return;

  const injectControls = () => {
    const step = document.querySelector('[data-step-panel="5"]');
    if (!step || document.getElementById("memory-summary-model")) return;

    const box = document.createElement("div");
    box.className = "cost-control-box";
    box.innerHTML = `
      <h3>整理模型</h3>
      <p class="note">聊天模型負責續寫故事；記憶整理與世界狀態可以改用另一個模型。留空就沿用聊天模型與同一組 API 連線。</p>
      <div class="form-grid">
        <label>記憶摘要 Model ID
          <input id="memory-summary-model" placeholder="留空＝跟聊天模型相同">
          <small>適合指定便宜、快速的模型處理長期記憶。</small>
        </label>
        <label>世界狀態整理 Model ID
          <input id="state-summary-model" placeholder="留空＝跟聊天模型相同">
          <small>只影響 NPC／事件／狀態整理，不影響主要故事回覆。</small>
        </label>
      </div>`;
    step.appendChild(box);
  };

  const patchConfig = () => {
    if (App.__modelRoutingPatched) return;
    const original = App.collectConfig.bind(App);
    App.collectConfig = function() {
      const config = original();
      config.memory = config.memory || {};
      config.cost = config.cost || {};
      config.memory.summaryModel = document.getElementById("memory-summary-model")?.value.trim() || "";
      config.cost.stateModel = document.getElementById("state-summary-model")?.value.trim() || "";
      return config;
    };
    App.__modelRoutingPatched = true;
  };

  const restoreInputs = () => {
    const memory = document.getElementById("memory-summary-model");
    const state = document.getElementById("state-summary-model");
    if (memory && App.config?.memory?.summaryModel) memory.value = App.config.memory.summaryModel;
    if (state && App.config?.cost?.stateModel) state.value = App.config.cost.stateModel;
  };

  const init = () => {
    injectControls();
    patchConfig();
    restoreInputs();
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 30));
  else setTimeout(init, 30);
})();
