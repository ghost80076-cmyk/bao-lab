(() => {
  if (typeof App === "undefined" || typeof CharacterEngine === "undefined") return;

  App.loadCharacters = async function() {
    const manifest = await (await fetch("data/characters.json")).json();
    const builtIn = await Promise.all(manifest.map(async item => {
      const raw = await (await fetch(item.file)).json();
      const c = CharacterEngine.normalize(raw);
      c.source = "built-in";
      return c;
    }));
    const custom = CharacterEngine.loadCustom();
    const merged = [...custom, ...builtIn];
    const seen = new Set();
    this.characters = merged.filter(c => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    this.renderCharacters("all");
  };

  App.buildSystemPrompt = function() {
    const mode = this.prompts[this.config.narrativeMode];
    return CharacterEngine.composeSystemPrompt(this.activeCharacter, {
      persona: this.config.persona,
      modePrompt: mode?.prompt || "",
      displayMode: this.config.displayMode
    });
  };

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      const explore = document.getElementById("explore-view");
      const head = explore?.querySelector(".section-head");
      if (!explore || !head || document.getElementById("import-character-button")) return;

      const tools = document.createElement("div");
      tools.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 18px";
      tools.innerHTML = '<button id="import-character-button" class="secondary" type="button">匯入角色 JSON</button><button id="manage-character-button" class="secondary" type="button">管理本機角色</button><a class="secondary" href="data/characters/character-template.json" download>下載角色模板</a><input id="import-character-file" type="file" accept="application/json,.json" hidden><span id="character-import-status" class="note"></span><div id="custom-character-list" style="width:100%"></div>';
      head.insertAdjacentElement("afterend", tools);

      const picker = document.getElementById("import-character-file");
      const status = document.getElementById("character-import-status");
      const listBox = document.getElementById("custom-character-list");

      const refreshCharacters = () => {
        const custom = CharacterEngine.loadCustom();
        const builtIn = App.characters.filter(c => c.source !== "local-import");
        const merged = [...custom, ...builtIn];
        const seen = new Set();
        App.characters = merged.filter(c => !seen.has(c.id) && seen.add(c.id));
        App.renderCharacters(document.querySelector(".filter.active")?.dataset.filter || "all");
      };

      const renderCustomList = () => {
        const custom = CharacterEngine.loadCustom();
        listBox.innerHTML = custom.length ? custom.map(c => `<div class="note" style="margin-top:8px"><b>${App.escapeHTML(c.name)}</b> · ${App.escapeHTML(c.id)} · schema ${App.escapeHTML(c.schema_version || "1.0")} <button class="text-button" data-remove-character="${App.escapeAttr(c.id)}">移除</button></div>`).join("") : '<div class="note" style="margin-top:8px">目前沒有本機匯入角色。</div>';
        listBox.querySelectorAll("[data-remove-character]").forEach(btn => btn.addEventListener("click", () => {
          CharacterEngine.removeCustom(btn.dataset.removeCharacter);
          refreshCharacters();
          renderCustomList();
        }));
      };

      document.getElementById("import-character-button").addEventListener("click", () => picker.click());
      document.getElementById("manage-character-button").addEventListener("click", renderCustomList);
      picker.addEventListener("change", async () => {
        const file = picker.files?.[0];
        if (!file) return;
        status.textContent = "匯入中…";
        try {
          const c = await CharacterEngine.importFile(file);
          status.textContent = `✓ 已匯入：${c.name}`;
          refreshCharacters();
          renderCustomList();
        } catch (err) {
          status.textContent = `✕ ${err.message || "匯入失敗"}`;
        } finally {
          picker.value = "";
        }
      });
    }, 220);
  });
})();
