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
    maxOutputTokens: Math.max(64, numberValue("max-output-tokens", 4096)),
    stateInterval: Math.max(1, numberValue("state-interval", 2))
  });

  const normalizeUrl = value => String(value || "").trim().replace(/\/+$/, "");
  const finiteOrNull = value => value === null || value === undefined || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
  const pricingFrom = value => {
    if (!value || typeof value !== "object") return null;
    const input = finiteOrNull(value.input ?? value.inputPerMillion);
    const output = finiteOrNull(value.output ?? value.outputPerMillion);
    const cache = finiteOrNull(value.cache ?? value.cachePerMillion);
    if (input === null || output === null) return null;
    return { input, output, cache: cache === null ? input : cache };
  };
  const manualMainPricing = cfg => {
    const input = finiteOrNull(cfg?.inputPerMillion), output = finiteOrNull(cfg?.outputPerMillion);
    if (input === null || output === null || (input <= 0 && output <= 0)) return null;
    return { input, output, cache: Math.max(0, finiteOrNull(cfg?.cachePerMillion) ?? input) };
  };
  const presetPricing = entry => {
    const model = String(entry?.model || "");
    const endpoint = normalizeUrl(entry?.baseUrl);
    const preset = (App?.modelPresets || []).find(item =>
      item?.model === model && (!endpoint || normalizeUrl(item?.base_url) === endpoint) && item?.pricing
    );
    return pricingFrom(preset?.pricing);
  };
  const sameAsMain = entry => {
    const main = App?.config?.api || {};
    return String(entry?.model || "") === String(main.model || "") &&
      normalizeUrl(entry?.baseUrl) === normalizeUrl(main.baseUrl);
  };
  const entryPricing = (entry, cfg) =>
    pricingFrom(entry?.pricing) || presetPricing(entry) || (sameAsMain(entry) ? manualMainPricing(cfg) : null);

  const estimate = (usage = {}, cfg = getCostConfig(), pricing = null) => {
    const rates = pricing || manualMainPricing(cfg);
    if (!rates) return { usd: 0, twd: 0, priced: false };
    const input = finiteOrNull(usage.input_tokens ?? usage.prompt_tokens ?? usage.prompt);
    const output = finiteOrNull(usage.output_tokens ?? usage.completion_tokens ?? usage.completion);
    if (input === null || output === null) return { usd: 0, twd: 0, priced: false, unknownUsage: true };
    const cachedRaw = finiteOrNull(usage.cached_tokens ?? usage.cached);
    const cached = cachedRaw === null ? 0 : Math.min(input, Math.max(0, cachedRaw));
    const nonCached = Math.max(0, input - cached);
    const usd = (nonCached * rates.input + output * rates.output + cached * rates.cache) / 1000000;
    return { usd, twd: usd * Number(cfg?.usdTwd || 32), priced: true };
  };

  const cumulativeCost = () => {
    const cfg = App?.config?.cost || getCostConfig();
    const ledger = Array.isArray(Chat?.usageLedger) ? Chat.usageLedger : [];
    if (!ledger.length) {
      const legacy = estimate(Chat?.usage || {}, cfg);
      return {
        usd: legacy.usd,
        twd: legacy.twd,
        actualUsd: 0,
        estimatedUsd: legacy.usd,
        actualCalls: 0,
        estimatedCalls: legacy.priced && (Chat?.usage?.total || Chat?.usage?.prompt || Chat?.usage?.completion) ? 1 : 0,
        unpricedCalls: legacy.priced ? 0 : ((Chat?.usage?.total || Chat?.usage?.prompt || Chat?.usage?.completion) ? 1 : 0),
        unknownUsageCalls: legacy.unknownUsage ? 1 : 0,
        legacy: Boolean(Chat?.usage?.total || Chat?.usage?.prompt || Chat?.usage?.completion)
      };
    }
    let actualUsd = 0, estimatedUsd = 0, actualCalls = 0, estimatedCalls = 0, unpricedCalls = 0, unknownUsageCalls = 0;
    for (const entry of ledger) {
      const charged = finiteOrNull(entry?.actualUsd);
      if (charged !== null && charged >= 0) {
        actualUsd += charged;
        actualCalls += 1;
        continue;
      }
      const pricing = entryPricing(entry, cfg);
      const result = estimate({
        input_tokens: entry?.input,
        output_tokens: entry?.output,
        cached_tokens: entry?.cached
      }, cfg, pricing);
      if (result.priced) {
        estimatedUsd += result.usd;
        estimatedCalls += 1;
      } else {
        unpricedCalls += 1;
        if (result.unknownUsage) unknownUsageCalls += 1;
      }
    }
    const usd = actualUsd + estimatedUsd;
    return {
      usd,
      twd: usd * Number(cfg?.usdTwd || 32),
      actualUsd,
      estimatedUsd,
      actualCalls,
      estimatedCalls,
      unpricedCalls,
      unknownUsageCalls,
      legacy: false
    };
  };

  const render = () => {
    if (typeof Chat === "undefined") return;
    const cost = cumulativeCost();
    const cfg = App?.config?.cost || getCostConfig();
    const usd = document.getElementById("usage-cost-usd");
    const twd = document.getElementById("usage-cost-twd");
    const budget = document.getElementById("usage-budget");
    const integrity = document.querySelector("[data-cost-integrity]");
    const hasKnownCost = cost.actualCalls + cost.estimatedCalls > 0;
    if (usd) usd.textContent = hasKnownCost ? `${cost.usd.toFixed(4)}` : "—";
    if (twd) twd.textContent = hasKnownCost ? `NT${cost.twd.toFixed(2)}` : "—";
    if (integrity) {
      const parts = [];
      if (cost.actualCalls) parts.push(`YoruBay 實扣 ${cost.actualCalls} 次：${cost.actualUsd.toFixed(4)}`);
      if (cost.estimatedCalls) parts.push(`依各模型費率估算 ${cost.estimatedCalls} 次：${cost.estimatedUsd.toFixed(4)}`);
      if (cost.unpricedCalls) parts.push(`⚠ ${cost.unpricedCalls} 次請求缺少可用費率／用量，未計入金額`);
      if (cost.legacy) parts.push("舊存檔沒有逐請求帳本；既有累積值只能按主模型單價估算");
      integrity.textContent = parts.length ? parts.join(" · ") : "尚無可計價請求。Token 與費用以服務商帳單為最終依據。";
    }
    if (budget) {
      if (!cfg.budgetTwd) budget.textContent = "未設定";
      else {
        const ratio = cost.twd / cfg.budgetTwd;
        const unknown = cost.unpricedCalls ? " · 有未計價請求" : "";
        budget.textContent = `NT${cost.twd.toFixed(2)} / ${cfg.budgetTwd.toFixed(0)}${ratio >= .8 ? " ⚠" : ""}${unknown}`;
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
        <label>單次最大輸出 Token<input id="max-output-tokens" type="number" min="64" max="32768" step="64" value="4096"><small>降低可直接限制每次回覆的最大成本。</small></label>
        <label>世界狀態整理間隔（輪）<input id="state-interval" type="number" min="1" max="20" step="1" value="2"><small>數字越大，額外 API 呼叫越少。</small></label>
      </div>`;
    step.appendChild(box);
  };

  const injectUsage = () => {
    const bar = document.querySelector(".usage-bar");
    if (!bar || document.getElementById("usage-cost-twd")) return;
    bar.insertAdjacentHTML("beforeend", '<span>已知成本 USD <b id="usage-cost-usd">—</b></span><span>已知成本台幣 <b id="usage-cost-twd">—</b></span><span>預算 <b id="usage-budget">未設定</b></span><span class="note" data-cost-integrity>尚無可計價請求。</span>');
  };

  const patchConfig = () => {
    if (typeof App === "undefined" || App.__costConfigPatched) return;
    const original = App.collectConfig.bind(App);
    App.collectConfig = function() {
      const config = original();
      config.cost = getCostConfig();
      config.api.maxOutputTokens = config.cost.maxOutputTokens;
      return config;
    };
    App.__costConfigPatched = true;
  };

  const patchUsage = () => {
    if (typeof Chat === "undefined" || Chat.__costUsagePatched) return;
    const original = Chat.addUsage.bind(Chat);
    Chat.addUsage = function(usage = {}, kind = "all") {
      const result = original(usage, kind);
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
      if (!config?.__connectionTest && cfg?.budgetTwd > 0 && current.twd >= cfg.budgetTwd) {
        throw new Error(`已達本次故事預算上限 NT$${cfg.budgetTwd.toFixed(0)}。可提高預算或改用較便宜的模型後繼續。`);
      }
      const effective = { ...config };
      // State extraction can require a longer JSON document than other helper tasks.
      // Keep the tracker's own requested limit, up to 2400; never apply the 700-token cap to it.
      if (effective.__stateTask) effective.maxOutputTokens = Math.min(Number(effective.maxOutputTokens || 1800), 2400);
      else if (effective.__auxiliaryTask) effective.maxOutputTokens = Math.min(Number(effective.maxOutputTokens || 700), 700);
      if (effective.__memoryTask) effective.maxOutputTokens = Math.min(Number(effective.maxOutputTokens || 1800), 1800);
      const previousPrompt = typeof Chat !== "undefined" ? Chat.lastStoryPromptTokens : 0;
      const result = await original(effective, messages);
      if (effective.__auxiliaryTask && typeof Chat !== "undefined") {
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

  window.BAOCostControl = { estimate, cumulativeCost, entryPricing };
  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 20));
  else setTimeout(init, 20);
})();
