(() => {
  const profiles = {
    economy: { rounds: 12, budget: 16000, interval: 8, label: "預期用量較低 · 較早轉為摘要，細節較精簡。" },
    balanced: { rounds: 20, budget: 32000, interval: 4, label: "預期用量中等 · 兼顧近期細節與長期連續性。" },
    long: { rounds: 40, budget: 64000, interval: 6, label: "預期用量較高 · 保留更多原文；記憶仍取決於模型整理品質。" }
  };
  const field = id => document.getElementById(id);
  const selected = () => document.querySelector('[name="memory-strength"]:checked')?.value || "custom";
  const modelBudget = preset => {
    const known = Number(preset?.context_window || preset?.contextWindow || 0);
    return known > 0 ? Math.max(1000, Math.floor(known * 0.75)) : Infinity;
  };
  const describe = () => {
    const label = field("memory-mode")?.selectedOptions?.[0]?.textContent || "智慧整理";
    if (field("memory-mode-label")) field("memory-mode-label").textContent = label;
    if (field("memory-profile-description")) field("memory-profile-description").textContent = profiles[selected()]?.label || "依照你的進階設定運作。";
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
    ["model-select", "api-type", "model-id", "base-url"].forEach(id => field(id)?.addEventListener("change", () => { if (selected() !== "custom") apply(); }));
    describe();
    mount();
  });
  window.BAOMemoryPreferences = { mount, profiles, modelBudget };
})();
