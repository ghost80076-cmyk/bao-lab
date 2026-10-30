(() => {
  if (typeof App === "undefined" || !window.BAOWorldModules) return;
  const esc = v => App.escapeHTML(String(v ?? ""));
  const displayValue = value => {
    const mod = window.BAOPlayerTextReplace;
    return mod?.applyStatus ? mod.applyStatus(String(value ?? ""), mod.get?.()) : String(value ?? "");
  };
  const ensureStyles = () => {
    if (document.querySelector('link[href="css/world-modules.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/world-modules.css";
    document.head.appendChild(link);
  };
  const FIELD_LABELS = Object.freeze({
    public_identity: "身分", identity: "身分", role: "身分",
    known_connection: "已知資訊", known: "已知資訊",
    relationship: "關係", relation: "關係", status: "狀態", state: "狀態",
    location: "位置", mood: "情緒", time: "時間", date: "日期",
    message: "訊息", event: "事件", notes: "備註", summary: "摘要",
    description: "說明", progress: "進度", condition: "狀況",
    title: "標題", name: "名稱", label: "項目", source: "來源", fact: "觀察事實", verification: "確認程度"
  });
  const privateKey = key => /^(_|private|secret|internal|hidden)/i.test(key);
  const pretty = (v, depth = 0) => {
    if (v === null || v === undefined || v === "") return "—";
    if (typeof v === "boolean") return v ? "是" : "否";
    if (typeof v !== "object") return String(v);
    if (depth >= 2) return "資料項目";
    if (Array.isArray(v)) return v.length ? v.slice(0, 8).map(item => pretty(item, depth + 1)).join("、") : "—";
    const preferred = ["name", "title", "label", "text", "summary", "description"];
    const first = preferred.find(k => !privateKey(k) && typeof v[k] !== "object" && v[k] !== undefined && v[k] !== "");
    if (first) return pretty(v[first], depth + 1);
    const entries = Object.entries(v).filter(([k]) => !privateKey(k)).slice(0, 5);
    return entries.length ? entries.map(([k,value]) => `${FIELD_LABELS[k] || k.replace(/_/g, " ")}：${pretty(value, depth + 1)}`).join("；") : "—";
  };
  const labelFor = (def,key) => def.fields?.find(f => f.key === key)?.label || FIELD_LABELS[key] || key.replace(/_/g, " ");
  // Older state writes may wrap a whole collection as a single JSON string.
  // Decode ONLY for display; keep saved state untouched and bound the work per render.
  const decodeCollectionText = value => {
    if (typeof value !== "string" || value.length > 12000) return value;
    let candidate = value.trim();
    for (let i = 0; i < 2 && /^[\\[{]/.test(candidate); i += 1) {
      try {
        const parsed = JSON.parse(candidate);
        if (parsed && typeof parsed === "object") return parsed;
        if (typeof parsed !== "string" || parsed === candidate) break;
        candidate = parsed.trim();
      } catch (_) { break; }
    }
    return value;
  };
  // The compact reader and module tabs share display decoding and privacy rules.
  // This is presentation only: never rewrite saved values while formatting them.
  const statusLines = (def, value) => {
    const decoded = decodeCollectionText(value);
    const items = Array.isArray(decoded) ? decoded.slice(0, 80).flatMap(item => {
      const parsed = decodeCollectionText(item);
      return Array.isArray(parsed) ? parsed : [parsed];
    }).slice(0, 80) : [decoded];
    return items.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [pretty(item)];
      return Object.entries(item).filter(([key]) => !privateKey(key)).slice(0, 24)
        .map(([key, value]) => `${labelFor(def, key)}：${pretty(decodeCollectionText(value))}`);
    }).map(displayValue);
  };
  const trackLabel = value => value === "high" ? "高頻" : value === "medium" ? "一般" : value === "low" ? "低頻" : "手動";
  const objectHTML = (def,value) => {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const keys = def.fields?.length ? def.fields.map(f => f.key).filter(k => obj[k] !== undefined) : Object.keys(obj);
    if (!keys.length) return `<div class="world-module-empty">${def.id === window.BAOThreeRealmsCultivation?.id ? '尚未確認修煉狀態。請在故事中說明你的修煉路線與境界；修煉、突破或渡劫明確發生後，狀態會隨故事整理更新。' : '目前沒有資料。'}</div>`;
    return `<div class="world-module-object">${keys.map(key => `<div class="world-module-field"><small>${esc(labelFor(def,key))}</small><b>${esc(displayValue(pretty(obj[key])))}</b></div>`).join("")}</div>`;
  };
  const collectionHTML = (def, value) => {
    const source = Array.isArray(value) ? value : (typeof value === "string" ? [value] : []);
    const list = source.slice(0, 80).flatMap(entry => {
      const decoded = decodeCollectionText(entry);
      return Array.isArray(decoded) ? decoded : [decoded];
    }).slice(0, 80);
    if (!list.length) return '<div class="world-module-empty">目前沒有資料。</div>';
    return `<div class="world-module-collection">${list.map((item,index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return `<article class="world-module-card"><strong>${esc(displayValue(pretty(item)))}</strong></article>`;
      const titleKey = ["name","title","label","item","id"].find(k => item[k] !== undefined && item[k] !== "");
      const title = titleKey ? pretty(item[titleKey]) : `項目 ${index + 1}`;
      const rows = Object.entries(item).filter(([k]) => k !== titleKey && !privateKey(k)).slice(0,12);
      return `<article class="world-module-card"><strong>${esc(displayValue(title))}</strong>${rows.length ? `<div class="world-module-kv">${rows.map(([k,v]) => `<span>${esc(labelFor(def,k))}</span><span>${esc(displayValue(pretty(v)))}</span>`).join("")}</div>` : ""}</article>`;
    }).join("")}</div>`;
  };
  const renderModule = id => {
    window.BAOWorldModules.ensureState(App.activeCharacter);
    const def = (GameState.current?.moduleDefinitions || []).find(x => x.id === id);
    const ui = document.getElementById("ui-panel");
    if (!def || !ui || def.visibility === 'internal') return;
    if (def.id === window.BAOThreeRealmsEventsCore?.id) {
      ui.innerHTML = `<section class="world-module-panel"><div class="world-module-head"><div><h3>${esc(def.icon)} ${esc(def.label)}</h3><p>選擇事件、角色、查詢或世界與劇情構思指令、填入輸入框，再由你送出。只有明確要求的那一輪會使用引導。</p></div><span class="world-module-badge">按需引導</span></div><button type="button" class="secondary" data-open-three-realms-events>開啟故事指令</button></section>`;
      ui.querySelector('[data-open-three-realms-events]')?.addEventListener('click', () => window.BAOStoryQuickCommands?.open?.());
      return;
    }
    const value = GameState.current?.modules?.[id];
    const context = def.context === "core" ? "核心狀態會精簡提供給敘事模型" : def.context === "ui_only" ? "只顯示於介面" : "需要時才使用，避免每輪增加 Context";
    ui.innerHTML = `<section class="world-module-panel"><div class="world-module-head"><div><h3>${esc(def.icon)} ${esc(def.label)}</h3>${def.description ? `<p>${esc(def.description)}</p>` : ""}<div class="world-module-context-note">${esc(context)}</div></div><span class="world-module-badge">${esc(trackLabel(def.tracking))}追蹤</span></div>${def.kind === "collection" ? collectionHTML(def,value) : objectHTML(def,value)}</section>`;
    if (def.id === window.BAOThreeRealmsCultivation?.id && GameState.current?.cultivationUpdateWarning) {
      const note = document.createElement('p');
      note.className = 'world-module-context-note';
      note.textContent = GameState.current.cultivationUpdateWarning;
      ui.querySelector('.world-module-panel')?.appendChild(note);
    }
  };
  const injectTabs = () => {
    if (App.config?.displayMode !== "ui") return;
    window.BAOWorldModules.ensureState(App.activeCharacter);
    const tabs = document.querySelector("#game-ui .ui-tabs");
    if (!tabs) return;
    tabs.querySelectorAll(".module-tab").forEach(x => x.remove());
    const definitions = GameState.current?.moduleDefinitions || [];
    const schema = window.BAOGameplayUI?.schemaFor?.(App.activeCharacter);
    const covered = window.BAOGameplayUICore?.modulePanelCoverage?.(schema, definitions, GameState.current?.modules) || {};
    definitions.filter(def => !covered[def.id]).filter(def => def.visibility !== 'internal').forEach(def => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ui-tab module-tab";
      btn.dataset.panel = `module:${def.id}`;
      btn.textContent = `${def.icon} ${def.label}${schema?.panels?.some(panel => panel.id === def.id) ? '・完整資料' : ''}`;
      btn.onclick = () => {
        tabs.querySelectorAll(".ui-tab").forEach(x => x.classList.remove("active"));
        btn.classList.add("active");
        renderModule(def.id);
      };
      tabs.appendChild(btn);
    });
  };
  const injectBuilderSummary = () => {
    const step = document.querySelector('[data-step-panel="2"]');
    if (!step) return;
    step.querySelector("#world-module-builder-card")?.remove();
    const defs = window.BAOWorldModules.definitions(App.activeCharacter).filter(def => def.visibility !== 'internal');
    if (!defs.length) return;
    const card = document.createElement("div");
    card.id = "world-module-builder-card";
    card.className = "narrative-builder-card";
    card.innerHTML = `<h4>這張作品會追蹤的資料 <span class="chip">作者設定</span></h4><p>世界型作品可以把狀態、背包、技能、任務、勢力等拆成獨立模組。不同資料用不同頻率更新，不需要每輪把整個世界都重讀一次。</p><div class="narrative-summary">${defs.map(d => `<span class="on">${esc(d.icon)} ${esc(d.label)} · ${esc(trackLabel(d.tracking))}</span>`).join("")}</div>`;
    step.appendChild(card);
  };
  const originalPanel = App.renderUIPanel.bind(App);
  App.renderUIPanel = function(panel) {
    if (String(panel || "").startsWith("module:")) return renderModule(String(panel).slice(7));
    return originalPanel(panel);
  };
  const originalRender = App.renderChatShell.bind(App);
  App.renderChatShell = function(fresh = false) {
    window.BAOWorldModules.ensureState(this.activeCharacter);
    originalRender(fresh);
    injectTabs();
  };
  const originalOpenBuilder = App.openBuilder.bind(App);
  App.openBuilder = function() {
    originalOpenBuilder();
    setTimeout(injectBuilderSummary,0);
  };
  // Some models echo the exact internal state block instead of writing prose.
  // Remove only a trailing, clearly marked JSON dump from a MAIN story reply;
  // never parse model text as trusted state or hide arbitrary authored content.
  const stripInternalStateEcho = (text, {partial = false} = {}) => {
    const source = String(text ?? "");
    const pattern = /(^|\r?\n)[ \t]*【(?:目前核心狀態|內部世界狀態｜僅供敘事模型參考)】[ \t]*(?:\r?\n|$)/g;
    let found;
    let marker;
    while ((found = pattern.exec(source))) marker = found;
    if (!marker) return source;
    const body = source.slice(marker.index + marker[0].length).trim();
    if (!body.startsWith("{") && !(partial && !body)) return source;
    if (!partial && !/\}\s*$/.test(body)) return source;
    const prose = source.slice(0, marker.index).trimEnd();
    return prose || (partial ? '正在生成敘事……' : '（模型本輪只回傳內部狀態資料，未生成有效劇情。請重新輸入上一輪指令。）');
  };
  if (typeof API !== "undefined" && typeof API.wrapSend === "function") {
    API.wrapSend("world-module-ui:internal-state-echo", async (next, config, messages, ...rest) => {
      const mainStory = !config?.__connectionTest && !config?.__memoryTask
        && !config?.__stateTask && !config?.__storyTool && !config?.__auxiliaryTask
        && Array.isArray(messages) && messages.some(message =>
          typeof message?.content === "string" && message.content.includes("【目前核心狀態】")
        );
      const result = await next(config, messages, ...rest);
      if (!mainStory || typeof result?.text !== "string") return result;
      const cleaned = stripInternalStateEcho(result.text);
      return cleaned === result.text ? result : {...result, text: cleaned};
    });
  }
  ensureStyles();
  window.BAOWorldModuleUI = { injectTabs, renderModule, injectBuilderSummary, stripInternalStateEcho, statusLines };
})();
