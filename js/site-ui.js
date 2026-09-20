const loadBAOScript = src => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
  const script = document.createElement("script");
  script.src = src;
  script.onload = resolve;
  script.onerror = reject;
  document.head.appendChild(script);
});

window.addEventListener("DOMContentLoaded", () => {
  loadBAOScript("js/chat-api-settings.js")
    .then(() => loadBAOScript("js/model-discovery.js"))
    .catch(err => console.warn("BAO/LAB chat API settings or model discovery failed to load:", err));
  loadBAOScript("js/autonomous-world-workbench.js")
    .then(() => loadBAOScript("js/autonomous-world-display.js"))
    .catch(err => console.warn("BAO/LAB autonomous world workbench or display failed to load:", err));
  loadBAOScript("js/global-bridge.js")
    .then(() => loadBAOScript("js/world-state.js"))
    .then(() => loadBAOScript("js/character-status.js"))
    .then(() => loadBAOScript("js/world-modules.js"))
    .then(() => loadBAOScript("js/world-state-cost.js"))
    .then(() => loadBAOScript("js/world-module-ui.js"))
    .then(() => loadBAOScript("js/world-module-manager.js"))
    .then(() => loadBAOScript("js/world-relevance.js"))
    .then(() => loadBAOScript("js/character-status-ui.js"))
    .then(() => loadBAOScript("js/world-state-hook.js"))
    .catch(err => console.warn("BAO/LAB world state or character status modules failed to load:", err));
  loadBAOScript("js/cost-control.js")
    .then(() => loadBAOScript("js/provider-browser-compat.js"))
    .then(() => loadBAOScript("js/model-routing.js"))
    .then(() => loadBAOScript("js/provider-diagnostics.js"))
    .catch(err => console.warn("BAO/LAB cost, provider compatibility, model routing or provider diagnostics controls failed to load:", err));
  loadBAOScript("js/storage-write-guard.js")
    .then(() => loadBAOScript("js/chat-shell-fix.js"))
    .then(() => loadBAOScript("js/player-settings.js"))
    .then(() => loadBAOScript("js/narrative-settings.js"))
    .then(() => loadBAOScript("js/memory-workbench-core.js"))
    .then(() => loadBAOScript("js/memory-workbench-ai.js"))
    .then(() => loadBAOScript("js/canon-workbench.js"))
    .then(() => loadBAOScript("js/chat-markup.js"))
    .then(() => loadBAOScript("js/story-tools.js"))
    .then(() => loadBAOScript("js/context-pack-resume.js"))
    .then(() => loadBAOScript("js/story-library.js"))
    .then(() => loadBAOScript("js/story-backup.js"))
    .then(() => loadBAOScript("js/prompt-cache.js"))
    .then(() => loadBAOScript("js/story-reader.js"))
    .then(() => loadBAOScript("js/inspiration-copy.js"))
    .then(() => loadBAOScript("js/story-revision-state.js"))
    .then(() => loadBAOScript("js/story-branches.js"))
    .then(() => loadBAOScript("js/streaming-ui.js"))
    .then(() => loadBAOScript("js/request-lifecycle.js"))
    .then(() => loadBAOScript("js/chat-tool-navigation.js"))
    .then(() => loadBAOScript("js/chat-experience-repairs.js"))
    .then(() => loadBAOScript("js/mobile-reading-layout.js"))
    .catch(err => console.warn("BAO/LAB local preview, narrative settings, memory workbench, story tools, story library, story reader or chat markup failed to load:", err));
  loadBAOScript("js/character-readiness.js")
    .then(() => loadBAOScript("js/character-import-upgrade.js"))
    .then(() => loadBAOScript("js/author-diagnostics.js"))
    .catch(err => console.warn("BAO/LAB character readiness, import or author diagnostics failed to load:", err));
  loadBAOScript("js/brand-ui.js")
    .then(() => new Promise(resolve => setTimeout(resolve, 100)))
    .then(() => loadBAOScript("js/bao-mascot.js"))
    .then(() => loadBAOScript("js/bao-visual-ui.js"))
    .catch(err => console.warn("BAO/LAB brand or mascot UI failed to load:", err));
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
      if (!slot) { alert("目前沒有可儲存的故事。"); return; }
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
        alert(stored ? successText : "無法確認存檔已寫入，請立即匯出完整故事備份。");
      } catch (error) {
        console.warn("BAO/LAB slot persistence verification failed:", error);
        alert("無法確認存檔已寫入，請立即匯出完整故事備份。");
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
    document.getElementById("save-slot-button")?.addEventListener("click", () => {
      if (!App.activeCharacter || !GameState.current) { alert("目前沒有進行中的故事。"); return; }
      const label = prompt("輸入存檔名稱：", `${App.activeCharacter.name} · ${new Date().toLocaleString("zh-TW")}`);
      if (label === null) return;
      const slot = Storage.saveSlot(label.trim() || "未命名存檔");
      renderSlots();
      void confirmSlot(slot, "手動存檔已確認寫入這台裝置。");
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
      } catch (err) { alert(err.message || "匯入失敗。"); }
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