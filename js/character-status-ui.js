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
    three_realms: { label: "三界人物狀態", fields: [
      { key: "body_condition", label: "身體狀態", type: "text", context: "relevant", default: "未確認", description: "只記錄正文已確認的健康、疲勞、傷勢等狀態；未知維持未確認，不替玩家補感受。" },
      { key: "mental_condition", label: "精神狀態", type: "text", context: "relevant", default: "未確認", description: "只記錄已表達的精神狀態與可觀察反應；不推斷未揭露的隱藏心理。" },
      { key: "relationship_stage", label: "關係階段", type: "text", context: "relevant", default: "未確認", description: "依已確認互動記錄陌生、熟悉、曖昧、戀人、親密或作品既有關係；不能自動跳階，好感不代表同意。" },
      { key: "affinity_description", label: "好感描述", type: "text", context: "relevant", default: "未確認", description: "有明確關係互動依據時使用低、中、高、極高等描述；無依據維持未確認。不從既有數字猜測閾值，不把好感視為同意。" },
      { key: "current_activity", label: "目前行動", type: "text", context: "relevant", default: "未確認", description: "只記錄當前正文已成立的具體行動；離場角色的預計活動不能當成已發生。" },
      { key: "key_turns", label: "關鍵轉折", type: "text", context: "relevant", default: "未確認", description: "以一至兩條簡短文字記錄已發生、影響角色或關係的重要事件；不補造過往或未來結果。" }
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
  const displayValue = value => {
    const mod = window.BAOPlayerTextReplace;
    return mod?.applyStatus ? mod.applyStatus(String(value ?? ""), mod.get?.()) : String(value ?? "");
  };

  const ensureStyles = () => {
    if (document.querySelector('link[href^="css/character-status.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/character-status.css?v=5";
    document.head.appendChild(link);
  };

  const pretty = value => Array.isArray(value) ? value.join("、") : typeof value === "boolean" ? (value ? "是" : "否") : (value === "" || value === null || value === undefined ? "—" : String(value));

  const displayLabel = (field, customization) => customization.labels?.[field.key] || field.label;

  const visibleFields = cfg => cfg.fields.filter(field => !cfg.customization.hidden.includes(field.key));

  const fieldValueHTML = (field, value) => {
    if (field.type !== "meter") {
      const rendered = pretty(value);
      const compact = field.type === "boolean" || field.type === "tags" || field.type === "number"
        || (field.type === "text" && rendered.length > 0 && rendered.length <= 18);
      return `<b${compact ? ' class="status-value-badge"' : ''}>${esc(displayValue(rendered))}</b>`;
    }
    const min = Number.isFinite(field.min) ? field.min : 0;
    const max = Number.isFinite(field.max) ? field.max : 100;
    const number = Number.isFinite(Number(value)) ? Number(value) : min;
    const ratio = max > min ? Math.max(0, Math.min(100, ((number - min) / (max - min)) * 100)) : 0;
    return `<b>${esc(displayValue(number))} <span class="status-meter-range">/ ${esc(displayValue(max))}</span></b><span class="status-meter"><i style="width:${ratio}%"></i></span>`;
  };

  const renderCharactersPanel = () => {
    const cfg = window.BAOCharacterStatus.ensureState(App.activeCharacter) || window.BAOCharacterStatus.configFor(App.activeCharacter);
    const ui = document.getElementById("ui-panel");
    if (!ui || (!cfg.enabled && !cfg.allow_player_customize)) return false;

    const isDistrict = App.activeCharacter?.id === "desire-district";
    const sceneNPCs = (GameState.current?.npcs || []).filter(npc => npc?.name && npc.presence !== "away" &&
      (npc.location === GameState.current?.location || (npc.presence === "present" && (!npc.location || npc.location === "未知"))));
    const names = isDistrict
      ? sceneNPCs.map(npc => npc.name)
      : (window.BAOCharacterStatus.statusNames?.(App.activeCharacter) || Object.keys(GameState.current?.characterStatuses || {}));
    const fields = visibleFields(cfg);
    const selected = new Set(window.BAOCharacterStatus.selectedContextCharacters?.() || []);
    const cards = [...new Set(names)].map(name => {
      const npc = (GameState.current?.npcs || []).find(n => n.name === name);
      const npcRole = String(npc?.role || "").trim();
      const role = npcRole && npcRole !== "NPC"
        ? npcRole
        : (window.BAOCharacterStatus.isPrimaryCharacterName?.(name, App.activeCharacter) ? "主要角色" : "NPC");
      const status = GameState.current?.characterStatuses?.[name] || {};
      const picked = selected.has(name);
      const rows = fields.map(field => `<div class="character-status-field"><small>${esc(displayLabel(field, cfg.customization))}</small>${fieldValueHTML(field, status[field.key])}</div>`).join("");
      return `<article class="character-status-card ${picked ? "context-picked" : ""}" role="button" tabindex="0" aria-pressed="${picked ? "true" : "false"}" data-character-context="${esc(name)}"><div class="character-status-head"><div><strong>${esc(name)}</strong><br><span>${esc(role)}</span></div><span>${picked ? "✓ 下一輪重點" : "＋ 加入下一輪重點"}</span></div>${rows ? `<div class="character-status-fields">${rows}</div>` : '<div class="character-status-empty">目前沒有顯示中的狀態欄位，可從「狀態欄管理」新增。</div>'}</article>`;
    }).join("");

    const selectedText = selected.size
      ? `下一輪將優先帶入 ${selected.size} 位人物的相關狀態；再次點擊人物可取消。`
      : `可選最多 ${window.BAOCharacterStatus.MAX_CONTEXT_CHARACTERS} 位人物作為下一輪重點；這不代表人物目前在場。`;
    ui.innerHTML = `<div class="character-status-toolbar"><div><p>${isDistrict ? "👥 當前場景 NPC（離場角色資料仍保存在故事中）" : "角色卡預設欄位與玩家自訂欄位共同組成這份故事的實際狀態欄。"} <button type="button" class="bao-help-button" data-bao-help="next_turn_reference" aria-label="了解下一輪重點">?</button></p><small class="character-context-selection" aria-live="polite">${esc(selectedText)}</small></div>${cfg.allow_player_customize ? '<button type="button" class="secondary" data-character-status-settings>⚙ 狀態欄管理</button>' : ""}</div><div class="character-status-grid">${cards || (isDistrict ? '<div class="character-status-empty">當前場景沒有已確認的在場 NPC。</div>' : '<div class="character-status-empty">目前沒有可追蹤人物。</div>')}</div>`;
    const toggleCard = card => {
      const result = window.BAOCharacterStatus.toggleContextCharacter?.(card.dataset.characterContext || "");
      if (result?.limitReached) window.BAOFeedback?.notify?.(`下一輪最多選 ${window.BAOCharacterStatus.MAX_CONTEXT_CHARACTERS} 位人物。`, "info");
      renderCharactersPanel();
    };
    ui.querySelectorAll("[data-character-context]").forEach(card => {
      card.addEventListener("click", event => {
        if (event.target.closest("button")) return;
        toggleCard(card);
      });
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        toggleCard(card);
      });
    });
    ui.querySelector("[data-character-status-settings]")?.addEventListener("click", openSettings);
    injectNpcRosterButton();
    return true;
  };

  const openNpcRoster = () => {
    if (!GameState.current) { alert("請先開始或讀取一個故事。"); return; }
    document.querySelector(".npc-roster-backdrop")?.remove();
    const roster = window.BAOCharacterStatus.npcRoster?.() || [];
    const selected = new Set((window.BAOCharacterStatus.sceneNPCs?.() || []).map(npc => npc.name));
    const wrap = document.createElement("div");
    wrap.className = "npc-roster-backdrop";

    const render = () => {
      const latest = window.BAOCharacterStatus.npcRoster?.() || [];
      wrap.innerHTML = `<section class="npc-roster-modal" role="dialog" aria-modal="true" aria-labelledby="npc-roster-title"><header><div><div class="eyebrow">STORY CAST</div><h2 id="npc-roster-title">NPC 名冊／場景參與者</h2><p id="npc-roster-intro">名冊保留整份故事的人物；勾選只代表目前場景在場。收藏到我的人物庫時只會帶走這裡已顯示的姓名與身分，不會讀取作者隱藏設定。</p></div><div class="npc-roster-head-actions"><button type="button" class="npc-roster-help-toggle" data-roster-help aria-label="NPC 名冊說明" aria-expanded="false" aria-controls="npc-roster-intro">?</button><button type="button" class="text-button" data-roster-close>關閉</button></div></header><div class="npc-roster-body"><section class="npc-roster-current"><div class="npc-roster-section-head"><div><h3>目前名冊</h3><p>目前地點：${esc(GameState.current?.location || "未設定")} · 已選 ${selected.size} 位場景參與者</p></div><div class="npc-roster-batch"><button type="button" class="secondary" data-roster-all>全選在場</button><button type="button" class="secondary" data-roster-none>全部離場</button></div></div><div class="npc-roster-list">${latest.length ? latest.map(npc => {
        const name = String(npc.name || "");
        const checked = selected.has(name);
        const presence = npc.presence === "present" ? "在場" : npc.presence === "away" ? "已離場" : "行蹤未知";
        return `<div class="npc-roster-item"><label class="npc-roster-row"><input type="checkbox" data-roster-scene="${esc(name)}" ${checked ? "checked" : ""}><span><b>${esc(name)}</b><small>${esc(npc.role || "NPC")} · ${esc(presence)}${npc.location ? ` · ${esc(npc.location)}` : ""}</small></span></label><button type="button" class="secondary npc-roster-collect" data-roster-collect="${esc(name)}">收藏到我的人物庫</button></div>`;
      }).join("") : '<div class="character-status-empty">名冊目前是空的，可以用「快速補登 NPC」加入人物。</div>'}</div></section><section class="npc-roster-add"><h3>快速補登 NPC</h3><p>可一次貼多位，每行一位；格式可用「姓名｜身分」。這裡只建立名冊與身分，完整人物設定仍可用「新增 AI 人物／NPC」。</p><textarea data-roster-bulk rows="4" placeholder="威廉｜公爵\n瑪莉｜女僕\n禁軍統領"></textarea><button type="button" class="secondary" data-roster-add>加入名冊</button></section></div><footer><button type="button" class="secondary" data-roster-close>取消</button><button type="button" class="primary" data-roster-save>儲存場景參與者</button></footer></section>`;

      wrap.querySelectorAll("[data-roster-close]").forEach(button => button.onclick = () => wrap.remove());
      wrap.querySelector("[data-roster-help]")?.addEventListener("click", event => {
        const modal = event.currentTarget.closest(".npc-roster-modal");
        const open = !modal?.classList.contains("npc-roster-help-open");
        modal?.classList.toggle("npc-roster-help-open", open);
        event.currentTarget.setAttribute("aria-expanded", open ? "true" : "false");
      });
      wrap.querySelectorAll("[data-roster-scene]").forEach(input => input.onchange = () => {
        if (input.checked) selected.add(input.dataset.rosterScene);
        else selected.delete(input.dataset.rosterScene);
        render();
      });
      wrap.querySelectorAll("[data-roster-collect]").forEach(button => button.onclick = () => {
        const name = String(button.dataset.rosterCollect || "").trim();
        const npc = latest.find(item => String(item?.name || "").trim() === name);
        const api = window.BAOStoryActors;
        if (!api?.saveVisibleNpcPreset) {
          alert("我的人物庫仍在載入，請稍後再試。");
          return;
        }
        const result = api.saveVisibleNpcPreset({
          name,
          role:String(npc?.role || "NPC").trim()
        });
        if (!result?.ok) {
          alert("這位 NPC 目前無法收藏到人物庫。");
          return;
        }
        alert(result.created
          ? "已收藏「" + name + "」到我的 AI 人物庫。只保存名冊已顯示的姓名與身分；其他設定可到「我的」再補充。"
          : "「" + name + "」已經存在我的 AI 人物庫。");
      });
      wrap.querySelector("[data-roster-all]")?.addEventListener("click", () => {
        latest.forEach(npc => selected.add(String(npc.name)));
        render();
      });
      wrap.querySelector("[data-roster-none]")?.addEventListener("click", () => {
        selected.clear();
        render();
      });
      wrap.querySelector("[data-roster-add]")?.addEventListener("click", () => {
        const raw = wrap.querySelector("[data-roster-bulk]")?.value || "";
        raw.split(/\n+/).map(line => line.trim()).filter(Boolean).slice(0, 50).forEach(line => {
          const [name, role] = line.split(/[｜|]/).map(value => String(value || "").trim());
          if (name) GameState.upsertNPC({ name, ...(role ? { role } : {}) });
        });
        App.saveStory?.(false);
        render();
      });
      wrap.querySelector("[data-roster-save]")?.addEventListener("click", () => {
        window.BAOCharacterStatus.setSceneParticipants?.([...selected]);
        App.saveStory?.(false);
        wrap.remove();
        App.renderUIPanel?.("npc");
      });
    };

    document.body.appendChild(wrap);
    wrap.addEventListener("click", event => { if (event.target === wrap) wrap.remove(); });
    render();
  };

  const injectNpcRosterButton = () => {
    const ui = document.getElementById("ui-panel");
    if (!ui || ui.querySelector("[data-npc-roster-open]")) return;
    const host = ui.querySelector(".character-status-toolbar") || ui;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary npc-roster-open";
    button.dataset.npcRosterOpen = "1";
    button.textContent = "NPC 名冊／場景";
    button.addEventListener("click", openNpcRoster);
    host.appendChild(button);
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
    wrap.innerHTML = `<section class="status-manager-modal" role="dialog" aria-modal="true" aria-labelledby="status-manager-title"><header class="status-manager-head"><div><div class="eyebrow">STORY STATUS</div><h2 id="status-manager-title">狀態欄管理 <button type="button" class="bao-help-button" data-bao-help="status_manager" aria-label="了解狀態欄管理">?</button></h2><p>變更只屬於目前故事存檔，不會修改原始角色卡。</p></div><button type="button" class="text-button" data-status-close>關閉</button></header><div class="status-manager-body"><main><section class="status-manager-card status-manager-fields-card"><div class="status-manager-card-title"><div><h3>目前故事欄位</h3><p>上下鍵排序；角色卡欄位保留底層定義，玩家欄位可以完整編輯或刪除。</p></div><button type="button" class="secondary" data-status-add>＋ 新增欄位</button></div><div data-status-editor class="status-manager-list"></div></section><section class="status-manager-card status-manager-templates"><div class="status-manager-card-title"><div><h3>快速範本</h3><p>只加入尚未套用的欄位，可複數混用。</p></div><span class="chip" data-status-count></span></div><div class="status-template-list">${Object.entries(TEMPLATES).map(([key, template]) => `<button type="button" data-status-template="${key}">＋ ${esc(template.label)}</button>`).join("")}</div></section></main><aside><section class="status-manager-card status-manager-guide"><h3>AI 使用方式</h3><p><b>核心</b>：精簡放入主要故事脈絡（Context）。</p><p><b>本輪相關（Relevant）</b>：本輪相關或手動點選人物時才放入。</p><p><b>只供畫面顯示（UI Only）</b>：只顯示，不送主模型。</p><p><b>AI 自動追蹤</b>：由既有狀態追蹤器（Character Status tracker）根據已發生內容更新。</p></section><section class="status-manager-card"><h3>資料歸屬</h3><p>自訂欄位結構（schema）、數值與顯示偏好都寫進故事存檔；匯入原角色卡或開新故事不會被永久改寫。</p></section></aside></div><footer class="status-manager-foot"><button type="button" class="secondary" data-status-reset>恢復角色卡預設</button><span data-status-message></span><button type="button" class="primary" data-status-save>套用到目前故事</button></footer></section>`;
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
      const result = originalPanel(panel);
      injectNpcRosterButton();
      return result;
    }
    return originalPanel(panel);
  };

  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    if (!GameState.current) return base;
    const compact = window.BAOCharacterStatus.compactForPrompt(latestUserText(), { maxCharacters: 4, maxChars: 1400, consumeViewed: false });
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
  const originalSendMessage = App.sendMessage.bind(App);
  App.sendMessage = async function(...args) {
    const before = Array.isArray(window.Chat?.messages) ? Chat.messages.filter(item => item?.role === "assistant").length : 0;
    const result = await originalSendMessage(...args);
    const after = Array.isArray(window.Chat?.messages) ? Chat.messages.filter(item => item?.role === "assistant").length : 0;
    if (after > before && window.BAOCharacterStatus.selectedContextCharacters?.().length) {
      window.BAOCharacterStatus.clearContextCharacters?.();
      if (document.querySelector('.ui-tab[data-panel="npc"]')?.classList.contains("active")) renderCharactersPanel();
      App.saveStory?.(false);
    }
    return result;
  };

  window.BAOCharacterStatusUI = { renderCharactersPanel, openSettings, openNpcRoster, injectBuilderSummary, TEMPLATES };
})();
