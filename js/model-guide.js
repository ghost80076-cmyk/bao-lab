(() => {
  if (typeof App === "undefined") return;

  const ensureCSS = () => {
    if (document.querySelector('link[href="css/model-guide.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/model-guide.css";
    document.head.appendChild(link);
  };

  const money = value => Number.isFinite(Number(value)) ? `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 4 })}` : "—";

  const cacheLabel = value => ({
    automatic: "自動 / Prefix Cache",
    supported: "支援快取",
    explicit: "需顯式 Prompt Cache",
    "provider-dependent": "依路由供應商",
    "model-dependent": "依模型",
    unknown: "未知"
  }[value] || "依服務商");

  const currentPreset = () => App.getSelectedPreset?.() || null;

  const injectHomeGuide = () => {
    const home = document.getElementById("home-view");
    const hero = home?.querySelector(".hero");
    if (!home || !hero || document.getElementById("home-model-guide")) return;
    const section = document.createElement("section");
    section.id = "home-model-guide";
    section.className = "model-guide-home";
    section.innerHTML = `
      <div class="model-guide-head"><div><div class="eyebrow">BYOK MODEL GUIDE</div><h2>不用最貴的模型，也能玩長篇。</h2></div><p>主模型負責演戲；記憶與狀態可以交給更便宜的輔助模型。快取命中時，重複角色設定與前綴通常能省下大量輸入成本。</p></div>
      <div class="model-tier-grid">
        <article><span>極省</span><b>Qwen 3.7 Flash / MiMo V2.5</b><p>適合高頻長篇、摘要與狀態整理。尤其適合作為輔助模型。</p></article>
        <article><span>高 CP</span><b>DeepSeek V4 Flash / MiniMax M3</b><p>成本仍低，適合世界模擬與大量互動。</p></article>
        <article><span>高品質</span><b>Gemini 3.1 Pro / Claude Sonnet 4.6</b><p>重要劇情、角色一致性、細膩關係描寫可優先考慮。</p></article>
        <article><span>豪華</span><b>Claude Opus 4.6</b><p>高預算、高難度場景。通常不必拿來做狀態整理。</p></article>
      </div>
      <div class="model-guide-note">價格會隨官方、區域與中轉供應商調整。BAO/LAB 只提供參考與自動填值，實際帳單以你的 API 服務商為準。</div>`;
    hero.insertAdjacentElement("afterend", section);
  };

  const injectAPIAdvisor = () => {
    const step = document.querySelector('[data-step-panel="4"]');
    if (!step || document.getElementById("model-advisor")) return;
    const box = document.createElement("div");
    box.id = "model-advisor";
    box.className = "model-advisor";
    const grid = step.querySelector(".form-grid");
    grid?.insertAdjacentElement("afterend", box);
    renderAdvisor();
  };

  const renderAdvisor = () => {
    const box = document.getElementById("model-advisor");
    if (!box) return;
    const p = currentPreset();
    if (!p) { box.innerHTML = "<span class='note'>選擇模型後，這裡會顯示用途、快取與價格參考。</span>"; return; }
    const price = p.pricing;
    const routeText = p.route === "official" ? "官方直連" : p.route === "router" ? "中轉 / 統一路由" : "自訂連線";
    box.innerHTML = `
      <div class="model-advisor-top"><div><span class="model-badge">${App.escapeHTML(p.badge || routeText)}</span><b>${App.escapeHTML(p.label || p.model || "自訂模型")}</b></div><span>${App.escapeHTML(routeText)}</span></div>
      <p>${App.escapeHTML(p.use_case || "依你的需求自行設定。")}</p>
      <div class="model-facts">
        <span><small>快取</small><b>${App.escapeHTML(cacheLabel(p.cache))}</b></span>
        <span><small>Input / 1M</small><b>${price ? money(price.input) : "自行查價"}</b></span>
        <span><small>Cache / 1M</small><b>${price ? money(price.cache) : "—"}</b></span>
        <span><small>Output / 1M</small><b>${price ? money(price.output) : "自行查價"}</b></span>
      </div>
      ${price?.note ? `<div class="model-price-note">${App.escapeHTML(price.note)}</div>` : ""}
      ${p.docs_url ? `<a class="model-doc-link" href="${App.escapeAttr(p.docs_url)}" target="_blank" rel="noopener">查看服務商價格 / 文件 ↗</a>` : ""}`;
  };

  const autoFillCost = () => {
    const p = currentPreset();
    if (!p?.pricing) return;
    const values = { "cost-input": p.pricing.input, "cost-output": p.pricing.output, "cost-cache": p.pricing.cache };
    Object.entries(values).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input || !Number.isFinite(Number(value))) return;
      input.value = String(value);
      input.dataset.autoModelPrice = p.model || p.label || "preset";
    });
  };

  const addQuickAdvice = () => {
    const step = document.querySelector('[data-step-panel="4"]');
    if (!step || document.getElementById("api-route-advice")) return;
    const details = document.createElement("details");
    details.id = "api-route-advice";
    details.className = "api-route-advice";
    details.innerHTML = `<summary>不知道該選官方還是中轉？</summary>
      <div><b>官方 API</b><p>來源、隱私政策與計費最清楚；若你只固定使用一家模型，通常最單純。</p></div>
      <div><b>OpenRouter</b><p>一把 Key 可以切換多家模型，也能使用路由與備援；不同 provider 的價格、速度與快取可能不同。</p></div>
      <div><b>其他中轉 / 自訂 API</b><p>可能更便宜，也可能有自訂模型；但請自行確認是否保存對話、是否量化模型、實際倍率與退款規則。</p></div>`;
    step.appendChild(details);
  };

  const patchPresetSync = () => {
    if (App.__modelGuideSyncPatched || typeof App.syncSelectedPreset !== "function") return;
    const original = App.syncSelectedPreset.bind(App);
    App.syncSelectedPreset = function() {
      const result = original();
      setTimeout(() => { renderAdvisor(); autoFillCost(); }, 0);
      return result;
    };
    App.__modelGuideSyncPatched = true;
  };

  const init = () => {
    ensureCSS();
    injectHomeGuide();
    injectAPIAdvisor();
    addQuickAdvice();
    patchPresetSync();
    renderAdvisor();
    autoFillCost();
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", () => setTimeout(init, 90));
  else setTimeout(init, 90);
})();
