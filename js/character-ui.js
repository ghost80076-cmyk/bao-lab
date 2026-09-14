(() => {
  if (typeof App === "undefined" || typeof CharacterEngine === "undefined") return;

  const categoryMeta = {
    male: { label: "男性向", en: "MALE ORIENTED", desc: "偏遊戲感、世界模擬與角色互動的作品區。", kicker: "GAME / WORLD / INTERACTION" },
    female: { label: "女性向", en: "FEMALE ORIENTED", desc: "偏情感、關係與長篇沉浸敘事的作品區。", kicker: "RELATIONSHIP / STORY / EMOTION" },
    r18: { label: "R18", en: "ADULT AREA", desc: "成人向作品集中於此區，首次進入需確認年齡。", kicker: "18+ / MATURE CONTENT" }
  };

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

  App.renderCharacters = function(filter = "all") {
    const list = document.getElementById("character-list");
    if (!list) return;
    const active = ["male", "female", "r18"].includes(filter) ? filter : "all";
    const chars = active === "all"
      ? this.characters.filter(c => c.category !== "r18")
      : this.characters.filter(c => c.category === active);

    document.getElementById("explore-view")?.setAttribute("data-category-theme", active);
    document.querySelectorAll(".category-portal").forEach(x => x.classList.toggle("active", x.dataset.category === active));

    list.innerHTML = chars.length ? chars.map(c => {
      const meta = categoryMeta[c.category] || categoryMeta.male;
      return `<article class="character-card category-${App.escapeAttr(c.category)}" onclick="App.openCharacter('${App.escapeAttr(c.id)}')">
        <div class="character-image-wrap"><img src="${App.escapeAttr(c.avatar)}" alt="${App.escapeAttr(c.name)}"><span class="category-badge">${App.escapeHTML(meta.label)}</span></div>
        <div class="character-content"><div class="eyebrow">${App.escapeHTML(meta.en)}</div><h3>${App.escapeHTML(c.title || c.name)}</h3><p>${App.escapeHTML(c.description)}</p><div class="tags">${(c.tags || []).map(t => `<span class="tag">#${App.escapeHTML(t)}</span>`).join("")}</div></div>
      </article>`;
    }).join("") : `<div class="empty-category"><b>${active === "all" ? "目前還沒有更多作品" : `${categoryMeta[active].label}目前還沒有作品`}</b><span>之後新增的角色會依 category 自動出現在這裡。</span></div>`;
  };

  App.renderDetail = function() {
    const c = this.activeCharacter;
    if (!c) return;
    const category = ["male", "female", "r18"].includes(c.category) ? c.category : "male";
    const meta = categoryMeta[category];
    document.getElementById("detail-view")?.setAttribute("data-category-theme", category);
    document.getElementById("builder-view")?.setAttribute("data-category-theme", category);
    document.getElementById("chat-view")?.setAttribute("data-category-theme", category);
    document.getElementById("character-detail").innerHTML = `<div class="detail-theme-shell detail-${category}">
      <button class="back-link" type="button" onclick="App.showView('explore')">← 返回作品區</button>
      <div class="detail-theme-layout">
        <div class="detail-visual"><div class="detail-image-frame"><img class="detail-image" src="${this.escapeAttr(c.avatar)}" alt="${this.escapeAttr(c.name)}"><span class="detail-category-badge">${this.escapeHTML(meta.label)}</span></div><div class="detail-side-code">${this.escapeHTML(meta.kicker)}</div></div>
        <div class="detail-copy"><div class="detail-category-line"><span>${this.escapeHTML(meta.en)}</span><i></i></div><h1>${this.escapeHTML(c.title || c.name)}</h1><p class="detail-description">${this.escapeHTML(c.description || "")}</p>${c.quote ? `<div class="quote">${this.escapeHTML(c.quote)}</div>` : ""}<div class="tags">${(c.tags || []).map(t => `<span class="tag">#${this.escapeHTML(t)}</span>`).join("")}</div><div class="detail-actions"><button class="primary detail-start" onclick="App.openBuilder()">開始故事</button><span class="detail-mode-note">${c.supported_modes?.world ? "支援世界模擬" : "單角色沉浸"} · ${c.supported_display?.ui ? "支援互動 UI" : "純文本"}</span></div></div>
      </div></div>`;
  };

  App.buildSystemPrompt = function() {
    const mode = this.prompts[this.config.narrativeMode];
    return CharacterEngine.composeSystemPrompt(this.activeCharacter, {
      persona: this.config.persona,
      modePrompt: mode?.prompt || "",
      displayMode: this.config.displayMode,
      recentMessages: typeof Chat !== "undefined" ? (Chat.messages || []).slice(-12) : []
    });
  };

  function openCategory(category) {
    if (category === "r18" && localStorage.getItem("bao-lab:adult-confirmed") !== "yes") {
      const ok = confirm("此區域包含 R18 成人向作品。請確認你已年滿 18 歲。\n\n這只是年齡自我確認，不是身分驗證。");
      if (!ok) return;
      localStorage.setItem("bao-lab:adult-confirmed", "yes");
    }
    App.renderCharacters(category);
    document.getElementById("character-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      const explore = document.getElementById("explore-view");
      const head = explore?.querySelector(".section-head");
      if (!explore || !head || document.getElementById("category-portals")) return;

      const oldFilters = head.querySelector(".filters");
      if (oldFilters) oldFilters.remove();
      const adultNotice = document.getElementById("adult-notice");
      if (adultNotice) adultNotice.remove();

      head.querySelector("h2")?.insertAdjacentHTML("afterend", '<p class="explore-lead">選一個作品區域。分類看的是作品定位，不是角色本身的性別。</p>');

      const portals = document.createElement("div");
      portals.id = "category-portals";
      portals.className = "category-portals";
      portals.innerHTML = Object.entries(categoryMeta).map(([key, meta], index) => `<button type="button" class="category-portal portal-${key}" data-category="${key}"><span class="portal-index">0${index + 1}</span><span class="portal-en">${meta.en}</span><strong>${meta.label}</strong><span class="portal-desc">${meta.desc}</span><span class="portal-arrow">進入作品區 →</span></button>`).join("");
      head.insertAdjacentElement("afterend", portals);
      portals.querySelectorAll(".category-portal").forEach(btn => btn.addEventListener("click", () => openCategory(btn.dataset.category)));

      const tools = document.createElement("div");
      tools.className = "character-tools";
      tools.innerHTML = '<button id="import-character-button" class="secondary" type="button">匯入角色 JSON</button><button id="manage-character-button" class="secondary" type="button">管理本機角色</button><a class="secondary" href="data/characters/character-template.json" download>下載角色模板</a><input id="import-character-file" type="file" accept="application/json,.json" hidden><span id="character-import-status" class="note"></span><div id="custom-character-list" style="width:100%"></div>';
      portals.insertAdjacentElement("afterend", tools);

      const picker = document.getElementById("import-character-file");
      const status = document.getElementById("character-import-status");
      const listBox = document.getElementById("custom-character-list");

      const refreshCharacters = () => {
        const custom = CharacterEngine.loadCustom();
        const builtIn = App.characters.filter(c => c.source !== "local-import");
        const seen = new Set();
        App.characters = [...custom, ...builtIn].filter(c => !seen.has(c.id) && seen.add(c.id));
        const selected = document.querySelector(".category-portal.active")?.dataset.category || "all";
        App.renderCharacters(selected);
      };

      const renderCustomList = () => {
        const custom = CharacterEngine.loadCustom();
        listBox.innerHTML = custom.length ? custom.map(c => `<div class="note local-character-row"><b>${App.escapeHTML(c.title || c.name)}</b><span>${App.escapeHTML(categoryMeta[c.category]?.label || c.category)}</span><span>${App.escapeHTML(c.id)}</span><button class="text-button" data-remove-character="${App.escapeAttr(c.id)}">移除</button></div>`).join("") : '<div class="note" style="margin-top:8px">目前沒有本機匯入角色。</div>';
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
          status.textContent = `✓ 已匯入：${c.name} · ${categoryMeta[c.category]?.label || c.category}`;
          refreshCharacters();
          renderCustomList();
        } catch (err) {
          status.textContent = `✕ ${err.message || "匯入失敗"}`;
        } finally {
          picker.value = "";
        }
      });

      App.renderCharacters("all");
    }, 220);
  });
})();