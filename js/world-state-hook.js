(() => {
  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      if (!window.App || !window.WorldStateEngine || App.__worldStateHooked) return;
      const originalSend = App.sendMessage.bind(App);
      App.sendMessage = async function() {
        const beforeCount = Chat.messages.length;
        await originalSend();
        if (Chat.messages.length < beforeCount + 2) return;
        const player = Chat.messages[Chat.messages.length - 2];
        const assistant = Chat.messages[Chat.messages.length - 1];
        if (player?.role !== "user" || assistant?.role !== "assistant") return;
        const changed = await WorldStateEngine.update(this.config, player.content, assistant.content);
        if (!changed) return;
        if (this.config.displayMode === "ui") {
          const panel = document.querySelector(".ui-tab.active")?.dataset.panel || "npc";
          this.renderUIPanel(panel);
        }
        this.saveStory(false);
      };
      App.__worldStateHooked = true;
    }, 0);
  });
})();
