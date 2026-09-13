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
    const track = def.tracking === "high" ? "高頻追蹤" : def.tracking === "medium" ? "一般追蹤" : def.tracking === "low" ? "低頻追蹤" : "手動資料";
    const context = def.context === "core" ? "核心狀態會精簡提供給敘事模型" : def.context === "ui_only" ? "只顯示於介面" : "需要時才使用，避免每輪增加 Context";
    ui.innerHTML = `<section class="world-module-panel"><div class="world-module-head"><div><h3>${esc(def.icon)} ${esc(def.label)}</h3>${def.description ? `<p>${esc(def.description)}</p>` : ""}<div class="world-module-context-note">${esc(context)}</div></div><span class="world-module-badge">${esc(track)}</span></div>${def.kind === "collection" ? collectionHTML(value) : objectHTML(def,value)}</section>`;
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
  const originalBuild = App.buildSystemPrompt.bind(App);
  App.buildSystemPrompt = function() {
    const base = originalBuild();
    if (this.config?.narrativeMode !== "world" && this.config?.displayMode !== "ui") return base;
    const core = window.BAOWorldModules.compactForPrompt();
    return core ? `${base}\n\n【目前核心狀態】\n${core}\n以上只視為目前事實，不要為了提到狀態而刻意改寫劇情。` : base;
  };
  ensureStyles();
  window.BAOWorldModuleUI = { injectTabs, renderModule };
})();