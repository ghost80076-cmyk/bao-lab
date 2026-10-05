(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || !window.BAOWorldModules) return;

  const originalBuild = App.buildSystemPrompt.bind(App);

  const getLatestUserText = () => {
    const messages = Chat.messages || [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]?.role === "user") return String(messages[i].content || "");
    }
    return "";
  };

  App.buildSystemPrompt = function() {
    const base = originalBuild();
    if (!GameState.current) return base;

    const core = window.BAOWorldModules.compactForPrompt();
    let prompt = core
      ? base + "\n\n【目前核心狀態】\n" + core + "\n以上是已建立的結構化事實；直接延續，不要重新詢問或重設。"
      : base;
    if (this.config?.narrativeMode !== "world" && this.config?.displayMode !== "ui") return prompt;

    const picked = window.BAOWorldModules.compactRelevantForPrompt(getLatestUserText(), {
      maxModules: 3,
      maxChars: 2200,
      consumeViewed: true
    });

    GameState.current.lastRelevantModules = picked.ids || [];
    if (!picked.text) return prompt;\n\n    return prompt + "\n\n【本輪相關世界資料】\n" + picked.text + "\n只把這些資料視為目前事實；不要為了提到資料而刻意改變劇情。";
  };

  document.addEventListener("click", event => {
    const button = event.target.closest?.(".module-tab[data-panel^='module:']");
    if (!button || !GameState.current) return;
    const id = String(button.dataset.panel || "").slice(7);
    const def = (GameState.current.moduleDefinitions || []).find(item => item.id === id);
    if (def?.context === "relevant") GameState.current.uiContextModule = id;
  });

  window.BAOWorldRelevance = { getLatestUserText };
})();

// The world-state startup chain loads this after world-module-manager.js.
// Keep the optional data-only MOD editor separate from the tracker and prompts.
if (typeof loadBAOScript === 'function') {
  loadBAOScript('js/world-mod-packs.js').catch(err => console.warn('BAO/LAB MOD packs failed to load:', err));
  loadBAOScript('js/lorebook.js').catch(err => console.warn('BAO/LAB lorebook failed to load:', err));
}
