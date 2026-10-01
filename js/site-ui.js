const loadBAOScript = src => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const script = document.createElement("script");
  script.src = src;
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
});

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
  loadBAOScript("js/chat-api-settings.js?v=3")
    .then(() => loadBAOScript("js/model-discovery.js"))
    .catch(err => console.warn("BAO/LAB chat API settings or model discovery failed to load:", err));
  loadBAOScript("js/autonomous-world-workbench.js")
    .then(() => loadBAOScript("js/autonomous-world-display.js"))
    .catch(err => console.warn("BAO/LAB autonomous world workbench or display failed to load:", err));
  loadBAOScript("js/global-bridge.js")
    .then(() => loadBAOScript("js/world-state.js"))
    .then(() => loadBAOScript("js/character-status.js?v=2"))
    .then(() => loadBAOScript("js/world-modules.js"))
    .then(() => loadBAOScript("js/world-state-cost.js"))
    .then(() => loadBAOScript("js/same-model-state-merge.js"))
    .then(() => loadBAOScript("js/world-module-ui.js"))
    .then(() => loadBAOScript("js/world-module-manager.js?v=2"))
    .then(() => loadBAOScript("js/world-relevance.js"))
    .then(() => loadBAOScript("js/character-status-ui.js?v=3"))
    .then(() => loadBAOScript("js/world-state-hook.js"))
    .catch(err => console.warn("BAO/LAB world state or character status modules failed to load:", err));
  loadBAOScript("js/cost-control.js")
    .then(() => loadBAOScript("js/provider-browser-compat.js"))
    .then(() => loadBAOScript("js/model-routing.js?v=3"))
    .then(() => loadBAOScript("js/provider-diagnostics.js"))
    .catch(err => console.warn("BAO/LAB cost, provider compatibility, model routing or provider diagnostics controls failed to load:", err));
  loadBAOScript("js/storage-write-guard.js?v=2")
    .then(() => loadBAOScript("js/chat-shell-fix.js?v=3"))
    .then(() => loadBAOScript("js/player-settings.js?v=4"))
    .then(() => loadBAOScript("js/player-text-replace-mod.js?v=2"))
    .then(() => loadBAOScript("js/narrative-settings.js?v=3"))
    .then(() => loadBAOScript("js/memory-workbench-core.js?v=2"))
    .then(() => loadBAOScript("js/memory-workbench-ai.js"))
    .then(() => loadBAOScript("js/canon-workbench.js"))
    .then(() => loadBAOScript("js/memory-workbench-simplify.js?v=2"))
    .then(() => loadBAOScript("js/chat-markup.js"))
    .then(() => loadBAOScript("js/story-tools.js?v=3"))
    .then(() => loadBAOScript("js/context-pack-resume.js"))
    .then(() => loadBAOScript("js/story-library.js"))
    .then(() => loadBAOScript("js/story-backup.js"))
    .then(() => loadBAOScript("js/google-drive-config.js"))
    .then(() => loadBAOScript("js/google-drive-sync.js"))
    .then(() => loadBAOScript("js/prompt-cache.js"))
    .then(() => loadBAOScript("js/prompt-orchestrator.js"))
    .then(() => loadBAOScript("js/story-reader.js?v=4"))
    .then(() => loadBAOScript("js/conversation-search-core.js"))
    .then(() => loadBAOScript("js/conversation-search.js"))
    .then(() => loadBAOScript("js/inspiration-copy.js"))
    .then(() => loadBAOScript("js/story-revision-state.js"))
    .then(() => loadBAOScript("js/story-branches.js?v=2"))
    .then(() => loadBAOScript("js/streaming-ui.js"))
    .then(() => loadBAOScript("js/request-lifecycle.js"))
    .then(() => loadBAOScript("js/chat-tool-navigation.js"))
    .then(() => loadBAOScript("js/chat-experience-repairs.js?v=2"))
    .then(() => loadBAOScript("js/story-quick-commands-core.js"))
    .then(() => loadBAOScript("js/story-quick-commands.js?v=2"))
    .then(() => loadBAOScript("js/mobile-reading-layout.js?v=16"))
    .then(() => loadBAOScript("js/story-persona-manager.js?v=2"))
    .then(() => loadBAOScript("js/context-health-core.js"))
    .then(() => loadBAOScript("js/context-health.js?v=2"))
    .then(() => loadBAOScript("js/story-extensions-core.js"))
    .then(() => loadBAOScript("js/story-extension-pack-core.js"))
    .then(() => loadBAOScript("js/story-extension-pack.js"))
    .then(() => loadBAOScript("js/story-extensions-center.js?v=2"))
    .then(() => loadBAOScript("js/story-control-center-core.js"))
    .then(() => loadBAOScript("js/story-control-center.js?v=2"))
    .catch(err => console.warn("BAO/LAB local preview, narrative settings, memory workbench, story tools, story library, story reader or chat markup failed to load:", err));
  loadBAOScript("js/character-library.js")
    .then(() => loadBAOScript("js/character-readiness.js"))
    .then(() => loadBAOScript("js/character-import-upgrade.js"))
    .then(() => loadBAOScript("js/device-transfer.js"))
    .then(() => loadBAOScript("js/author-diagnostics.js"))
    .catch(err => console.warn("BAO/LAB character library, import, device transfer or author diagnostics failed to load:", err));
  loadBAOScript("js/brand-ui.js?v=6")
    .then(() => new Promise(resolve => setTimeout(resolve, 100)))
    .then(() => loadBAOScript("js/bao-mascot.js?v=4"))
    .then(() => loadBAOScript("js/bao-visual-ui.js?v=5"))
    .then(() => loadBAOScript("js/player-shell-v2.js?v=3"))
    .then(() => loadBAOScript("js/player-builder-v2.js?v=4"))
    .then(() => loadBAOScript("js/story-start-readiness-core.js"))
    .then(() => loadBAOScript("js/story-start-readiness.js"))
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
      if (localStorage.getItem("bao-lab:adult-confirmed") === "yes") {
        document.getElementById("adult-notice")?.classList.remove("hidden");
        return;
      }
      e.stopImmediatePropagation();
      if (confirm("此分類為 18+ 成人內容。請確認你已年滿 18 歲。")) {
        localStorage.setItem("bao-lab:adult-confirmed", "yes");
        document.getElementById("adult-notice")?.classList.remove("hidden");
        App.renderCharacters(btn.dataset.filter);
        document.querySelectorAll(".filter").forEach(x=>x.classList.remove("active"));
        btn.classList.add("active");
      }
    }), true);

    refresh();
    window.BAORefreshSaveUI = refresh;
  }, 180);
});
