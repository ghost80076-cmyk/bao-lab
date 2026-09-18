(() => {
  if (typeof App === "undefined" || !window.BAOCharacterStatus) return;

  const TYPE_LABELS = { text: "文字", number: "數字", meter: "量表", boolean: "開關", tags: "標籤" };
  const CONTEXT_LABELS = { core: "核心／重要狀態", relevant: "Relevant／相關時使用", ui_only: "UI Only／只顯示" };
  const TEMPLATES = {
    general: { label: "一般狀態", fields: [
      { key: "condition", label: "身體狀態", type: "text", context: "core", default: "正常", description: "傷勢、疲勞與會影響後續行動的明確狀態。" },
      { key: "energy", label: "精力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "依故事中明確的消耗與恢復調整。" },
      { key: "mood", label: "當前情緒", type: "text", context: "relevant", default: "平穩", description: "只根據已表現出的言行更新，不推斷隱藏心理。" }
    ] },
    relationship: { label: "關係互動", fields: [
      { key: "affinity", label: "好感", type: "meter", context: "relevant", default: 0, min: -100, max: 100, description: "只依已發生的關係互動小幅調整。" },
      { key: "trust", label: "信任", type: "meter", context: "relevant", default: 0, min: -100, max: 100, description: "記錄有明確依據的信任或戒備變化。" },
      { key: "relationship_state", label: "關係狀態", type: "tags", context: "core", default: ["未定義"], description: "已成立的關係、承諾、衝突或界線。" }
    ] },
    fantasy: { label: "奇幻", fields: [
      { key: "mana", label: "魔力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "追蹤明確發生的施法消耗與恢復。" },
      { key: "magic_state", label: "魔法狀態", type: "text", context: "relevant", default: "穩定", description: "法術、詛咒、祝福與魔法反應。" },
      { key: "fantasy_traits", label: "種族／魔法特徵", type: "tags", context: "relevant", default: [], description: "已揭露的種族特徵、契約或印記。" }
    ] },
    vampire: { label: "吸血鬼", fields: [
      { key: "hunger", label: "飢渴", type: "meter", context: "core", default: 20, min: 0, max: 100, description: "依故事中明確的飢渴、進食與克制變化調整。" },
      { key: "fangs", label: "獠牙顯露", type: "boolean", context: "relevant", default: false, description: "只有明確顯露或收起時才更新。" },
      { key: "blood_state", label: "血液狀態", type: "text", context: "relevant", default: "穩定", description: "血液需求、血脈反應或已成立的血契。" }
    ] },
    cultivation: { label: "修仙", fields: [
      { key: "realm", label: "境界", type: "text", context: "core", default: "未設定", description: "只記錄已明確成立的修為境界與突破。" },
      { key: "spiritual_power", label: "靈力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "依功法、戰鬥與恢復明確調整。" },
      { key: "cultivation_state", label: "修煉狀態", type: "tags", context: "relevant", default: [], description: "內傷、心魔、瓶頸、頓悟或特殊加持。" }
    ] },
    combat: { label: "戰鬥", fields: [
      { key: "hp", label: "生命", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "只依明確受到的傷害、治療與恢復更新。" },
      { key: "stamina", label: "體力", type: "meter", context: "core", default: 100, min: 0, max: 100, description: "依明確的施力、消耗與休息更新。" },
      { key: "injuries", label: "傷勢", type: "tags", context: "core", default: [], description: "記錄具體成立的受傷部位與異常狀態。" },
      { key: "guarding", label: "防禦中", type: "boolean", context: "relevant", default: false, description: "角色明確進入或解除防禦架勢時更新。" }
    ] }
  };

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const esc = value => App.escapeHTML(String(value ?? ""));

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/character-status.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/character-status.css";
    document.head.appendChild(link);
  };

  const pretty = value => Array.isArray(value) ? value.join("、") : typeof value === "boolean" ? (value ? "是" : "否") : (value === "" || value === null || value === undefined ? "—" : String(value));

  const displayLabel = (field, customization) => customization.labels?.[field.key] || field.label;

  const visibleFields = cfg => cfg.fields.filter(field => !cfg.customization.hidden.includes(field.key));

  const fieldValueHTML = (field, value) => {
    if (field.type !== "meter") return `<b>${esc(pretty(value))}</b>`;
    const min = Number.isFinite(field.min) ? field.min : 0;
    const max = Number.isFinite(field.max) ? field.max : 100;
    const number = Number.isFinite(Number(value)) ? Number(value) : min;
    const ratio = max > min ? Math.max(0, Math.min(100, ((number - min) / (max - min)) * 100)) : 0;
    return `<b>${esc(number)} <span class="status-meter-range">/ ${esc(max)}</span></b><span class="status-meter"><i style="width:${ratio}%"></i></span>`;
  };

  const renderCharactersPanel = () => {
    const cfg = window.BAOCharacterStatus.ensureState(App.activeCharacter) || window.BAOCharacterStatus.configFor(App.activeCharacter);
    const ui = document.getElementById("ui-panel");
    if (!ui || (!cfg.enabled && !cfg.allow_player_customize)) return false;

    const names = [App.activeCharacter?.name, ...(GameState.current?.npcs || []).map(n => n?.name)].filter(Boolean);
    const fields = visibleFields(cfg);
    const cards = [...new Set(names)].map(name => {
      const npc = (GameState.current?.npcs || []).find(n => n.name === name);
      const role = name === App.activeCharacter?.name ? "主要角色" : (npc?.role || "NPC");
      const status = GameState.current?.characterStatuses?.[name] || {};
      const picked = GameState.current?.uiContextCharacter === name;
      const rows = fields.map(field => `<div class="character-status-field"><small>${esc(displayLabel(field, cfg.customization))}</small>${fieldValueHTML(field, status[field.key])}</div>`).join("");
      return `<article class="character-status-card ${picked ? "context-picked" : ""}" data-character-context="${esc(name)}"><div class="character-status-head"><div><strong>${esc(name)}</strong><br><span>${esc(role)}</span></div><span>${picked ? "下一輪優先參考" : "點一下可供下一輪參考"}</span></div>${rows ? `<div class="character-status-fields">${rows}</div>` : '<div class="character-status-empty">目前沒有顯示中的狀態欄位，可從「狀態欄管理」新增。</div>'}</article>`;
    }).join("");

    ui.innerHTML = `<div class="character-status-toolbar"><p>角色卡預設欄位與玩家自訂欄位共同組成這份故事的實際狀態欄。</p>${cfg.allow_player_customize ? '<button type="button" class="secondary" data-character-status-settings>⚙ 狀態欄管理</button>' : ""}</div><div class="character-status-grid">${cards || '<div class="character-status-empty">目前沒有可追蹤人物。</div>'}</div>`;
    ui.querySelectorAll("[data-character-context]").forEach(card => card.addEventListener("click", event => {
      if (event.target.closest("button")) return;
      GameState.current.uiContextCharacter = card.dataset.characterContext || "";
      renderCharactersPanel();
    }));
    ui.querySelector("[data-character-status-settings]")?.addEventListener("click", openSettings);
    return true;
  };

  const cleanDefaultFromInput = (field, raw) => {
    if (field.type === "boolean") return raw === true || raw === "true";
    if (field.type === "tags") return String(raw || "").split(/[、,，]/).map(x => x.trim()).filter(Boolean).slice(0, 12);
    if (field.type === "number" || field.type === "meter") return Number.isFinite(Number(raw)) ? Number(raw) : 0;
    return String(raw ?? "").slice(0, 800);
  };

  const defaultControl = field => {
    if (field.type === "boolean") return `<select data-custom-prop="default"><option value="false" ${field.default ? "" : "selected"}>關閉</option><option value="true" ${field.default ? "selected" : ""}>開啟</option></select>`;
    if (field.type === "tags") return `<input data-custom-prop="default" value="${esc(Array.isArray(field.default) ? field.default.join("、") : field.default || "")}" placeholder="標籤一、標籤二">`;
    if (field.type === "number" || field.type === "meter") return `<input type="number" step="any" data-custom-prop="default" value="${esc(field.default ?? 0)}">`;
    return `<input data-custom-prop="default" value="${esc(field.default ?? "")}" placeholder="初始值">`;
  };

  const openSettings = () => {
    if (!GameState.current) { alert("請先開始或讀取一個故事。"); return; }
    const base = window.BAOCharacterStatus.baseConfigFor(App.activeCharacter);
    if (!base.allow_player_customize) return;
    const current = window.BAOCharacterStatus.getCustomization(App.activeCharacter);
    const draft = clone(current);

    document.querySelector(".status-manager-backdrop")?.remove();
    const wrap = document.createElement("div");
    wrap.className = "status-manager-backdrop";
    wrap.innerHTML = `<section class="status-manager-modal"><header class="status-manager-head"><div><div class="eyebrow">STORY STATUS</div><h2>狀態欄管理</h2><p>變更只屬於目前故事存檔，不會修改原始角色卡。</p></div><button type="button" class="text-button" data-status-close>關閉</button></header><div class="status-manager-body"><main><section class="status-manager-card"><div class="status-manager-card-title"><div><h3>快速範本</h3><p>只加入尚未套用的欄位，可複數混用。</p></div><span class="chip" data-status-count></span></div><div class="status-template-list">${Object.entries(TEMPLATES).map(([key, template]) => `<button type="button" data-status-template="${key}">＋ ${esc(template.label)}</button>`).join("")}</div></section><section class="status-manager-card"><div class="status-manager-card-title"><div><h3>目前故事欄位</h3><p>上下鍵排序；角色卡欄位保留底層定義，玩家欄位可以完整編輯或刪除。</p></div><button type="button" class="secondary" data-status-add>＋ 新增欄位</button></div><div data-status-editor class="status-manager-list"></div></section></main><aside><section class="status-manager-card status-manager-guide"><h3>AI 使用方式</h3><p><b>核心</b>：精簡放入主要 Context。</p><p><b>Relevant</b>：本輪相關或手動點選人物時才放入。</p><p><b>UI Only</b>：只顯示，不送主模型。</p><p><b>AI 自動追蹤</b>：由既有 Character Status tracker 根據已發生內容更新。</p></section><section class="status-manager-card"><h3>資料歸屬</h3><p>自訂 schema、數值與顯示偏好都寫進故事存檔；匯入原角色卡或開新故事不會被永久改寫。</p></section></aside></div><footer class="status-manager-foot"><button type="button" class="secondary" data-status-reset>恢復角色卡預設</button><span data-status-message></span><button type="button" class="primary" data-status-save>套用到目前故事</button></footer></section>`;
    document.body.appendChild(wrap);

    const allDraftFields = () => {
      const all = [...base.fields, ...draft.customFields];
      const rank = new Map(draft.order.map((key, index) => [key, index]));
      return all.sort((a, b) => (rank.get(a.key) ?? 999) - (rank.get(b.key) ?? 999));
    };

    const ensureOrder = () => {
      const keys = allDraftFields().map(field => field.key);
      draft.order = [...draft.order.filter(key => keys.includes(key)), ...keys.filter(key => !draft.order.includes(key))];
    };

    const addCustom = raw => {
      if (draft.customFields.length >= window.BAOCharacterStatus.MAX_CUSTOM_FIELDS) return false;
      const key = window.BAOCharacterStatus.uniqueCustomKey(raw.key || "status", App.activeCharacter, draft.customFields);
      const field = {
        key,
        label: String(raw.label || "新欄位").slice(0, 40),
        type: TYPE_LABELS[raw.type] ? raw.type : "text",
        context: CONTEXT_LABELS[raw.context] ? raw.context : "relevant",
        track: raw.track !== false,
        player_toggle: true,
        player_rename: true,
        default: clone(raw.default ?? ""),
        min: Number.isFinite(Number(raw.min)) ? Number(raw.min) : undefined,
        max: Number.isFinite(Number(raw.max)) ? Number(raw.max) : undefined,
        description: String(raw.description || "").slice(0, 240),
        origin: "player",
        template_id: String(raw.template_id || "").slice(0, 40)
      };
      draft.customFields.push(field);
      draft.order.push(field.key);
      return true;
    };

    const renderEditor = () => {
      ensureOrder();
      const fields = allDraftFields();
      const editor = wrap.querySelector("[data-status-editor]");
      wrap.querySelector("[data-status-count]").textContent = `${draft.customFields.length} / ${window.BAOCharacterStatus.MAX_CUSTOM_FIELDS} 個自訂欄位`;
      editor.innerHTML = fields.length ? fields.map((field, index) => {
        const custom = field.origin === "player";
        const shown = !draft.hidden.includes(field.key);
        const label = custom ? field.label : (draft.labels[field.key] || field.label);
        const numeric = field.type === "number" || field.type === "meter";
        return `<article class="status-manager-field ${custom ? "is-custom" : "is-character"}" data-field-key="${esc(field.key)}"><div class="status-manager-field-head"><div><span class="status-origin ${custom ? "player" : "character"}">${custom ? "玩家自訂" : "角色卡預設"}</span><b>${esc(label)}</b><small>${esc(field.key)}</small></div><div class="status-manager-actions"><button type="button" data-move="up" ${index === 0 ? "disabled" : ""}>↑</button><button type="button" data-move="down" ${index === fields.length - 1 ? "disabled" : ""}>↓</button>${custom ? '<button type="button" data-delete>刪除</button>' : ""}</div></div><div class="status-manager-basic"><label class="status-visible"><input type="checkbox" data-visible ${shown ? "checked" : ""} ${!custom && !field.player_toggle ? "disabled" : ""}> 顯示</label><label>顯示名稱<input type="text" maxlength="40" data-label value="${esc(label)}" ${!custom && !field.player_rename ? "disabled" : ""}></label></div>${custom ? `<div class="status-manager-details"><label>類型<select data-custom-prop="type">${Object.entries(TYPE_LABELS).map(([key, text]) => `<option value="${key}" ${field.type === key ? "selected" : ""}>${text}</option>`).join("")}</select></label><label>初始值${defaultControl(field)}</label><label>AI 使用方式<select data-custom-prop="context">${Object.entries(CONTEXT_LABELS).map(([key, text]) => `<option value="${key}" ${field.context === key ? "selected" : ""}>${text}</option>`).join("")}</select></label>${numeric ? `<label>最小值<input type="number" step="any" data-custom-prop="min" value="${esc(field.min ?? "")}" placeholder="可留空"></label><label>最大值<input type="number" step="any" data-custom-prop="max" value="${esc(field.max ?? "")}" placeholder="可留空"></label>` : ""}<label class="status-manager-wide">給狀態 AI 的說明<textarea maxlength="240" data-custom-prop="description" placeholder="只描述可由故事證據更新的規則。">${esc(field.description)}</textarea></label><label class="status-track"><input type="checkbox" data-custom-prop="track" ${field.track ? "checked" : ""}> AI 自動追蹤</label></div>` : `<div class="status-character-summary">${esc(TYPE_LABELS[field.type])} · ${esc(CONTEXT_LABELS[field.context])} · ${field.track ? "AI 追蹤" : "不自動追蹤"}${field.description ? ` · ${esc(field.description)}` : ""}</div>`}</article>`;
      }).join("") : '<div class="character-status-empty">還沒有任何欄位，請新增或套用快速範本。</div>';

      editor.querySelectorAll("[data-field-key]").forEach(row => {
        const key = row.dataset.fieldKey;
        const customField = draft.customFields.find(field => field.key === key);
        const baseField = base.fields.find(field => field.key === key);
        row.querySelector("[data-visible]")?.addEventListener("change", event => {
          draft.hidden = draft.hidden.filter(item => item !== key);
          if (!event.target.checked) draft.hidden.push(key);
        });
        row.querySelector("[data-label]")?.addEventListener("input", event => {
          const value = event.target.value.slice(0, 40);
          if (customField) customField.label = value;
          else if (baseField?.player_rename) draft.labels[key] = value;
        });
        row.querySelectorAll("[data-move]").forEach(button => button.addEventListener("click", () => {
          const index = draft.order.indexOf(key);
          const target = button.dataset.move === "up" ? index - 1 : index + 1;
          if (index < 0 || target < 0 || target >= draft.order.length) return;
          [draft.order[index], draft.order[target]] = [draft.order[target], draft.order[index]];
          renderEditor();
        }));
        row.querySelector("[data-delete]")?.addEventListener("click", () => {
          draft.customFields = draft.customFields.filter(field => field.key !== key);
          draft.order = draft.order.filter(item => item !== key);
          draft.hidden = draft.hidden.filter(item => item !== key);
          delete draft.labels[key];
          renderEditor();
        });
        row.querySelectorAll("[data-custom-prop]").forEach(input => {
          const eventName = input.tagName === "SELECT" || input.type === "checkbox" ? "change" : "input";
          input.addEventListener(eventName, () => {
            if (!customField) return;
            const prop = input.dataset.customProp;
            if (prop === "track") customField.track = input.checked;
            else if (prop === "min" || prop === "max") customField[prop] = input.value === "" ? undefined : Number(input.value);
            else if (prop === "default") customField.default = cleanDefaultFromInput(customField, input.value);
            else if (prop === "type") {
              customField.type = input.value;
              customField.default = input.value === "boolean" ? false : input.value === "tags" ? [] : (input.value === "number" || input.value === "meter" ? 0 : "");
              customField.min = undefined;
              customField.max = undefined;
              renderEditor();
            } else customField[prop] = input.value;
          });
        });
      });
    };

    wrap.querySelectorAll("[data-status-template]").forEach(button => button.addEventListener("click", () => {
      const templateKey = button.dataset.statusTemplate;
      const template = TEMPLATES[templateKey];
      if (!template) return;
      template.fields.forEach((field, index) => {
        const templateId = `${templateKey}_${field.key}`;
        if (draft.customFields.some(item => item.template_id === templateId)) return;
        addCustom({ ...field, template_id: templateId });
      });
      renderEditor();
    }));
    wrap.querySelector("[data-status-add]").addEventListener("click", () => {
      if (!addCustom({ key: "status", label: "新欄位", type: "text", context: "relevant", default: "", track: true })) {
        alert(`每份故事最多新增 ${window.BAOCharacterStatus.MAX_CUSTOM_FIELDS} 個自訂欄位。`);
      }
      renderEditor();
    });

    const close = () => wrap.remove();
    wrap.querySelector("[data-status-close]").addEventListener("click", close);
    wrap.addEventListener("click", event => { if (event.target === wrap) close(); });
    wrap.querySelector("[data-status-reset]").addEventListener("click", () => {
      if (!confirm("確定移除目前故事的所有玩家自訂欄位與顯示調整？角色卡預設欄位會保留。")) return;
      window.BAOCharacterStatus.resetCustomization(App.activeCharacter);
      App.saveStory?.(false);
      close();
      renderCharactersPanel();
    });
    wrap.querySelector("[data-status-save]").addEventListener("click", () => {
      window.BAOCharacterStatus.applyCustomization(draft, App.activeCharacter);
      App.saveStory?.(false);
      close();
      if (App.config?.displayMode === "ui") renderCharactersPanel();
    });
    renderEditor();
  };

  const injectManagerButton = () => {
    const aside = document.querySelector("#chat-view aside");
    if (!aside || aside.querySelector("[data-open-status-manager]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary status-manager-launch";
    button.dataset.openStatusManager = "true";
    button.textContent = "◈ 狀態欄管理";
    button.addEventListener("click", openSettings);
    const exit = aside.querySelector(".text-button");
    if (exit?.parentElement) exit.parentElement.insertBefore(button, exit); else aside.appendChild(button);
  };

  const injectBuilderSummary = () => {
    const step = document.querySelector('[data-step-panel="2"]');
    if (!step) return;
    step.querySelector("#character-status-builder-card")?.remove();
    const cfg = window.BAOCharacterStatus.baseConfigFor(App.activeCharacter);
    const box = document.createElement("div");
    box.id = "character-status-builder-card";
    box.className = "character-status-builder";
    box.innerHTML = `<h4>人物狀態 <span class="chip">故事內可管理</span></h4><p>${cfg.fields.length ? "角色卡已提供預設欄位。" : "角色卡沒有預設欄位。"}開始故事後可新增、排序、隱藏與設定 AI 用途；調整只寫入該故事存檔。</p>${cfg.fields.length ? `<div class="character-status-builder-tags">${cfg.fields.map(field => `<span>${esc(field.label)} · ${esc(CONTEXT_LABELS[field.context])}</span>`).join("")}</div>` : ""}`;
    step.appendChild(box);
  };

  const latestUserText = () => {
    const list = window.Chat?.messages || [];
    for (let index = list.length - 1; index >= 0; index -= 1) if (list[index]?.role === "user") return String(list[index].content || "");
    return "";
  };

  const originalPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    if (panel === "npc") {
      const cfg = window.BAOCharacterStatus.configFor(this.activeCharacter);
      if ((cfg.enabled || cfg.allow_player_customize) && renderCharactersPanel()) return;
    }
    return originalPanel(panel);
  };

  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    if (!GameState.current) return base;
    const compact = window.BAOCharacterStatus.compactForPrompt(latestUserText(), { maxCharacters: 2, maxChars: 1400, consumeViewed: true });
    if (!compact.text) return base;
    return `${base}\n\n【本輪人物狀態】\n${compact.text}\n只把這些狀態視為目前事實；不要替玩家補心理、台詞或未發生的行動。`;
  };

  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    window.BAOCharacterStatus.ensureState(this.activeCharacter);
    originalRender(fresh);
    injectManagerButton();
  };

  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function() {
    originalOpenBuilder();
    setTimeout(injectBuilderSummary, 0);
  };

  ensureStyles();
  window.BAOCharacterStatusUI = { renderCharactersPanel, openSettings, injectBuilderSummary, TEMPLATES };
})();
