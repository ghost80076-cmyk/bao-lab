(() => {
  const init = () => {
    setTimeout(() => {
      if (!window.App || !window.WorldStateEngine || App.__worldStateHooked) return;
      const dispatched = new WeakMap();
      const signature = messages => JSON.stringify(messages.map(m => [m.id, m.role, m.content, m.context_content || ""]));
      const worldStateWrapper = async function(next, ...args) {
        const owner = GameState.current;
        const config = this.config;
        const beforeCount = Chat.messages.length;
        const before = signature(Chat.messages);
        const receipt = await next(...args);
        if (!owner || GameState.current !== owner || this.config !== config) return receipt;
        let player, assistant;
        if (receipt?.kind === "bao:story-turn") {
          if (receipt.owner !== owner || receipt.config !== config || !receipt.isCurrent()) return receipt;
          const index = Chat.messages.findIndex(m => m.id === receipt.playerId);
          player = Chat.messages[index];
          assistant = Chat.messages[index + 1];
          if (index < 0 || assistant?.id !== receipt.assistantId || player.content !== receipt.playerText || assistant.content !== receipt.assistantText) return receipt;
        } else {
          // Mixed-cache legacy cores have no receipt. Only an unambiguous pair
          // after an unchanged prefix is eligible; never guess from the tail.
          if (this.storyTurnReceipts || Chat.messages.length !== beforeCount + 2
            || signature(Chat.messages.slice(0, beforeCount)) !== before) return receipt;
          [player, assistant] = Chat.messages.slice(beforeCount);
        }
        if (player?.role !== "user" || assistant?.role !== "assistant") return receipt;
        const seen = dispatched.get(owner) || new Set();
        dispatched.set(owner, seen);
        const key = assistant.id || assistant;
        if (seen.has(key)) return receipt;
        // Reserve before awaiting: a second continuation may see this same pair
        // while the first state request is still in flight.
        seen.add(key);
        const changed = await WorldStateEngine.update(config, player.content, assistant.content);
        if (GameState.current !== owner || this.config !== config) return receipt;
        // The helper can fail or be waiting for its interval; show that rather
        // than silently leaving old status values looking authoritative.
        if (document.querySelector('.ui-tab[data-panel="npc"]')?.classList.contains('active')) {
          this.renderUIPanel('npc');
        }
        const pendingChanged = WorldStateEngine.takePersistenceHint?.();
        if (!changed) {
          if (pendingChanged) this.saveStory(false);
          return receipt;
        }
        if (this.config.displayMode === "ui") {
          const panel = document.querySelector(".ui-tab.active")?.dataset.panel || "npc";
          this.renderUIPanel(panel);
        }
        this.saveStory(false);
        return receipt;
      };
      if (typeof App.wrapSendMessage === "function") {
        App.wrapSendMessage("world-state-hook:after-turn", worldStateWrapper);
      } else {
        // Compatibility fallback for a mixed-cache page where world-state-hook is newer than app.js.
        const originalSend = App.sendMessage.bind(App);
        App.sendMessage = (...args) => worldStateWrapper.call(App, originalSend, ...args);
      }
      App.__worldStateHooked = true;
      // Modules are global lexical consts in the original classic scripts.
      // The optional repair scripts check window members: publish references
      // after all original modules have loaded, before loading the repairs.
      if (typeof Storage !== 'undefined') window.Storage = Storage;
      if (typeof API !== 'undefined') window.API = API;
      if (typeof BAOCharacterStatus !== 'undefined') window.BAOCharacterStatus = BAOCharacterStatus;
      if (typeof BAOHelperData !== 'undefined') window.BAOHelperData = BAOHelperData;
      for (const src of ['js/story-integrity-fixes.js?v=2', 'js/state-tracker-repairs.js?v=2']) {
        if (document.querySelector(`script[src="${src}"]`)) continue;
        const script = document.createElement('script');
        script.src = src;
        script.onerror = () => console.warn(`BAO/LAB repair module did not load: ${src}`);
        document.head.appendChild(script);
      }
      // The scene renderer may mount after this script and its private refresh
      // function may replace the native board with the one-line legacy label.
      // Watch only its native host; never observe or rewrite chat messages.
      const watchNativeHost = () => {
        const host = document.getElementById('bao-scene-native-status');
        if (!host || host.dataset.nativePackWatched) return;
        host.dataset.nativePackWatched = 'true';
        new MutationObserver(() => {
          if (window.BAOSceneHTML?.prefs?.status !== 'native' || host.querySelector('.bao-native-status-board')) return;
          window.BAONativeStatusPacks?.hookScene?.();
          window.BAONativeStatusPacks?.paintSceneStatus?.();
        }).observe(host, { childList: true });
        window.BAONativeStatusPacks?.hookScene?.();
        window.BAONativeStatusPacks?.paintSceneStatus?.();
      };
      const afterNativeLoad = () => {
        watchNativeHost();
        const scope = document.getElementById('chat-view');
        if (scope && !scope.dataset.nativePackMountWatched) {
          scope.dataset.nativePackMountWatched = 'true';
          new MutationObserver(watchNativeHost).observe(scope, { childList: true, subtree: true });
        }
      };
      const loadNativePack = () => {
        if (window.BAONativeStatusPacks) { afterNativeLoad(); return; }
        let script = document.querySelector('script[src="js/native-status-packs.js"]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'js/native-status-packs.js';
          script.onerror = () => console.warn('BAO/LAB native status packs did not load');
          document.head.appendChild(script);
        }
        script.addEventListener('load', afterNativeLoad, { once: true });
      };
      if (window.BAOStatusUsageIntegrity) loadNativePack();
      else {
        let script = document.querySelector('script[src="js/status-usage-integrity.js?v=2"]');
        if (!script) {
          script = document.createElement('script');
          script.src = 'js/status-usage-integrity.js?v=2';
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
