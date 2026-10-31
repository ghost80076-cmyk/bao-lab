// Share the pending load promise across enhancement chains. A <script> element
// inserted by this loader is not ready until its load event fires.
const baoScriptLoads = new Map();
const loadBAOScript = src => {
  const pending = baoScriptLoads.get(src);
  if (pending) return pending;
  // Parser-loaded scripts from index.html have already executed before site-ui.js.
  // Do not infer that dynamically inserted scripts are ready: those are in the map.
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = error => { script.remove?.(); reject(error); };
    document.head.appendChild(script);
  }).catch(error => {
    // A failed script must not permanently block an explicit retry.
    baoScriptLoads.delete(src);
    throw error;
  });
  baoScriptLoads.set(src, promise);
  return promise;
};

const STORY_LIBRARY_SRC = "js/story-library.js?v=12";
window.BAOEnsureStoryLibrary = () => {
  if (window.BAOStoryLibrary) return Promise.resolve(window.BAOStoryLibrary);
  return loadBAOScript(STORY_LIBRARY_SRC).then(() => {
    if (!window.BAOStoryLibrary) throw new Error("故事書庫程式未完成初始化，請重新整理頁面。");
    return window.BAOStoryLibrary;
  }).catch(error => {
    if (error instanceof Error && error.message.includes("故事書庫")) throw error;
    throw new Error("故事書庫模組載入失敗。請按「重新讀取」再試；不要清除瀏覽器網站資料。");
  });
};

// Failure isolation for optional UI tools; never mark the world engine as
// healthy after a failed dependency. Keep diagnostics in memory only.
const baoExtensionHealth = { world: "loading", story: "loading", optional: {} };
window.BAOExtensionLoadHealth = Object.freeze({
  snapshot: () => ({
    world: baoExtensionHealth.world,
    story: baoExtensionHealth.story,
    optional: { ...baoExtensionHealth.optional }
  })
});
const loadBAOOptionalGroup = (name, sources) =>
  sources.reduce((chain, src) => chain.then(() => loadBAOScript(src)), Promise.resolve())
    .then(() => { baoExtensionHealth.optional[name] = "ready"; })
    .catch(err => {
      baoExtensionHealth.optional[name] = "unavailable";
      console.warn(`YoruBay optional ${name} is unavailable:`, err);
    });

const warnWorldUnavailable = () => window.BAOFeedback?.notify?.(
  "世界狀態模組載入不完整，人物與世界狀態可能無法更新。請重新整理頁面後再繼續故事。",
  "error"
);
const reportWorldFailure = err => {
  baoExtensionHealth.world = "unavailable";
  console.warn("YoruBay world-state extensions are unavailable:", err);
  // Use the existing view wrapper so a later Start/Resume shows the warning.
  if (typeof App !== "undefined" && typeof App.wrapShowView === "function") {
    App.wrapShowView("site-ui:world-loading-warning", (next, view, ...args) => {
      const result = next(view, ...args);
      if (view === "chat") warnWorldUnavailable();
      return result;
    });
  }
  if (document.getElementById("chat-view")?.classList.contains("active")) warnWorldUnavailable();
};

const warnStoryUnavailable = () => {
  const loading = baoExtensionHealth.story === "loading";
  return notifyPlayer(
    loading
      ? "故事核心功能仍在載入。為避免部分設定、記憶或角色規則漏套用，暫時不送出；載入完成後再試一次。"
      : "故事核心模組載入不完整。為避免設定、記憶或角色規則漏套用，本次已停止送出；請重新整理頁面。",
    "error"
  );
};
const reportStoryFailure = err => {
  baoExtensionHealth.story = "unavailable";
  console.warn("YoruBay story extensions are unavailable:", err);
  if (document.getElementById("chat-view")?.classList.contains("active")) warnStoryUnavailable();
};

let baoFeedbackTimer = 0;
const notifyPlayer = (message, tone = "info") => {
  let toast = document.getElementById("bao-feedback-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "bao-feedback-toast";
    toast.className = "bao-feedback-toast";
    document.body.appendChild(toast);
  }
  toast.textContent = String(message || "");
  toast.dataset.tone = tone;
  toast.setAttribute("role", tone === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", tone === "error" ? "assertive" : "polite");
  toast.hidden = false;
  window.clearTimeout(baoFeedbackTimer);
  baoFeedbackTimer = window.setTimeout(() => { toast.hidden = true; }, tone === "error" ? 6500 : 3600);
  return true;
};

const requestPlayerText = ({ title = "輸入名稱", label = "名稱", value = "", confirmLabel = "確認" } = {}) => new Promise(resolve => {
  document.getElementById("bao-text-request")?.remove();
  const dialog = document.createElement("dialog");
  dialog.id = "bao-text-request";
  dialog.className = "bao-text-request";
  dialog.innerHTML = '<form method="dialog"><h2></h2><label><span></span><input type="text" maxlength="100" autocomplete="off"></label><div class="bao-text-request-actions"><button type="button" class="secondary" data-cancel>取消</button><button type="submit" class="primary"></button></div></form>';
  dialog.querySelector("h2").textContent = title;
  dialog.querySelector("label span").textContent = label;
  const input = dialog.querySelector("input");
  input.value = String(value || "");
  dialog.querySelector('[type="submit"]').textContent = confirmLabel;
  document.body.appendChild(dialog);
  let settled = false;
  const finish = result => {
    if (settled) return;
    settled = true;
    if (dialog.open) dialog.close();
    dialog.remove();
    resolve(result);
  };
  dialog.querySelector("form").addEventListener("submit", event => { event.preventDefault(); finish(input.value); });
  dialog.querySelector("[data-cancel]").addEventListener("click", () => finish(null));
  dialog.addEventListener("cancel", event => { event.preventDefault(); finish(null); });
  dialog.addEventListener("click", event => { if (event.target === dialog) finish(null); });
  dialog.showModal();
  input.focus();
  input.select();
});

window.BAOFeedback = Object.freeze({ notify: notifyPlayer, requestText: requestPlayerText });

window.addEventListener("DOMContentLoaded", () => {
  // Fail closed while prompt/memory/story Hook installation is incomplete.
  // The wrapper stays installed but becomes transparent once the chain is ready.
  if (typeof App !== "undefined" && typeof App.wrapSendMessage === "function") {
    App.wrapSendMessage("site-ui:story-extension-readiness", (next, ...args) => {
      if (baoExtensionHealth.story === "ready") return next(...args);
      warnStoryUnavailable();
      return null;
    });
  }
  // Entering a story while hooks are loading or failed always surfaces the state.
  if (typeof App !== "undefined" && typeof App.wrapShowView === "function") {
    App.wrapShowView("site-ui:story-extension-readiness", (next, view, ...args) => {
      const result = next(view, ...args);
      if (view === "chat" && baoExtensionHealth.story !== "ready") warnStoryUnavailable();
      return result;
    });
  }
  // Later wrappers may run auxiliary model work before delegating to sendMessage.
  // Block transport too, while preserving the explicit setup connection test.
  if (typeof API !== "undefined" && typeof API.wrapSend === "function") {
    API.wrapSend("site-ui:story-extension-readiness", async (next, config, messages, ...rest) => {
      if (config?.__connectionTest || baoExtensionHealth.story === "ready") {
        return next(config, messages, ...rest);
      }
      const error = new Error(baoExtensionHealth.story === "loading"
        ? "故事核心功能仍在載入，暫時不送出模型請求。"
        : "故事核心模組載入不完整，已停止模型請求；請重新整理頁面。");
      error.code = "BAO_STORY_EXTENSIONS_NOT_READY";
      throw error;
    });
  }
  // Experience 3.0 is a presentation layer; load early for the landing page
  // without coupling it to the story/Provider initialization chain.
  loadBAOScript("js/experience-preferences-core.js?v=2")
    .then(() => loadBAOScript("js/experience-preferences.js?v=4"))
    .catch(err => console.warn("YoruBay experience preferences unavailable:", err));
  loadBAOScript("js/chat-api-settings.js?v=3")
    .then(() => loadBAOScript("js/model-discovery.js?v=4"))
    .catch(err => console.warn("BAO/LAB chat API settings or model discovery failed to load:", err));
  loadBAOScript("js/autonomous-world-workbench.js")
    .then(() => loadBAOScript("js/autonomous-world-display.js"))
    .catch(err => console.warn("BAO/LAB autonomous world workbench or display failed to load:", err));
  const worldModulesReady = loadBAOScript("js/global-bridge.js?v=8")
    .then(() => loadBAOScript("js/world-state.js?v=4"))
    .then(() => loadBAOScript("js/character-status.js?v=5"))
    .then(() => loadBAOScript("js/three-realms-cultivation-core.js?v=1"))
    .then(() => loadBAOScript("js/three-realms-event-profiles.js?v=6"))
    .then(() => loadBAOScript("js/three-realms-events-core.js?v=6"))
    .then(() => loadBAOScript("js/world-modules.js?v=10"))
    .then(() => loadBAOScript("js/world-clock.js?v=1"))
    .then(() => loadBAOScript("js/world-state-cost.js?v=11"))
    .then(() => loadBAOScript("js/same-model-state-merge.js?v=14"))
    .then(() => loadBAOScript("js/world-module-ui.js?v=11"))
    .then(() => loadBAOScript("js/world-module-manager.js?v=11"))
    .then(() => loadBAOScript("js/world-relevance.js?v=6"))
    .then(() => loadBAOScript("js/character-status-ui.js?v=12"))
    .then(() => loadBAOScript("js/world-state-hook.js?v=7"))
    .then(() => { baoExtensionHealth.world = "ready"; })
    .catch(reportWorldFailure);
  loadBAOScript("js/cost-control.js?v=7")
    .then(() => loadBAOScript("js/provider-browser-compat.js"))
    .then(() => loadBAOScript("js/model-routing.js?v=11"))
    .then(() => loadBAOScript("js/provider-diagnostics.js"))
    .then(() => loadBAOScript("js/credits-pilot.js?v=1"))
    .catch(err => console.warn("BAO/LAB cost, provider compatibility, model routing or Hosted credits controls failed to load:", err));
  loadBAOScript("js/storage-write-guard.js?v=3")
    .then(() => loadBAOScript("js/chat-shell-fix.js?v=2"))
    .then(() => loadBAOScript("js/player-settings.js?v=13"))
    .then(() => loadBAOScript("js/player-text-replace-mod.js?v=2"))
    .then(() => loadBAOScript("js/narrative-settings.js?v=15"))
    .then(() => loadBAOScript("js/memory-workbench-core.js?v=12"))
    .then(() => loadBAOOptionalGroup("full-story-memory-rebuild", ["js/full-story-memory-rebuild-core.js?v=2", "js/full-story-memory-rebuild.js?v=3"]))
    .then(() => loadBAOScript("js/memory-workbench-ai.js?v=4"))
    .then(() => loadBAOScript("js/canon-workbench.js?v=5"))
    .then(() => loadBAOScript("js/memory-workbench-simplify.js?v=4"))
    .then(() => loadBAOScript("js/chat-markup.js?v=5"))
    .then(() => loadBAOScript("js/story-tools.js?v=12"))
    .then(() => window.BAOEnsureStoryLibrary())
    .then(() => loadBAOScript("js/context-pack-resume.js?v=3"))
    .then(() => loadBAOScript("js/story-backup.js?v=4"))
    .then(() => loadBAOOptionalGroup("google-drive", ["js/google-drive-config.js", "js/google-drive-sync.js"]))
    .then(() => loadBAOScript("js/prompt-cache.js?v=11"))
    .then(() => loadBAOScript("js/prompt-orchestrator.js?v=8"))
    .then(() => loadBAOScript("js/episodic-memory.js?v=4"))
    .then(() => worldModulesReady)
    .then(() => loadBAOScript("js/story-timeline.js?v=2"))
    .then(() => loadBAOScript("js/npc-timeline.js?v=5"))
    .then(() => loadBAOScript("js/three-realms-events.js?v=3"))
    .then(() => loadBAOScript("js/worldbook-library-core.js?v=8"))
    .then(() => loadBAOScript("js/worldbook-library.js?v=14"))
    .then(() => loadBAOScript("js/story-reader.js?v=13"))
    .then(() => loadBAOOptionalGroup("conversation-search", ["js/conversation-search-core.js?v=4", "js/conversation-search.js?v=4"]))
    .then(() => loadBAOOptionalGroup("inspiration-copy", ["js/inspiration-copy.js"]))
    .then(() => loadBAOScript("js/story-revision-state.js?v=10"))
    .then(() => loadBAOScript("js/story-history.js?v=2"))
    .then(() => loadBAOScript("js/story-branches.js?v=2"))
    .then(() => loadBAOScript("js/streaming-ui.js?v=7"))
    .then(() => loadBAOScript("js/request-lifecycle.js?v=4"))
    .then(() => loadBAOScript("js/chat-tool-navigation.js?v=17"))
    .then(() => loadBAOScript("js/chat-experience-repairs.js?v=6"))
    .then(() => loadBAOOptionalGroup("story-quick-commands", ["js/story-quick-commands-core.js?v=3", "js/story-quick-commands.js?v=8"]))
    .then(() => loadBAOOptionalGroup("mobile-reading-layout", ["js/mobile-reading-layout.js?v=25"]))
    .then(() => loadBAOScript("js/story-actor-pack-core.js?v=3"))
    .then(() => loadBAOScript("js/story-actors-general-pack.js?v=1"))
    .then(() => loadBAOScript("js/three-realms-story-actor-pack.js?v=1"))
    .then(() => loadBAOScript("js/story-persona-manager.js?v=15"))
    .then(() => loadBAOOptionalGroup("avatar-chat", ["js/avatar-chat.js?v=1"]))
    .then(() => loadBAOScript("js/context-efficiency-core.js?v=1"))
    .then(() => loadBAOOptionalGroup("context-diagnostics", ["js/context-inspector.js?v=8", "js/context-health-core.js?v=4", "js/context-health.js?v=11"]))
    .then(() => loadBAOScript("js/commentary-mods-core.js?v=2"))
    .then(() => loadBAOScript("js/commentary-mods-general-pack.js?v=1"))
    .then(() => loadBAOScript("js/commentary-mods.js?v=5"))
    .then(() => loadBAOScript("js/interpretation-mods-core.js?v=1"))
    .then(() => loadBAOScript("js/interpretation-mods-official-pack.js?v=1"))
    .then(() => loadBAOScript("js/interpretation-mods.js?v=4"))
    .then(() => loadBAOScript("js/actor-mode-core.js?v=1"))
    .then(() => loadBAOScript("js/actor-mode.js?v=2"))
    .then(() => loadBAOScript("js/story-extensions-core.js?v=5"))
    .then(() => loadBAOScript("js/story-extension-pack-core.js?v=2"))
    .then(() => loadBAOScript("js/story-extension-pack.js"))
    .then(() => loadBAOScript("js/story-extensions-center.js?v=7"))
    .then(() => loadBAOScript("js/settings-effects-core.js?v=1"))
    .then(() => loadBAOScript("js/settings-effects.js?v=4"))
    .then(() => loadBAOScript("js/story-control-center-core.js?v=2"))
    .then(() => loadBAOScript("js/story-control-center.js?v=13"))
    .then(() => loadBAOScript("js/request-ledger.js?v=2"))
    .then(() => { baoExtensionHealth.story = "ready"; })
    .catch(reportStoryFailure);
  loadBAOScript("js/work-package-core.js?v=2")
    .then(() => loadBAOScript("js/character-library.js?v=3"))
    .then(() => loadBAOScript("js/character-readiness.js"))
    .then(() => loadBAOScript("js/character-import-upgrade.js?v=3"))
    .then(() => loadBAOScript("js/work-package.js?v=2"))
    .then(() => loadBAOScript("js/device-transfer.js?v=2"))
    .then(() => loadBAOScript("js/author-diagnostics.js"))
    .catch(err => console.warn("BAO/LAB character library, import, device transfer or author diagnostics failed to load:", err));
  loadBAOScript("js/bao-character.js?v=1")
    .then(() => loadBAOScript("js/brand-ui.js?v=12"))
    .then(() => new Promise(resolve => setTimeout(resolve, 100)))
    .then(() => loadBAOScript("js/bao-guide.js?v=4"))
    .then(() => loadBAOScript("js/bao-mascot.js?v=6"))
    .then(() => loadBAOOptionalGroup("stage-capabilities", ["js/stage-capability-core.js?v=3", "js/stage-capability.js?v=3"]))
    .then(() => loadBAOScript("js/reader-context.js?v=7"))
    .then(() => loadBAOScript("js/bao-visual-ui.js?v=19"))
    .then(() => loadBAOScript("js/player-shell-v2.js?v=15"))
    .then(() => loadBAOScript("js/player-builder-v2.js?v=9"))
    .then(() => loadBAOScript("js/quick-start-mode.js?v=3"))
    .then(() => loadBAOScript("js/story-start-readiness-core.js"))
    .then(() => loadBAOScript("js/story-start-readiness.js?v=2"))
    .catch(err => console.warn("BAO/LAB brand, mascot, Player 2.0 UI or story-start readiness failed to load:", err));
  setTimeout(async () => {
    await Storage.ready();
    const refresh = () => {
      const has = Storage.hasStory();
      document.getElementById("continue-story")?.classList.toggle("hidden", !has);
      document.getElementById("home-continue")?.classList.toggle("hidden", !has);
    };

    const resumeSave = save => {
      if (window.BAOChatAPISettings?.restore) return window.BAOChatAPISettings.restore(save);
      alert("API 設定功能尚未載入。請重新整理頁面後再讀取存檔。");
      return false;
    };

    document.getElementById("continue-story")?.addEventListener("click", () => resumeSave(Storage.loadStory()));
    document.getElementById("home-continue")?.addEventListener("click", () => resumeSave(Storage.loadStory()));

    const confirmSlot = async (slot, successText) => {
      if (!slot) { notifyPlayer("目前沒有可儲存的故事。", "error"); return; }
      try {
        await Storage.flush();
        const mode = Storage.status().mode;
        let stored = mode === "indexedDB";
        if (mode === "localStorage") {
          try {
            const slots = JSON.parse(localStorage.getItem(Storage.prefix + Storage.slotsKey) || "[]");
            stored = Array.isArray(slots) && slots.some(item => item.id === slot.id);
          } catch { stored = false; }
        }
        notifyPlayer(stored ? successText : "無法確認存檔已寫入，請立即匯出完整故事備份。", stored ? "success" : "error");
      } catch (error) {
        console.warn("BAO/LAB slot persistence verification failed:", error);
        notifyPlayer("無法確認存檔已寫入，請立即匯出完整故事備份。", "error");
      }
    };

    const renderSlots = () => {
      const box = document.getElementById("slot-list");
      if (!box) return;
      const slots = Storage.listSlots();
      box.innerHTML = slots.length ? slots.map(s => `<div class="note" style="margin-top:8px"><b>${App.escapeHTML(s.label || "未命名存檔")}</b><br>${App.escapeHTML(s.characterName || s.characterId)} · ${new Date(s.savedAt).toLocaleString("zh-TW")}<br><button class="text-button" data-load-slot="${s.id}">讀取</button> <button class="text-button" data-export-slot="${s.id}">匯出</button> <button class="text-button" data-delete-slot="${s.id}">刪除</button></div>`).join("") : '<div class="note" style="margin-top:8px">目前沒有手動存檔。</div>';
      box.querySelectorAll("[data-load-slot]").forEach(b => b.onclick = () => resumeSave(Storage.getSlot(b.dataset.loadSlot)));
      box.querySelectorAll("[data-export-slot]").forEach(b => b.onclick = () => Storage.exportSave(Storage.getSlot(b.dataset.exportSlot)));
      box.querySelectorAll("[data-delete-slot]").forEach(b => b.onclick = () => {
        const s = Storage.getSlot(b.dataset.deleteSlot);
        if (s && confirm(`確定刪除「${s.label || "未命名存檔"}」？`)) { Storage.deleteSlot(b.dataset.deleteSlot); renderSlots(); }
      });
    };

    const picker = document.getElementById("import-save-file");
    document.getElementById("save-slot-button")?.addEventListener("click", async event => {
      if (!App.activeCharacter || !GameState.current) { notifyPlayer("目前沒有進行中的故事。", "error"); return; }
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const label = await requestPlayerText({
          title: "另存手動備份",
          label: "存檔名稱",
          value: `${App.activeCharacter.name} · ${new Date().toLocaleString("zh-TW")}`,
          confirmLabel: "儲存備份"
        });
        if (label === null) return;
        const slot = Storage.saveSlot(label.trim() || "未命名存檔");
        renderSlots();
        await confirmSlot(slot, "手動備份已確認寫入這台裝置。");
      } finally {
        button.disabled = false;
      }
    });
    document.getElementById("list-slots-button")?.addEventListener("click", renderSlots);

    document.getElementById("import-save-button")?.addEventListener("click", () => picker?.click());
    picker?.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try {
        const save = await Storage.importFile(file);
        const slot = Storage.importSlot(save);
        renderSlots();
        await confirmSlot(slot, "存檔匯入並確認寫入完成。");
      } catch (err) { notifyPlayer(err.message || "匯入失敗。", "error"); }
      finally { picker.value = ""; }
    });

    document.querySelectorAll(".adult-filter").forEach(btn => btn.addEventListener("click", e => {
      if (window.BAOContentPreferences?.isAdultContentEnabled?.()) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      window.BAOContentPreferences?.guard?.({ rating: "adult" });
    }), true);

    refresh();
    window.BAORefreshSaveUI = refresh;
  }, 180);
});