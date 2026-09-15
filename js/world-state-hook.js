(() => {
  const init = () => {
    setTimeout(() => {
      if (!window.App || !window.WorldStateEngine || App.__worldStateHooked) return;
      const originalSend = App.sendMessage.bind(App);
      App.sendMessage = async function() {
        const owner = GameState.current;
        const beforeCount = Chat.messages.length;
        await originalSend();
        if (GameState.current !== owner || Chat.messages.length < beforeCount + 2) return;
        const player = Chat.messages[Chat.messages.length - 2];
        const assistant = Chat.messages[Chat.messages.length - 1];
        if (player?.role !== "user" || assistant?.role !== "assistant") return;
        const changed = await WorldStateEngine.update(this.config, player.content, assistant.content);
        if (GameState.current !== owner) return;
        const pendingChanged = WorldStateEngine.takePersistenceHint?.();
        const previousSummary = Chat.summary;
        await Chat.afterTurn?.(this.config);
        const memoryChanged = previousSummary !== Chat.summary;
        const memoryLabel = document.getElementById("usage-memory");
        if (memoryLabel) memoryLabel.textContent = Chat.memoryStatus(this.config.memory.maxRounds);
        if (!changed) {
          if (pendingChanged || memoryChanged) this.saveStory(false);
          return;
        }
        if (this.config.displayMode === "ui") {
          const panel = document.querySelector(".ui-tab.active")?.dataset.panel || "npc";
          this.renderUIPanel(panel);
        }
        this.saveStory(false);
      };
      App.__worldStateHooked = true;
    }, 0);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init);
  else init();
})();

