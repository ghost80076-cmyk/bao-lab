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
        // The helper can fail or be waiting for its interval; show that rather
        // than silently leaving old status values looking authoritative.
        if (document.querySelector('.ui-tab[data-panel="npc"]')?.classList.contains('active')) {
          this.renderUIPanel('npc');
        }
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
      const loadNativePack = () => {
        if (window.BAONativeStatusPacks || document.querySelector('script[src="js/native-status-packs.js"]')) return;
        const script = document.createElement('script');
        script.src = 'js/native-status-packs.js';
        script.onerror = () => console.warn('BAO/LAB native status packs did not load');
        document.head.appendChild(script);
      };
      if (window.BAOStatusUsageIntegrity) loadNativePack();
      else {
        let script = document.querySelector('script[src="js/status-usage-integrity.js"]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'js/status-usage-integrity.js';
          script.onerror = () => console.warn('BAO/LAB status and usage diagnostics did not load');
          document.head.appendChild(script);
        }
        script.addEventListener('load', loadNativePack, { once: true });
      }
    }, 0);
  };

  if (document.readyState === "loading") window.addEventListener("DOMContentLoaded", init);
  else init();
})();
