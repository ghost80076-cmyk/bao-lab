(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;
  const KEY = "bao-lab:player-memory-slots";
  const esc = v => App.escapeHTML(String(v ?? ""));
  const attr = v => App.escapeAttr(String(v ?? ""));
  const blank = () => [{ id: "memory-1", title: "記憶 1", text: "", enabled: true }];
  let saveTimer = null;
  const ensureStyles = () => {
    if (document.querySelector('link[href="css/memory-workbench.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/memory-workbench.css";
    document.head.appendChild(link);
  };
  const read = () => {
    // Every active story has its own manual notes. Missing notes in a legacy story are
    // populated by Storage.applyPreferences when that story is restored.
    const story = window.GameState?.current;
    if (story) {
      const slots = story.memorySlots;
      return Array.isArray(slots) && slots.length ? slots : blank();
    }
    try {
      const slots = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(slots) && slots.length ? slots : blank();
    } catch { return blank(); }
  };
  const write = slots => {
    const next = Array.isArray(slots) && slots.length ? slots : blank();
    const story = window.GameState?.current;
    if (!story) { localStorage.setItem(KEY, JSON.stringify(next)); return; }
    story.memorySlots = next;
    clearTimeout(saveTimer);
    // The normal story save includes memorySlots and also protects API keys.
    saveTimer = setTimeout(() => {
      if (window.GameState?.current === story) App.saveStory?.(false);
      saveTimer = null;
    }, 350);
  };
  const close = () => {
    document.querySelector(".memory-desk-backdrop")?.remove();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; App.saveStory?.(false); }
  };
  const memoryStateLabel = diag => {
    if (Chat.summarizing || diag.health?.phase === "running") return "整理中";
    if (diag.health?.phase === "failed") return "整理失敗";
    if (diag.hasSummary) return "摘要正常";
    if (diag.pendingRounds > 0) return "等待整理";
    return "近期原文完整";
  };
  const stats = root => {
    const slots = read();
    const diag = Chat.memoryDiagnostics?.(App.config) || { totalRounds: Chat.turnCount?.() || 0, coveredRounds: 0, pendingRounds: 0, hasSummary: Boolean(Chat.summary), health: {} };
    const model = diag.model || App.config?.api?.model || "未設定";
    const data = {
      rounds:`${diag.totalRounds} 輪`,
      auto:memoryStateLabel(diag),
      covered:diag.hasSummary ? `${diag.coveredRounds} 輪` : "尚未建立",
      pending:`${diag.pendingRounds} 輪`,
      notes:`${slots.filter(x => x.text?.trim()).length} 筆`,
      api:App.config?.demoMode ? "本機預覽" : model
    };
    Object.entries(data).forEach(([k,v]) => { const el = root.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v; });
  };
  const contextHTML = () => {
    const recent = (Chat.messages || []).slice(-12);
    const diag = Chat.memoryDiagnostics?.(App.config) || { totalRounds: Chat.turnCount?.() || 0, coveredRounds: 0, pendingRounds: 0, recentRounds: 0, hasSummary: Boolean(Chat.summary), health: {}, model: App.config?.api?.model || "" };
    const health = diag.health || {};
    const time = health.phase === "failed" ? health.lastFailureAt : health.lastSuccessAt;
    const timeText = time ? new Date(time).toLocaleString("zh-TW") : "尚無紀錄";
    const statusText = health.phase === "failed"
      ? `摘要失敗：${health.message || "原始對話仍完整保留，待下次重試。"}`
      : health.phase === "running"
        ? (health.message || "正在整理舊對話。")
        : diag.hasSummary
          ? `長期摘要已覆蓋 ${diag.coveredRounds} 輪；尚有 ${diag.pendingRounds} 輪達到待整理條件。`
          : diag.pendingRounds > 0
            ? `已有 ${diag.pendingRounds} 輪舊內容等待自動整理；未成功摘要前不會從原文脈絡移除。`
            : `目前 ${diag.totalRounds} 輪仍由近期原文直接提供，尚未需要建立長期摘要。`;
    return `<section class="memory-pane active" data-pane="context"><div class="memory-pane-title"><div><h3>記憶總覽</h3><p>確認故事模型現在使用的近期原文、自動摘要與整理狀態。</p></div><span class="memory-pill">MEMORY HEALTH</span></div>
      <article class="memory-health-card" data-memory-health="${esc(health.phase || "idle")}"><b>${esc(memoryStateLabel(diag))}</b><p>${esc(statusText)}</p><div class="memory-health-meta"><span>摘要模型：${esc(diag.model || "沿用聊天模型")}</span><span>最後紀錄：${esc(timeText)}</span><span>格式修復：${health.repaired ? "曾自動修復" : "未使用"}</span></div></article>
      ${diag.hasSummary ? `<details class="memory-summary-preview"><summary>查看目前長期摘要</summary><pre>${esc(Chat.summary)}</pre></details>` : ""}
      <div class="memory-pane-title memory-preview-title"><div><h3>近期脈絡預覽</h3><p>下面只顯示最近 12 則訊息作為預覽，不代表模型實際只收到這些內容。</p></div><span class="memory-pill">PREVIEW ONLY</span></div>
      <div class="memory-context-list">${recent.length ? recent.map(m=>`<article class="memory-context-item"><span class="role">${m.role === "user" ? "PLAYER" : "CHARACTER"}</span><p>${esc(String(m.content).slice(0,1200))}</p></article>`).join("") : '<div class="memory-empty">目前還沒有對話。</div>'}</div></section>`;
  };
  const notesHTML = slots => `<section class="memory-pane" data-pane="notes"><div class="memory-pane-title"><div><h3>長期筆記</h3><p>此故事啟用中的內容會提供給故事模型；可手動新增、修改或停用。不同故事互不混用。</p></div><span class="memory-pill">STORY LOCAL</span></div><div class="memory-note-grid">${slots.map(s=>`<article class="memory-note-card" data-slot="${attr(s.id)}"><div class="memory-note-top"><input type="checkbox" data-slot-enabled ${s.enabled?"checked":""}><input type="text" data-slot-title maxlength="60" value="${attr(s.title)}"><button type="button" class="memory-note-delete" data-slot-delete>刪除</button></div><textarea data-slot-text maxlength="20000" placeholder="世界觀、NPC、角色關係、重要事件與承諾…">${esc(s.text||"")}</textarea><div class="memory-note-meta"><span>本故事長期筆記</span><span data-slot-count>${String(s.text||"").length.toLocaleString()} / 20,000</span></div></article>`).join("")}</div><button type="button" class="memory-add-note" data-add-note>＋ 新增長期筆記</button></section>`;
  const refineShellHTML = () => `<section class="memory-pane" data-pane="refine"><div class="memory-pane-title"><div><h3>AI 整理</h3><p>選擇資料範圍與整理模型，先產生草稿，再決定是否寫入長期筆記。</p></div><span class="memory-pill">MODEL ASSIST</span></div><div id="memory-ai-area"></div></section>`;
  const canonShellHTML = () => `<section class="memory-pane" data-pane="canon"><div class="memory-pane-title"><div><h3>Canon 資料庫</h3><p>從歷史對話建立可校驗、可修改、由玩家確認的劇情基準。</p></div><span class="memory-pill">PLAYER CONFIRMED</span></div><div id="canon-workbench-area"></div></section>`;
  const switchPane = (root,name) => {
    root.querySelectorAll(".memory-desk-tab").forEach(x=>x.classList.toggle("active",x.dataset.tab===name));
    root.querySelectorAll(".memory-pane").forEach(x=>x.classList.toggle("active",x.dataset.pane===name));
  };
  const collect = root => [...root.querySelectorAll("[data-slot]")].map(node=>({id:node.dataset.slot,title:node.querySelector("[data-slot-title]")?.value.trim()||"未命名記憶",text:node.querySelector("[data-slot-text]")?.value||"",enabled:Boolean(node.querySelector("[data-slot-enabled]")?.checked)}));
  const bindNotes = root => {
    root.querySelectorAll("[data-slot-text]").forEach(el=>el.addEventListener("input",()=>{const card=el.closest("[data-slot]");card.querySelector("[data-slot-count]").textContent=`${el.value.length.toLocaleString()} / 20,000`;write(collect(root));stats(root);}));
    root.querySelectorAll("[data-slot-title],[data-slot-enabled]").forEach(el=>el.addEventListener("change",()=>{write(collect(root));stats(root);}));
    root.querySelectorAll("[data-slot-delete]").forEach(btn=>btn.addEventListener("click",()=>{btn.closest("[data-slot]")?.remove();let slots=collect(root);if(!slots.length)slots=blank();write(slots);render(root,"notes");}));
    root.querySelector("[data-add-note]")?.addEventListener("click",()=>{const slots=collect(root);slots.push({id:`memory-${Date.now()}`,title:`記憶 ${slots.length+1}`,text:"",enabled:true});write(slots);render(root,"notes");});
  };
  const render = (root,active="context") => {
    const slots = read();
    const box = root.querySelector(".memory-desk-content");
    box.innerHTML = contextHTML()+notesHTML(slots)+refineShellHTML()+canonShellHTML();
    bindNotes(root); switchPane(root,active); stats(root);
    window.BAOMemoryAI?.mount?.(root,slots);
    window.BAOCanonWorkbench?.mount?.(root);
  };
  const open = () => {
    close(); ensureStyles();
    const wrap=document.createElement("div"); wrap.className="memory-desk-backdrop";
    wrap.innerHTML=`<section class="memory-desk"><header class="memory-desk-head"><div class="memory-desk-kicker">MEMORY DESK · BAO/LAB</div><h2>記憶工作台</h2><p>把「近期脈絡」「長期筆記」「AI 整理」「正式劇情資料庫（Canon）」拆開管理。</p></div><button type="button" class="memory-desk-close">關閉</button></header><div class="memory-desk-stats"><div class="memory-desk-stat"><span>對話輪數</span><b data-stat="rounds">—</b></div><div class="memory-desk-stat"><span>自動記憶</span><b data-stat="auto">—</b></div><div class="memory-desk-stat"><span>摘要已覆蓋</span><b data-stat="covered">—</b></div><div class="memory-desk-stat"><span>待整理</span><b data-stat="pending">—</b></div><div class="memory-desk-stat"><span>固定筆記</span><b data-stat="notes">—</b></div><div class="memory-desk-stat"><span>整理模型</span><b data-stat="api">—</b></div></div><div class="memory-desk-main"><nav class="memory-desk-nav"><button class="memory-desk-tab active" data-tab="context"><b>記憶總覽</b><span>狀態、摘要與近期預覽</span></button><button class="memory-desk-tab" data-tab="notes"><b>長期筆記</b><span>管理本故事固定記憶</span></button><button class="memory-desk-tab" data-tab="refine"><b>AI 整理</b><span>指定模型整理</span></button><button class="memory-desk-tab" data-tab="canon"><b>正式劇情資料庫（Canon）</b><span>重建與校驗劇情</span></button></nav><div class="memory-desk-content"></div></div></section>`;
    document.body.appendChild(wrap); render(wrap);
    wrap.querySelector(".memory-desk-close").onclick=close;
    wrap.addEventListener("click",e=>{if(e.target===wrap)close();});
    wrap.querySelectorAll(".memory-desk-tab").forEach(btn=>btn.addEventListener("click",()=>switchPane(wrap,btn.dataset.tab)));
  };
  const bindButton=()=>{const btn=document.querySelector('#bao-player-settings [data-bao-open="memory"]');if(!btn)return;btn.textContent="🧠 記憶工作台";btn.onclick=open;};
  const originalRender=App.renderChatShell.bind(App);App.renderChatShell=function(fresh=false){originalRender(fresh);setTimeout(bindButton,0);};
  window.BAOMemoryWorkbench={open,readSlots:read,writeSlots:write,refresh:(root,tab)=>render(root,tab)};
  ensureStyles(); setTimeout(bindButton,180);
})();
