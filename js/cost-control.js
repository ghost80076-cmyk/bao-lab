(() => {
  const numberValue = (id, fallback = 0) => {
    const n = Number(document.getElementById(id)?.value);
    return Number.isFinite(n) ? n : fallback;
  };

  const getCostConfig = () => ({
    inputPerMillion: numberValue("cost-input", 0),
    outputPerMillion: numberValue("cost-output", 0),
    cachePerMillion: numberValue("cost-cache", 0),
    usdTwd: numberValue("cost-fx", 32),
    budgetTwd: numberValue("cost-budget", 0),
    stateInterval: Math.max(1, numberValue("state-interval", 2))
  });

  const estimate = (usage = {}, cfg = getCostConfig()) => {
    const input = Number(usage.prompt_tokens ?? usage.prompt ?? 0);
    const output = Number(usage.completion_tokens ?? usage.completion ?? 0);
    const cached = Math.min(input, Number(usage.cached_tokens ?? usage.cached ?? 0));
    const nonCached = Math.max(0, input - cached);
    const usd = (nonCached * cfg.inputPerMillion + output * cfg.outputPerMillion + cached * cfg.cachePerMillion) / 1000000;
    return { usd, twd: usd * cfg.usdTwd };
  };

  const cumulativeCost = () => {
    const cfg = App?.config?.cost || getCostConfig();
    return estimate(Chat?.usage || {}, cfg);
  };

  const render = () => {
    if (typeof Chat === "undefined") return;
    const cost = cumulativeCost();
    const cfg = App?.config?.cost || getCostConfig();
    const usd = document.getElementById("usage-cost-usd");
    const twd = document.getElementById("usage-cost-twd");
    const budget = document.getElementById("usage-budget");
    if (usd) usd.textContent = cost.usd > 0 ? `$${cost.usd.toFixed(4)}` : "—";
    if (twd) twd.textContent = cost.twd > 0 ? `NT$${cost.twd.toFixed(2)}` : "—";
    if (budget) {
      if (!cfg.budgetTwd) budget.textContent = "未設定";
      else {
        const ratio = cost.twd / cfg.budgetTwd;
        budget.textContent = `NT$${cost.twd.toFixed(2)} / ${cfg.budgetTwd.toFixed(0)}${ratio >= .8 ? " ⚠" : ""}`;
      }
    }
  };

  const injectControls = () => {
    const step = document.querySelector('[data-step-panel="5"]');
    if (!step || document.getElementById("cost-budget")) return;
    const box = document.createElement("div");
    box.className = "cost-control-box";
    box.innerHTML = `
      <h3>Token 成本控制</h3>
      <p class="note">單價由你依目前使用的模型或中轉站填入，避免網站內建價格過期。0 代表只統計 Token、不估算金額。</p>
      <div class="form-grid">
        <label>輸入單價（USD / 1M tokens）<input id="cost-input" type="number" min="0" step="0.01" value="0"></label>
        <label>輸出單價（USD / 1M tokens）<input id="cost-output" type="number" min="0" step="0.01" value="0"></label>
        <label>Cache 單價（USD / 1M tokens）<input id="cost-cache" type="number" min="0" step="0.01" value="0"></label>
        <label>USD → TWD 換算<input id="cost-fx" type="number" min="1" step="0.1" value="32"></label>
        <label>本次故事預算上限（NT$）<input id="cost-budget" type="number" min="0" step="1" value="0"><small>0 = 不限制</small></label>
        <label>世界狀態整理間隔（輪）<input id="state-interval" type="number" min="1" max="20" step="1" value="2"><small>數字越大，額外 API 呼叫越少。</small></label>
      </div>`;
    step.appendChild(box);
  };

  const injectUsage = () => {
    const bar = document.querySelector(".usage-bar");
    if (!bar || document.getElementById("usage-cost-twd")) return;
    bar.insertAdjacentHTML("beforeend", '<span>估算 USD <b id="usage-cost-usd">—</b></span><span>估算台幣 <b id="usage-cost-twd">—</b></span><span>預算 <b id="usage-budget">未設定</b></span>');
  };

  const patchConfig = () => {
    if (typeof App === "undefined" || App.__costConfigPatched) return;
    const original = App.collectConfig.bind(App);
    App.collectConfig = function() {
      const config = original();
      config.cost = getCostConfig();
      return config;
    };
    App.__costConfigPatched = true;
  };

  const patchUsage = () => {
    if (typeof Chat === "undefined" || Chat.__costUsagePatched) return;
    const original = Chat.addUsage.bind(Chat);
    Chat.addUsage = function(usage = {}) {
      const result = original(usage);
      render();
      return result;
    };
    const originalRender = Chat.renderUsage.bind(Chat);
    Chat.renderUsage = function(lastUsage = {}) {
      originalRender(lastUsage);
      render();
    };
    Chat.__costUsagePatched = true;
  };

  const patchBudget = () => {
    if (typeof API === "undefined" || API.__budgetPatched) return;
    const original = API.send.bind(API);
    API.send = async function(config, messages) {
      const cfg = App?.config?.cost;
      const current = typeof Chat !== "undefined" ? cumulativeCost() : { twd: 0 };
      if (cfg?.budgetTwd > 0 && current.twd >= cfg.budgetTwd) {
        throw new Error(`已達本次故事預算上限 NT$${cfg.budgetTwd.toFixed(0)}。可提高預算或改用較便宜的模型後繼續。`);
      }
      const previousPrompt = typeof Chat !== "undefined" ? Chat.lastStoryPromptTokens : 0;
      const result = await original(config, messages);
      if (config?.__auxiliaryTask && typeof Chat !== "undefined") {
        Chat.lastStoryPromptTokens = previousPrompt;
        if (typeof App !== "undefined" && App.config) Chat.protectedRounds(App.config);
      }
      return result;
    };
    API.__budgetPatched = true;
  };

  const init = () => {
    injectControls();
    injectUsage();
    patchConfig();
    patchUsage();
    patchBudget();
    render();
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 20));
  else setTimeout(init, 20);
})();
