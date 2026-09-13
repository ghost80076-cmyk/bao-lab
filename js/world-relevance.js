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
    if (this.config?.narrativeMode !== "world" && this.config?.displayMode !== "ui") return base;

    const picked = window.BAOWorldModules.compactRelevantForPrompt(getLatestUserText(), {
      maxModules: 3,
      maxChars: 2200,
      consumeViewed: true
    });

    GameState.current.lastRelevantModules = picked.ids || [];
    if (!picked.text) return base;

    return base + "\n\n【本輪相關世界資料】\n" + picked.text + "\n只把這些資料視為目前事實；不要為了提到資料而刻意改變劇情。";
  };

  window.BAOWorldRelevance = { getLatestUserText };
})();