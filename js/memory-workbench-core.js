(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined") return;
  const KEY = "bao-lab:player-memory-slots";
  const esc = v => App.escapeHTML(String(v ?? ""));
  const attr = v => App.escapeAttr(String(v ?? ""));
  const ensureStyles = () => {
    if (document.querySelector('link[href="css/memory-workbench.css"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "css/memory-workbench.css";
    document.head.appendChild(link);
  };
  const read = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(v) && v.length ? v : [{id:"memory-1",title:"記憶 1",text:"",enabled:true}]; } catch { return [{id:"memory-1",title:"記憶 1",text:"",enabled:true}]; } };
  const write = slots => localStorage.setItem(KEY, JSON.stringify(slots));
  const close = () => document.querySelector(".memory-desk-backdrop")?.remove();
  const stats = root => {
    const slots = read();
    const data = {
      rounds:`${Math.ceil((Chat.messages?.length || 0) / 2)} 輪`,
      notes:`${slots.filter(x => x.text?.trim()).length} 筆`,
      chars:`${slots.reduce((n,x)=>n+String(x.text||"").length,0).toLocaleString()} 字`,
      api:App.config?.demoMode ? "本機預覽" : (App.config?.api?.key ? "已連線" : "未連線")
    };
    Object.entries(data).forEach(([k,v]) => { const el = root.querySelector(`[data-stat="${k}"]`); if (el) el.textContent = v; });
  };
  const contextHTML = () => {
    const recent = (Chat.messages || []).slice(-12);
    return `<section class="memory-pane active" data-pane="context"><div class="memory-pane-title"><div><h3>即時脈絡</h3><p>只查看最近對話，避免把聊天紀錄和長期記憶混在一起。</p></div><span class="memory-pill">RECENT</span></div><div class="memory-context-list">${recent.length ? recent.map(m=>`<article class="memory-context-item"><span class="role">${m.role === "user" ? "PLAYER" : "CHARACTER"}</span><p>${esc(String(m.content).slice(0,1200))}</p></article>`).join("") : '<div class="memory-empty">目前還沒有對話。</div>'}</div></section>`;
  };
  const notesHTML = slots => `<section class="memory-pane" data-pane="notes"><div class="memory-pane-title"><div><h3>長期筆記</h3><p>啟用中的內容會提供給故事模型，可手動新增、修改或停用。</p></div><span class="memory-pill">LOCAL</span></div><div class="memory-note-grid">${slots.map(s=>`<article class="memory-note-card" data-slot="${attr(s.id)}"><div class="memory-note-top"><input type="checkbox" data-slot-enabled ${s.enabled?"checked":""}><input type="text" data-slot-title maxlength="60" value="${attr(s.title)}"><button type="button" class="memory-note-delete" data-slot-delete>刪除</button></div><textarea data-slot-text maxlength="20000" placeholder="角色關係、重要事件、秘密、承諾、狀態變化…">${esc(s.text||"")}</textarea><div class="memory-note-meta"><span>長期筆記</span><span data-slot-count>${String(s.text||"").length.toLocaleString()} / 20,000</span></div></article>`).join("")}</div><button type="button" class="memory-add-note" data-add-note>＋ 新增長期筆記</button></section>`;
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
    root.querySelectorAll("[data-slot-delete]").forEach(btn=>btn.addEventListener("click",()=>{btn.closest("[data-slot]")?.remove();let slots=collect(root);if(!slots.length)slots=[{id:"memory-1",title:"記憶 1",text:"",enabled:true}];write(slots);render(root,"notes");}));
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
    wrap.innerHTML=`<section class="memory-desk"><header class="memory-desk-head"><div><div class="memory-desk-kicker">MEMORY DESK · BAO/LAB</div><h2>記憶工作台</h2><p>把「近期脈絡」「長期筆記」「AI 整理」「Canon」拆開管理。</p></div><button type="button" class="memory-desk-close">關閉</button></header><div class="memory-desk-stats"><div class="memory-desk-stat"><span>Conversation</span><b data-stat="rounds">—</b></div><div class="memory-desk-stat"><span>Memory cards</span><b data-stat="notes">—</b></div><div class="memory-desk-stat"><span>Stored text</span><b data-stat="chars">—</b></div><div class="memory-desk-stat"><span>Organizer</span><b data-stat="api">—</b></div></div><div class="memory-desk-main"><nav class="memory-desk-nav"><button class="memory-desk-tab active" data-tab="context"><b>即時脈絡</b><span>查看最近對話</span></button><button class="memory-desk-tab" data-tab="notes"><b>長期筆記</b><span>管理固定記憶</span></button><button class="memory-desk-tab" data-tab="refine"><b>AI 整理</b><span>指定模型整理</span></button><button class="memory-desk-tab" data-tab="canon"><b>Canon 資料庫</b><span>重建與校驗劇情</span></button></nav><div class="memory-desk-content"></div></div></section>`;
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
