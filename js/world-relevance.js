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
      ? base + "\n\n【目前核心狀態】\n" + core + "\n【僅供內部參考，不得照抄】\n以上是已建立的世界事實，不是要呈現給玩家的表格或輸出格式。只需正常續寫可感知的故事、人物對話與行動，不得重印此標題、JSON、鍵名或整份數值清單；原生狀態 UI 會自行顯示。不要重新詢問或重設既定內容。"
      : base;
    if (this.config?.narrativeMode !== "world" && this.config?.displayMode !== "ui") return prompt;

    const picked = window.BAOWorldModules.compactRelevantForPrompt(getLatestUserText(), {
      maxModules: 3,
      maxChars: 2200,
      consumeViewed: true
    });

    GameState.current.lastRelevantModules = picked.ids || [];
    if (!picked.text) return prompt;

    return prompt + "\n\n【本輪相關世界資料】\n" + picked.text + "\n只把這些資料視為目前事實；不要為了提到資料而刻意改變劇情。";
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
  loadBAOScript('js/lorebook.js?v=2').catch(err => console.warn('BAO/LAB lorebook failed to load:', err));
}
