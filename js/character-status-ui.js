(() => {
  if (typeof App === "undefined" || !window.BAOCharacterStatus) return;

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/character-status.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/character-status.css";
    document.head.appendChild(link);
  };

  const esc = v => App.escapeHTML(String(v ?? ""));
  const pretty = v => Array.isArray(v) ? v.join("、") : typeof v === "boolean" ? (v ? "是" : "否") : (v === "" || v === null || v === undefined ? "—" : String(v));

  const prefs = () => {
    App.config.characterStatus = App.config.characterStatus || {};
    App.config.characterStatus.hidden = Array.isArray(App.config.characterStatus.hidden) ? App.config.characterStatus.hidden : [];
    App.config.characterStatus.labels = App.config.characterStatus.labels && typeof App.config.characterStatus.labels === "object" ? App.config.characterStatus.labels : {};
    App.config.characterStatus.order = Array.isArray(App.config.characterStatus.order) ? App.config.characterStatus.order : [];
    return App.config.characterStatus;
  };

  const orderedFields = cfg => {
    const p = prefs();
    const rank = new Map((p.order || []).map((key, i) => [key, i]));
    return [...cfg.fields].sort((a,b) => (rank.has(a.key) ? rank.get(a.key) : 999) - (rank.has(b.key) ? rank.get(b.key) : 999));
  };

  const visibleFields = cfg => {
    const p = prefs();
    return orderedFields(cfg).filter(f => !p.hidden.includes(f.key));
  };

  const renderCharactersPanel = () => {
    window.BAOCharacterStatus.ensureState(App.activeCharacter);
    const cfg = window.BAOCharacterStatus.configFor(App.activeCharacter);
    const ui = document.getElementById("ui-panel");
    if (!ui || !cfg.enabled) return false;

    const p = prefs();
    const names = [App.activeCharacter?.name, ...(GameState.current?.npcs || []).map(n => n?.name)].filter(Boolean);
    const unique = [...new Set(names)];
    const fields = visibleFields(cfg);
    const canCustomize = cfg.allow_player_customize;

    const cards = unique.map(name => {
      const npc = (GameState.current?.npcs || []).find(n => n.name === name);
      const role = name === App.activeCharacter?.name ? "主要角色" : (npc?.role || "NPC");
      const status = GameState.current?.characterStatuses?.[name] || {};
      const picked = GameState.current?.uiContextCharacter === name;
      const rows = fields.map(f => {
        const label = p.labels[f.key] || f.label;
        return `<div class="character-status-field"><small>${esc(label)}</small><b>${esc(pretty(status[f.key]))}</b></div>`;
      }).join("");
      return `<article class="character-status-card ${picked ? "context-picked" : ""}" data-character-context="${esc(name)}"><div class="character-status-head"><div><strong>${esc(name)}</strong><br><span>${esc(role)}</span></div><span>${picked ? "下一輪優先參考" : "點一下可供下一輪參考"}</span></div>${rows ? `<div class="character-status-fields">${rows}</div>` : '<div class="character-status-empty">目前沒有顯示中的人物狀態欄位。</div>'}</article>`;
    }).join("");

    ui.innerHTML = `<div class="character-status-toolbar"><p>人物狀態會由作者定義欄位；玩家可調整顯示方式，不會改壞作者的追蹤規則。</p>${canCustomize ? '<button type="button" class="secondary" data-character-status-settings>⚙ 狀態欄位</button>' : ""}</div><div class="character-status-grid">${cards || '<div class="character-status-empty">目前沒有可追蹤人物。</div>'}</div>`;

    ui.querySelectorAll("[data-character-context]").forEach(card => card.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      GameState.current.uiContextCharacter = card.dataset.characterContext || "";
      renderCharactersPanel();
    }));
    ui.querySelector("[data-character-status-settings]")?.addEventListener("click", openSettings);
    return true;
  };

  const openSettings = () => {
    const cfg = window.BAOCharacterStatus.configFor(App.activeCharacter);
    if (!cfg.enabled || !cfg.allow_player_customize) return;
    const p = prefs();
    const draft = {
      hidden: [...p.hidden],
      labels: { ...p.labels },
      order: orderedFields(cfg).map(f => f.key)
    };

    document.querySelector(".bao-modal-backdrop")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "bao-modal-backdrop";
    wrap.innerHTML = `<section class="bao-modal"><div class="bao-modal-head"><div><div class="eyebrow">CHARACTER STATUS</div><h2>人物狀態欄位</h2></div><button class="bao-modal-close" type="button">關閉</button></div><div class="bao-modal-body"><div class="status-customize-note">這裡只調整你看到的欄位、名稱與順序。作者設定的狀態追蹤與核心資料仍會正常運作。</div><div data-status-editor></div></div><div class="bao-modal-footer"><button type="button" class="secondary" data-status-reset>恢復作者預設</button><button type="button" class="primary" data-status-save>套用</button></div></section>`;
    document.body.appendChild(wrap);

    const editor = wrap.querySelector("[data-status-editor]");
    const renderEditor = () => {
      const byKey = new Map(cfg.fields.map(f => [f.key, f]));
      editor.innerHTML = draft.order.map((key, index) => {
        const f = byKey.get(key); if (!f) return "";
        const shown = !draft.hidden.includes(key);
        const label = draft.labels[key] || f.label;
        return `<div class="status-field-editor" data-field-key="${esc(key)}"><label><input type="checkbox" data-status-visible ${shown ? "checked" : ""} ${f.player_toggle ? "" : "disabled"}> 顯示</label><div class="status-field-editor-main"><input type="text" data-status-label value="${esc(label)}" ${f.player_rename ? "" : "disabled"}><small>${esc(f.description || `作者欄位：${f.label}`)}</small></div><div class="status-order-actions"><button type="button" class="secondary" data-move="up" ${index===0?"disabled":""}>↑</button><button type="button" class="secondary" data-move="down" ${index===draft.order.length-1?"disabled":""}>↓</button></div></div>`;
      }).join("");
      editor.querySelectorAll("[data-field-key]").forEach(row => {
        const key = row.dataset.fieldKey;
        row.querySelector("[data-status-visible]")?.addEventListener("change", e => {
          draft.hidden = draft.hidden.filter(x => x !== key);
          if (!e.target.checked) draft.hidden.push(key);
        });
        row.querySelector("[data-status-label]")?.addEventListener("input", e => { draft.labels[key] = e.target.value.trim().slice(0, 40); });
        row.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => {
          const i = draft.order.indexOf(key);
          const j = btn.dataset.move === "up" ? i - 1 : i + 1;
          if (i < 0 || j < 0 || j >= draft.order.length) return;
          [draft.order[i], draft.order[j]] = [draft.order[j], draft.order[i]];
          renderEditor();
        }));
      });
    };
    renderEditor();

    const close = () => wrap.remove();
    wrap.querySelector(".bao-modal-close").onclick = close;
    wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
    wrap.querySelector("[data-status-reset]").onclick = () => {
      App.config.characterStatus = { hidden: [], labels: {}, order: cfg.fields.map(f => f.key) };
      App.saveStory?.(false);
      close();
      renderCharactersPanel();
    };
    wrap.querySelector("[data-status-save]").onclick = () => {
      App.config.characterStatus = draft;
      App.saveStory?.(false);
      close();
      renderCharactersPanel();
    };
  };

  const injectBuilderSummary = () => {
    const step = document.querySelector('[data-step-panel="2"]');
    if (!step) return;
    step.querySelector("#character-status-builder-card")?.remove();
    const cfg = window.BAOCharacterStatus.configFor(App.activeCharacter);
    if (!cfg.enabled) return;
    const box = document.createElement("div");
    box.id = "character-status-builder-card";
    box.className = "character-status-builder";
    box.innerHTML = `<h4>人物狀態 <span class="chip">作者設定</span></h4><p>這張作品會追蹤人物狀態。進入故事後，你可以調整顯示欄位、名稱與順序；作者核心追蹤不會被關掉。</p><div class="character-status-builder-tags">${cfg.fields.map(f => `<span>${esc(f.label)} · ${f.context === "core" ? "核心" : f.context === "ui_only" ? "僅顯示" : "相關時使用"}</span>`).join("")}</div>`;
    step.appendChild(box);
  };

  const latestUserText = () => {
    const list = window.Chat?.messages || [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i]?.role === "user") return String(list[i].content || "");
    return "";
  };

  const originalPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    if (panel === "npc") {
      const cfg = window.BAOCharacterStatus.configFor(this.activeCharacter);
      if (cfg.enabled && renderCharactersPanel()) return;
    }
    return originalPanel(panel);
  };

  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    if (!GameState.current) return base;
    const compact = window.BAOCharacterStatus.compactForPrompt(latestUserText(), { maxCharacters: 2, maxChars: 1400, consumeViewed: true });
    if (!compact.text) return base;
    return `${base}\n\n【本輪相關人物狀態】\n${compact.text}\n只把這些狀態視為目前事實；不要替玩家補心理或未發生的行動。`;
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    window.BAOCharacterStatus.ensureState(this.activeCharacter);
    originalRender(fresh);
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function() {
    originalOpenBuilder();
    setTimeout(injectBuilderSummary, 0);
  };

  ensureStyles();
  window.BAOCharacterStatusUI = { renderCharactersPanel, openSettings, injectBuilderSummary };
})();