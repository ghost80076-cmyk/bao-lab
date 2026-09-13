(() => {
  if (typeof App === "undefined" || !window.BAOWorldModules) return;
  const esc = v => App.escapeHTML(String(v ?? ""));
  const ensureStyles = () => {
    if (document.querySelector('link[href="css/world-modules.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/world-modules.css";
    document.head.appendChild(link);
  };
  const pretty = v => v === null || v === undefined || v === "" ? "—" : typeof v === "boolean" ? (v ? "是" : "否") : typeof v === "object" ? JSON.stringify(v) : String(v);
  const labelFor = (def,key) => def.fields?.find(f => f.key === key)?.label || key;
  const trackLabel = value => value === "high" ? "高頻" : value === "medium" ? "一般" : value === "low" ? "低頻" : "手動";
  const objectHTML = (def,value) => {
    const obj = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const keys = def.fields?.length ? def.fields.map(f => f.key).filter(k => obj[k] !== undefined) : Object.keys(obj);
    if (!keys.length) return '<div class="world-module-empty">目前沒有資料。</div>';
    return `<div class="world-module-object">${keys.map(key => `<div class="world-module-field"><small>${esc(labelFor(def,key))}</small><b>${esc(pretty(obj[key]))}</b></div>`).join("")}</div>`;
  };
  const collectionHTML = value => {
    const list = Array.isArray(value) ? value : [];
    if (!list.length) return '<div class="world-module-empty">目前沒有資料。</div>';
    return `<div class="world-module-collection">${list.slice(0,80).map((item,index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return `<article class="world-module-card"><strong>${esc(pretty(item))}</strong></article>`;
      const titleKey = ["name","title","label","item","id"].find(k => item[k] !== undefined);
      const title = titleKey ? item[titleKey] : `項目 ${index + 1}`;
      const rows = Object.entries(item).filter(([k]) => k !== titleKey).slice(0,12);
      return `<article class="world-module-card"><strong>${esc(title)}</strong>${rows.length ? `<div class="world-module-kv">${rows.map(([k,v]) => `<span>${esc(k)}</span><span>${esc(pretty(v))}</span>`).join("")}</div>` : ""}</article>`;
    }).join("")}</div>`;
  };
  const renderModule = id => {
    window.BAOWorldModules.ensureState(App.activeCharacter);
    const def = (GameState.current?.moduleDefinitions || []).find(x => x.id === id);
    const ui = document.getElementById("ui-panel");
    if (!def || !ui) return;
    const value = GameState.current?.modules?.[id];
    const context = def.context === "core" ? "核心狀態會精簡提供給敘事模型" : def.context === "ui_only" ? "只顯示於介面" : "需要時才使用，避免每輪增加 Context";
    ui.innerHTML = `<section class="world-module-panel"><div class="world-module-head"><div><h3>${esc(def.icon)} ${esc(def.label)}</h3>${def.description ? `<p>${esc(def.description)}</p>` : ""}<div class="world-module-context-note">${esc(context)}</div></div><span class="world-module-badge">${esc(trackLabel(def.tracking))}追蹤</span></div>${def.kind === "collection" ? collectionHTML(value) : objectHTML(def,value)}</section>`;
  };
  const injectTabs = () => {
    if (App.config?.displayMode !== "ui") return;
    window.BAOWorldModules.ensureState(App.activeCharacter);
    const tabs = document.querySelector("#game-ui .ui-tabs");
    if (!tabs) return;
    tabs.querySelectorAll(".module-tab").forEach(x => x.remove());
    (GameState.current?.moduleDefinitions || []).forEach(def => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ui-tab module-tab";
      btn.dataset.panel = `module:${def.id}`;
      btn.textContent = `${def.icon} ${def.label}`;
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
    const defs = window.BAOWorldModules.definitions(App.activeCharacter);
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
  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    if (this.config?.narrativeMode !== "world" && this.config?.displayMode !== "ui") return base;
    const core = window.BAOWorldModules.compactForPrompt();
    return core ? `${base}\n\n【目前核心狀態】\n${core}\n以上只視為目前事實，不要為了提到狀態而刻意改寫劇情。` : base;
  };
  ensureStyles();
  window.BAOWorldModuleUI = { injectTabs, renderModule, injectBuilderSummary };
})();