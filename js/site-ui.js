window.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    const refresh = () => {
      const has = Storage.hasStory();
      document.getElementById("continue-story")?.classList.toggle("hidden", !has);
      document.getElementById("home-continue")?.classList.toggle("hidden", !has);
    };

    const resumeSave = save => {
      if (!Storage.restoreStory(save)) { alert("無法讀取存檔。"); return; }
      const key = window.prompt("API Key 不會寫入存檔。請重新貼上 API Key：", "");
      if (key === null) return;
      App.config.api.key = key.trim();
      if (GameState.current) GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView("chat");
    };

    document.getElementById("continue-story")?.addEventListener("click", () => App.resumeSavedStory?.());
    document.getElementById("home-continue")?.addEventListener("click", () => App.resumeSavedStory?.());

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

    document.getElementById("save-slot-button")?.addEventListener("click", () => {
      if (!App.activeCharacter || !GameState.current) { alert("目前沒有進行中的故事。"); return; }
      const label = prompt("輸入存檔名稱：", `${App.activeCharacter.name} · ${new Date().toLocaleString("zh-TW")}`);
      if (label === null) return;
      Storage.saveSlot(label.trim() || "未命名存檔");
      renderSlots();
      alert("已建立手動存檔。");
    });
    document.getElementById("list-slots-button")?.addEventListener("click", renderSlots);

    const picker = document.getElementById("import-save-file");
    document.getElementById("import-save-button")?.addEventListener("click", () => picker?.click());
    picker?.addEventListener("change", async () => {
      const file = picker.files?.[0];
      if (!file) return;
      try { const save = await Storage.importFile(file); Storage.importSlot(save); renderSlots(); alert("存檔匯入完成。"); }
      catch (err) { alert(err.message || "匯入失敗。"); }
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
        document.querySelectorAll(".filter").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
      }
    }), true);

    refresh();
    window.BAORefreshSaveUI = refresh;
  }, 180);
});
