(() => {
  const profiles = {
    economy: { rounds: 12, budget: 16000, interval: 8, label: "預期用量較低 · 較早轉為摘要，細節較精簡。" },
    balanced: { rounds: 20, budget: 32000, interval: 4, label: "預期用量中等 · 兼顧近期細節與長期連續性。" },
    long: { rounds: 40, budget: 64000, interval: 6, label: "預期用量較高 · 保留更多原文；記憶仍取決於模型整理品質。" }
  };
  const field = id => document.getElementById(id);
  const selected = () => document.querySelector('[name="memory-strength"]:checked')?.value || "custom";
  const hostedSelected = () => field("api-type")?.value === "bao-credits" || App.getSelectedPreset?.()?.provider === "bao-credits";
  const modelBudget = preset => {
    const known = Number(preset?.context_window || preset?.contextWindow || 0);
    return known > 0 ? Math.max(1000, Math.floor(known * 0.75)) : Infinity;
  };
  const describe = () => {
    const mode = field("memory-mode")?.value || "smart";
    const label = field("memory-mode")?.selectedOptions?.[0]?.textContent || "智慧整理";
    const hosted = hostedSelected();
    if (field("memory-mode-label")) field("memory-mode-label").textContent = label;
    const badge = field("memory-hosted-recommendation");
    if (badge) {
      badge.hidden = !hosted;
      badge.textContent = mode === "smart" ? "推薦 · 長篇故事" : "長篇建議：智慧整理";
    }
    const base = profiles[selected()]?.label || "依照你的進階設定運作。";
    const hostedHint = !hosted ? "" : mode === "smart"
      ? " YoruBay 點數長篇故事預設使用智慧整理；較早內容會在需要時整理成摘要，完整故事仍保留在本機。"
      : " YoruBay 點數長篇故事建議使用智慧整理；目前仍保留你的手動選擇，不會強制切換。";
    if (field("memory-profile-description")) field("memory-profile-description").textContent = base + hostedHint;
  };
  const apply = () => {
    const profile = profiles[selected()];
    if (profile) {
      const preset = App.getSelectedPreset?.();
      const matches = preset?.model && preset.model === field("model-id")?.value && preset.base_url === field("base-url")?.value;
      field("memory-mode").value = "smart";
      field("max-rounds").value = profile.rounds;
      field("max-context").value = Math.min(profile.budget, matches ? modelBudget(preset) : Infinity);
      field("summary-interval").value = profile.interval;
    } else if (field("memory-advanced")) field("memory-advanced").open = true;
    describe();
  };
  const mount = () => {
    const advanced = field("memory-advanced");
    if (!advanced) return;
    // Move the existing controls: IDs, handlers and credentials stay intact.
    document.querySelectorAll('[data-step-panel="5"] > .cost-control-box').forEach(box => advanced.appendChild(box));
  };
  const collect = App.collectConfig.bind(App);
  App.collectConfig = function() {
    const config = collect();
    config.memory.strength = selected();
    config.memory.summaryInterval = Math.max(2, Number(field("summary-interval")?.value || 4));
    return config;
  };
  window.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('[name="memory-strength"]').forEach(input => input.addEventListener("change", apply));
    ["memory-mode", "max-rounds", "max-context", "summary-interval"].forEach(id => field(id)?.addEventListener("change", () => {
      document.querySelector('[name="memory-strength"][value="custom"]').checked = true;
      describe();
    }));
    ["model-select", "api-type", "model-id", "base-url"].forEach(id => field(id)?.addEventListener("change", () => {
      if (selected() !== "custom") apply();
      else describe();
    }));
    describe();
    mount();
  });
  window.BAOMemoryPreferences = { mount, profiles, modelBudget };
})();
