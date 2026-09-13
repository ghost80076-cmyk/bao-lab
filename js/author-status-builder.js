(() => {
  if (typeof App === "undefined" || typeof CharacterEngine === "undefined") return;

  const clone = value => {
    try { return structuredClone(value); }
    catch { return JSON.parse(JSON.stringify(value ?? null)); }
  };
  const esc = value => App.escapeHTML(String(value ?? ""));
  const attr = value => App.escapeAttr(String(value ?? ""));

  const TYPE_LABELS = { text:"文字", number:"數字", meter:"量表", boolean:"開關", tags:"標籤" };
  const CONTEXT_LABELS = { core:"核心", relevant:"相關時", ui_only:"只顯示" };

  const field = (key, label, type="text", context="relevant", def="", description="", extra={}) => ({
    key, label, type, context, default:def, description,
    track: extra.track !== false,
    player_toggle: extra.player_toggle !== false,
    player_rename: extra.player_rename !== false,
    ...(extra.min !== undefined ? { min:extra.min } : {}),
    ...(extra.max !== undefined ? { max:extra.max } : {})
  });

  const TEMPLATES = {
    general: { label:"一般角色", fields:[
      field("appearance","外觀","text","relevant","未記錄","目前可觀察到的外觀變化。"),
      field("outfit","目前穿著","text","relevant","未記錄","衣著、裝備與明確發生的換裝變化。"),
      field("posture","姿態","text","relevant","自然","站姿、坐姿、距離與其他可觀察姿態。"),
      field("condition","身體狀態","text","core","正常","傷勢、疲勞或會影響後續敘事的狀態。",{player_toggle:false})
    ]},
    romance: { label:"戀愛情感", fields:[
      field("mood","情緒","text","relevant","平穩","只根據明確行為與故事內容更新角色情緒。"),
      field("outfit","目前穿著","text","relevant","未記錄","目前可觀察到的服裝狀態。"),
      field("posture","距離與姿態","text","relevant","自然","角色與玩家或場景中人物的距離、姿態變化。"),
      field("relationship_tension","關係張力","text","relevant","未明顯變化","記錄關係中已明確表現出的靠近、疏離或衝突。")
    ]},
    fantasy: { label:"奇幻", fields:[
      field("appearance","外觀","text","relevant","未記錄","可觀察的外觀與種族特徵。"),
      field("outfit","衣著與裝備","text","relevant","未記錄","目前穿著與明確裝備中的物品。"),
      field("condition","身體狀態","text","core","正常","傷勢、疲勞、詛咒等會影響行動的狀態。",{player_toggle:false}),
      field("magic_state","魔力狀態","text","relevant","穩定","目前魔力、法術或魔法反應。"),
      field("special_mark","特殊特徵","text","relevant","無","種族特徵、契約、印記或其他世界觀特殊狀態。")
    ]},
    vampire: { label:"吸血鬼", fields:[
      field("appearance","外觀","text","relevant","未記錄","外觀與吸血鬼種族特徵。"),
      field("outfit","目前穿著","text","relevant","未記錄","目前衣著與外觀上的明確變化。"),
      field("fangs","獠牙狀態","text","relevant","收起","獠牙是否顯露及故事中明確發生的變化。"),
      field("hunger","飢渴狀態","text","core","穩定","只依故事中已有依據更新需求與克制狀態。",{player_toggle:false}),
      field("special_mark","特殊標記","text","relevant","無","契約、命定、魔法痕跡等世界觀狀態。")
    ]},
    cultivation: { label:"修仙", fields:[
      field("appearance","外觀","text","relevant","未記錄","目前可觀察的外觀。"),
      field("outfit","衣著","text","relevant","未記錄","衣著、法衣與明確穿戴中的裝備。"),
      field("condition","傷勢","text","core","正常","傷勢、內傷、疲勞與異常狀態。",{player_toggle:false}),
      field("spiritual_power","靈力狀態","text","core","平穩","目前靈力消耗、紊亂或恢復狀態。"),
      field("special_mark","特殊印記","text","relevant","無","契約、禁制、魔氣、劍意等特殊狀態。")
    ]},
    wuxia: { label:"武俠", fields:[
      field("appearance","外觀","text","relevant","未記錄","角色目前可觀察到的外觀。"),
      field("outfit","衣著","text","relevant","未記錄","目前衣著、兵器佩戴與明確變化。"),
      field("condition","傷勢","text","core","正常","外傷、內傷、疲勞與中毒等狀態。",{player_toggle:false}),
      field("internal_energy","內力狀態","text","core","平穩","內力消耗、運行與紊亂狀態。"),
      field("posture","姿態","text","relevant","自然","架勢、步法、距離與可觀察動作狀態。")
    ]},
    special_system: { label:"特殊制度 / ABO", fields:[
      field("secondary_trait","第二特徵","text","ui_only","未設定","作品世界觀中的第二分類或特殊制度欄位。",{track:false}),
      field("scent_state","氣味狀態","text","relevant","平穩","只記錄故事中明確描述的氣味或感知變化。"),
      field("mark_state","標記狀態","text","relevant","無","只追蹤故事中已明確成立的標記或契約狀態。"),
      field("condition","身體狀態","text","core","正常","會影響角色後續行動的身體狀態。",{player_toggle:false})
    ]}
  };

  let activeId = "";
  let draft = null;
  let fields = [];
  let enabled = true;
  let allowPlayerCustomize = true;
  let dirty = false;

  const ensureStyles = () => {
    if (document.querySelector('link[href="css/author-status-builder.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/author-status-builder.css";
    document.head.appendChild(link);
  };

  const characters = () => Array.isArray(App.characters) ? App.characters : [];
  const sourceLabel = c => c?.source === "built-in" ? "內建作品" : c?.source === "local-author" ? "本機作者草稿" : "本機角色";

  const normalizeBuilderField = (raw, index=0) => {
    const f = raw || {};
    const type = Object.prototype.hasOwnProperty.call(TYPE_LABELS, f.type) ? f.type : "text";
    const context = Object.prototype.hasOwnProperty.call(CONTEXT_LABELS, f.context) ? f.context : "relevant";
    return {
      key: String(f.key || `status_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0,40) || `status_${index + 1}`,
      label: String(f.label || `狀態欄位 ${index + 1}`).slice(0,40),
      type,
      context,
      track: f.track !== false,
      player_toggle: f.player_toggle !== false,
      player_rename: f.player_rename !== false,
      default: f.default ?? (type === "boolean" ? false : type === "tags" ? [] : ""),
      min: Number.isFinite(Number(f.min)) ? Number(f.min) : undefined,
      max: Number.isFinite(Number(f.max)) ? Number(f.max) : undefined,
      description: String(f.description || "").slice(0,240)
    };
  };

  const loadCharacter = id => {
    const c = characters().find(x => x.id === id) || characters()[0];
    if (!c) return false;
    activeId = c.id;
    draft = clone(CharacterEngine.normalize(c));
    const cfg = draft.character_status || {};
    enabled = cfg.enabled !== false;
    allowPlayerCustomize = cfg.allow_player_customize !== false;
    fields = (Array.isArray(cfg.fields) ? cfg.fields : []).map(normalizeBuilderField).slice(0,20);
    dirty = false;
    return true;
  };

  const nextKey = () => {
    let n = 1;
    const used = new Set(fields.map(f => f.key));
    while (used.has(`status_${n}`)) n += 1;
    return `status_${n}`;
  };

  const cleanDefault = f => {
    if (f.type === "boolean") return Boolean(f.default);
    if (f.type === "tags") return (Array.isArray(f.default) ? f.default : String(f.default || "").split(/[、,，]/)).map(x=>String(x).trim()).filter(Boolean).slice(0,12);
    if (f.type === "number" || f.type === "meter") {
      const n = Number(f.default);
      return Number.isFinite(n) ? n : 0;
    }
    return String(f.default ?? "").slice(0,800);
  };

  const defaultControl = (f, index) => {
    if (f.type === "boolean") return `<select data-field-index="${index}" data-field-prop="default"><option value="false" ${f.default ? "" : "selected"}>關閉</option><option value="true" ${f.default ? "selected" : ""}>開啟</option></select>`;
    if (f.type === "tags") return `<input data-field-index="${index}" data-field-prop="default" value="${attr(Array.isArray(f.default) ? f.default.join("、") : f.default || "")}" placeholder="標籤一、標籤二">`;
    if (f.type === "number" || f.type === "meter") return `<input type="number" step="any" data-field-index="${index}" data-field-prop="default" value="${attr(f.default ?? 0)}">`;
    return `<input data-field-index="${index}" data-field-prop="default" value="${attr(f.default ?? "")}" placeholder="初始值">`;
  };

  const renderPreview = root => {
    const box = root.querySelector("#author-status-preview");
    if (!box) return;
    box.innerHTML = fields.length ? fields.map(f => `<div class="author-status-preview-row"><b>${esc(f.label)}</b><small>${esc(Array.isArray(f.default) ? f.default.join("、") : String(f.default ?? "—"))}</small><div class="author-status-badges"><span class="author-status-badge">${esc(CONTEXT_LABELS[f.context])}</span><span class="author-status-badge">${f.track ? "AI 追蹤" : "不追蹤"}</span></div></div>`).join("") : '<div class="author-status-empty">還沒有欄位。</div>';
    const count = root.querySelector("#author-status-count");
    if (count) count.textContent = `${fields.length} / 20`;
  };

  const renderFields = root => {
    const list = root.querySelector("#author-status-fields");
    if (!list) return;
    list.innerHTML = fields.length ? fields.map((f,index) => {
      const numeric = f.type === "number" || f.type === "meter";
      return `<article class="author-status-field" data-field-card="${index}">
        <div class="author-status-field-head"><div class="author-status-field-title"><span class="author-status-index">${index + 1}</span><div><b>${esc(f.label || "未命名欄位")}</b><div class="author-status-key">${esc(f.key)}</div></div></div><div class="author-status-field-actions"><button type="button" data-move="up" data-index="${index}" ${index===0?"disabled":""}>↑</button><button type="button" data-move="down" data-index="${index}" ${index===fields.length-1?"disabled":""}>↓</button><button type="button" data-delete-field="${index}">刪除</button></div></div>
        <div class="author-status-grid">
          <label class="span2">欄位名稱<input data-field-index="${index}" data-field-prop="label" maxlength="40" value="${attr(f.label)}" placeholder="例如：目前穿著"></label>
          <label>資料類型<select data-field-index="${index}" data-field-prop="type">${Object.entries(TYPE_LABELS).map(([key,label])=>`<option value="${key}" ${f.type===key?"selected":""}>${label}</option>`).join("")}</select></label>
          <label>Context<select data-field-index="${index}" data-field-prop="context">${Object.entries(CONTEXT_LABELS).map(([key,label])=>`<option value="${key}" ${f.context===key?"selected":""}>${label}</option>`).join("")}</select></label>
          <label>初始值${defaultControl(f,index)}</label>
          ${numeric ? `<label>最小值<input type="number" step="any" data-field-index="${index}" data-field-prop="min" value="${attr(f.min ?? "")}" placeholder="可留空"></label><label>最大值<input type="number" step="any" data-field-index="${index}" data-field-prop="max" value="${attr(f.max ?? "")}" placeholder="可留空"></label>` : '<div></div><div></div>'}
          <label class="wide">給狀態 AI 的說明<textarea data-field-index="${index}" data-field-prop="description" maxlength="240" placeholder="例如：只記錄故事中明確發生的服裝變化。">${esc(f.description)}</textarea></label>
        </div>
        <div class="author-status-flags"><label class="author-status-flag"><input type="checkbox" data-field-index="${index}" data-field-prop="track" ${f.track?"checked":""}> AI 追蹤</label><label class="author-status-flag"><input type="checkbox" data-field-index="${index}" data-field-prop="player_toggle" ${f.player_toggle?"checked":""}> 玩家可隱藏</label><label class="author-status-flag"><input type="checkbox" data-field-index="${index}" data-field-prop="player_rename" ${f.player_rename?"checked":""}> 玩家可改名稱</label></div>
      </article>`;
    }).join("") : '<div class="author-status-empty">尚未建立人物狀態欄位。可以新增空白欄位，或先套用一組範本。</div>';

    list.querySelectorAll("[data-field-prop]").forEach(el => {
      const eventName = el.tagName === "SELECT" || el.type === "checkbox" ? "change" : "input";
      el.addEventListener(eventName, () => {
        const index = Number(el.dataset.fieldIndex);
        const prop = el.dataset.fieldProp;
        const f = fields[index];
        if (!f) return;
        if (prop === "track" || prop === "player_toggle" || prop === "player_rename") f[prop] = Boolean(el.checked);
        else if (prop === "min" || prop === "max") f[prop] = el.value === "" ? undefined : Number(el.value);
        else if (prop === "default") {
          if (f.type === "boolean") f.default = el.value === "true";
          else if (f.type === "tags") f.default = el.value.split(/[、,，]/).map(x=>x.trim()).filter(Boolean).slice(0,12);
          else if (f.type === "number" || f.type === "meter") f.default = Number.isFinite(Number(el.value)) ? Number(el.value) : 0;
          else f.default = el.value;
        } else if (prop === "type") {
          f.type = el.value;
          f.default = f.type === "boolean" ? false : f.type === "tags" ? [] : (f.type === "number" || f.type === "meter" ? 0 : "");
          dirty = true;
          renderFields(root);
          renderPreview(root);
          return;
        } else f[prop] = el.value;
        dirty = true;
        if (prop === "label" || prop === "context" || prop === "track" || prop === "default") renderPreview(root);
      });
    });

    list.querySelectorAll("[data-move]").forEach(btn => btn.addEventListener("click", () => {
      const index = Number(btn.dataset.index);
      const target = btn.dataset.move === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= fields.length) return;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      dirty = true; renderFields(root); renderPreview(root);
    }));
    list.querySelectorAll("[data-delete-field]").forEach(btn => btn.addEventListener("click", () => {
      fields.splice(Number(btn.dataset.deleteField),1);
      dirty = true; renderFields(root); renderPreview(root);
    }));
    renderPreview(root);
  };

  const mergeTemplate = (name, root) => {
    const template = TEMPLATES[name];
    if (!template) return;
    const used = new Set(fields.map(f => f.key));
    template.fields.forEach(f => { if (fields.length < 20 && !used.has(f.key)) { fields.push(normalizeBuilderField(clone(f), fields.length)); used.add(f.key); } });
    dirty = true; renderFields(root);
  };

  const syncInitialStatuses = () => {
    if (!draft) return;
    draft.initial_state = draft.initial_state || {};
    const statuses = clone(draft.initial_state.character_statuses || {});
    const old = statuses[draft.name] && typeof statuses[draft.name] === "object" ? statuses[draft.name] : {};
    const next = {};
    fields.forEach(f => { next[f.key] = old[f.key] !== undefined ? old[f.key] : cleanDefault(f); });
    statuses[draft.name] = next;
    draft.initial_state.character_statuses = statuses;
  };

  const applyDraftConfig = () => {
    if (!draft) return;
    draft.character_status = {
      enabled: enabled && fields.length > 0,
      allow_player_customize: allowPlayerCustomize,
      fields: fields.slice(0,20).map(f => ({
        key:f.key, label:String(f.label || f.key).trim().slice(0,40), type:f.type, context:f.context,
        track:f.track !== false, player_toggle:f.player_toggle !== false, player_rename:f.player_rename !== false,
        default:cleanDefault(f), ...(Number.isFinite(f.min)?{min:f.min}:{}), ...(Number.isFinite(f.max)?{max:f.max}:{}), description:String(f.description || "").trim().slice(0,240)
      }))
    };
    draft.schema_version = "1.5";
    syncInitialStatuses();
  };

  const portableCharacter = () => {
    applyDraftConfig();
    const c = draft;
    return {
      schema_version: c.schema_version || "1.5",
      meta: { id:c.id, name:c.name, avatar:c.avatar, category:c.category, gender:c.gender, audience:c.audience, categories:c.categories, tags:c.tags, description:c.description },
      content: { quote:c.quote, greeting:c.greeting, system_prompt:c.system_prompt, world:c.world, world_focus:c.world_focus, lore:c.lore, npc_rules:c.npc_rules, author_instructions:c.author_instructions, creator_notes:c.creator_notes },
      gameplay: { supported_modes:c.supported_modes, prompt:{ ...c.prompt_options }, character_status:c.character_status, world_modules:c.world_modules, initial_state:c.initial_state },
      presentation: { supported_display:c.supported_display, ui:c.ui, narrative:c.narrative_profile || {} }
    };
  };

  const exportDraft = () => {
    if (!draft) return;
    const data = portableCharacter();
    const blob = new Blob([JSON.stringify(data,null,2)], { type:"application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BAO-LAB-${String(draft.name || draft.id).replace(/[\\/:*?\"<>|]/g,"-")}-character.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),0);
  };

  const refreshAfterSave = async id => {
    await App.loadCharacters();
    const saved = App.characters.find(c => c.id === id);
    if (saved && App.activeCharacter?.id === id) {
      App.activeCharacter = saved;
      App.renderDetail?.();
    }
  };

  const closeModal = force => {
    if (!force && dirty && !confirm("還有尚未儲存的狀態欄位設定，確定關閉嗎？")) return;
    document.querySelector(".author-status-backdrop")?.remove();
  };

  const open = (id = "") => {
    ensureStyles();
    const selected = id || App.activeCharacter?.id || characters()[0]?.id;
    if (!selected || !loadCharacter(selected)) { alert("目前沒有可以編輯的角色。"); return; }
    document.querySelector(".author-status-backdrop")?.remove();

    const wrap = document.createElement("div");
    wrap.className = "author-status-backdrop";
    wrap.innerHTML = `<section class="author-status-modal">
      <header class="author-status-head"><div><div class="eyebrow">AUTHOR TOOL · STATUS SCHEMA</div><h2>狀態欄位建立器</h2></div><button type="button" class="text-button" data-author-close>關閉</button></header>
      <div class="author-status-body"><main class="author-status-main">
        <div class="author-status-card"><div class="author-status-toolbar"><label>編輯作品<select id="author-status-character">${characters().map(c=>`<option value="${attr(c.id)}" ${c.id===activeId?"selected":""}>${esc(c.name)} · ${esc(sourceLabel(c))}</option>`).join("")}</select></label><div><span id="author-status-count" class="chip">0 / 20</span></div></div><p>只修改人物狀態欄位，不會碰角色人格、世界設定或開場白。內建作品儲存後會建立本機覆蓋草稿，方便直接預覽。</p><label class="author-status-switch"><span><b>啟用人物狀態</b><br><small class="note">關閉時這張作品不建立人物狀態欄位。</small></span><input id="author-status-enabled" type="checkbox" ${enabled?"checked":""}></label><label class="author-status-switch"><span><b>允許玩家調整顯示</b><br><small class="note">玩家只能改顯示與允許的名稱，不會改掉作者核心追蹤規則。</small></span><input id="author-status-player-custom" type="checkbox" ${allowPlayerCustomize?"checked":""}></label></div>
        <div class="author-status-card" style="margin-top:14px"><h3>快速範本</h3><p>點一下只加入尚未存在的欄位，不會刪掉你已經做好的設定。</p><div class="author-status-templates">${Object.entries(TEMPLATES).map(([key,t])=>`<button type="button" class="author-status-template" data-template="${key}">＋ ${esc(t.label)}</button>`).join("")}</div></div>
        <div class="author-status-card" style="margin-top:14px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h3>人物狀態欄位</h3><p>拖曳先不做，這版用上下鍵排序；欄位代碼由系統自動產生。</p></div></div><div id="author-status-fields" class="author-status-list" style="margin-top:14px"></div><button type="button" class="secondary author-status-add" id="author-status-add">＋ 新增空白欄位</button></div>
      </main><aside class="author-status-side"><div class="author-status-card"><h3>玩家看到的預覽</h3><p>顯示名稱、初始值與資料用途。</p><div id="author-status-preview" class="author-status-preview"></div></div><div class="author-status-note"><b>Context 原則</b><br>核心：精簡提供給故事模型。<br>相關時：人物或場景相關時才送。<br>只顯示：只留在介面，不增加主聊天 Context。</div><div class="author-status-note"><b>AI 追蹤</b><br>開啟後由狀態整理模型根據已發生內容更新；關閉則保留為作者或 UI 資料。</div></aside></div>
      <footer class="author-status-foot"><span id="author-status-save-state" class="author-status-status">本工具不需要 API。</span><button type="button" class="secondary" id="author-status-export">匯出 JSON</button><button type="button" class="primary" id="author-status-save">儲存本機草稿</button></footer>
    </section>`;
    document.body.appendChild(wrap);

    const rebuildForTarget = id2 => {
      if (!loadCharacter(id2)) return;
      wrap.querySelector("#author-status-enabled").checked = enabled;
      wrap.querySelector("#author-status-player-custom").checked = allowPlayerCustomize;
      renderFields(wrap);
    };

    wrap.querySelector("[data-author-close]").onclick = () => closeModal(false);
    wrap.addEventListener("click", e => { if (e.target === wrap) closeModal(false); });
    wrap.querySelector("#author-status-character").addEventListener("change", e => {
      if (dirty && !confirm("切換作品會放棄目前尚未儲存的欄位修改，確定嗎？")) { e.target.value = activeId; return; }
      rebuildForTarget(e.target.value);
    });
    wrap.querySelector("#author-status-enabled").addEventListener("change", e => { enabled = Boolean(e.target.checked); dirty = true; });
    wrap.querySelector("#author-status-player-custom").addEventListener("change", e => { allowPlayerCustomize = Boolean(e.target.checked); dirty = true; });
    wrap.querySelectorAll("[data-template]").forEach(btn => btn.addEventListener("click", () => mergeTemplate(btn.dataset.template, wrap)));
    wrap.querySelector("#author-status-add").onclick = () => {
      if (fields.length >= 20) { alert("目前每張作品最多 20 個人物狀態欄位。"); return; }
      fields.push(normalizeBuilderField({ key:nextKey(), label:"新欄位", type:"text", context:"relevant", track:true, player_toggle:true, player_rename:true, default:"", description:"" }, fields.length));
      dirty = true; renderFields(wrap);
    };
    wrap.querySelector("#author-status-export").onclick = exportDraft;
    wrap.querySelector("#author-status-save").onclick = async () => {
      if (!draft) return;
      applyDraftConfig();
      const keys = fields.map(f=>f.key);
      if (new Set(keys).size !== keys.length) { alert("欄位代碼重複，請刪除重複欄位後再儲存。"); return; }
      draft.source = "local-author";
      CharacterEngine.saveCustom(draft);
      const state = wrap.querySelector("#author-status-save-state");
      state.textContent = "儲存中…";
      await refreshAfterSave(draft.id);
      dirty = false;
      const external = document.getElementById("author-status-builder-status");
      if (external) external.textContent = `✓ 已儲存 ${draft.name} 的 ${fields.length} 個狀態欄位`;
      closeModal(true);
    };

    renderFields(wrap);
  };

  const mountButton = () => {
    const tools = document.querySelector(".character-tools");
    if (!tools || document.getElementById("author-status-builder-button")) return Boolean(tools);
    ensureStyles();
    const btn = document.createElement("button");
    btn.id = "author-status-builder-button";
    btn.className = "secondary";
    btn.type = "button";
    btn.textContent = "作者：狀態欄位建立器";
    btn.onclick = () => open();
    const manage = document.getElementById("manage-character-button");
    if (manage) manage.insertAdjacentElement("afterend", btn); else tools.prepend(btn);
    const status = document.createElement("span");
    status.id = "author-status-builder-status";
    status.className = "note";
    btn.insertAdjacentElement("afterend", status);
    return true;
  };

  window.BAOAuthorStatusBuilder = { open, templates:TEMPLATES };
  ensureStyles();
  let tries = 0;
  const timer = setInterval(() => { tries += 1; if (mountButton() || tries > 20) clearInterval(timer); }, 150);
})();
