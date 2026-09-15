(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof API === "undefined") return;
  let draft = "";
  const sourceText = (mode, slots) => {
    const all = Chat.messages || [];
    const take = n => all.slice(-Math.max(1,n)*2);
    let chosen = mode === "recent10" ? take(10) : mode === "recent40" ? take(40) : mode === "unsummarized" ? all.slice(Math.max(0,Number(Chat.summarizedUntil||0))) : mode === "all" || mode === "all-plus-notes" ? all : take(20);
    let text = chosen.map(m=>`${m.role === "user" ? "玩家" : "角色"}：${m.content}`).join("\n\n");
    if (mode === "all-plus-notes") {
      const notes = slots.filter(x=>x.enabled&&x.text?.trim()).map(x=>`【${x.title}】\n${x.text.trim()}`).join("\n\n");
      text = [text,notes].filter(Boolean).join("\n\n");
    }
    return text;
  };
  const prompt = (source,style) => {
    const focus = style === "compact" ? "高度壓縮，只保留會影響後續劇情或角色行為的資訊。" : style === "continuity" ? "優先整理時間順序、因果、承諾、未完成目標與伏筆。" : "完整整理角色關係、重要事件、情緒轉折、秘密、承諾、物品或能力變化與未完成事項。";
    return ["你是角色扮演故事的記憶整理助手，不是故事作者。",focus,"只能使用來源中已經存在的資訊，不得自行補劇情。",window.BAOHelperData.memoryRules,`【來源】\n${source}`].join("\n\n");
  };
  const html = slots => {
    const model = App.config?.memory?.summaryModel || App.config?.api?.model || "";
    const smart = App.config?.memory?.mode === "smart";
    const initial = sourceText("recent20",slots).length;
    return `<label class="memory-auto-row"><span><b>自動整理</b><br><small class="note">開啟後沿用智慧摘要；關閉後只保留固定輪數。</small></span><input type="checkbox" data-auto-summary ${smart?"checked":""}></label><div class="memory-refine-grid"><section class="memory-refine-card"><h4>① 資料範圍</h4><p>範圍越小通常越省 Token。<br><b data-source-size>${initial.toLocaleString()} 字</b> · 實際 Token 以服務商回傳為準。</p><select data-refine-source><option value="recent10">最近 10 輪</option><option value="recent20" selected>最近 20 輪</option><option value="recent40">最近 40 輪</option><option value="unsummarized">尚未摘要內容</option><option value="all">全部對話</option><option value="all-plus-notes">全部對話＋長期筆記</option></select></section><section class="memory-refine-card"><h4>② 整理模型</h4><p>可與聊天模型不同，適合改用較便宜的模型；這個選擇也會套用到自動摘要。</p><div class="memory-model-line"><input data-refine-model placeholder="留空＝聊天模型" value="${App.escapeAttr(model)}"><button type="button" class="secondary" data-main-model>聊天模型</button></div></section><section class="memory-refine-card"><h4>③ 寫入位置</h4><p>整理稿先預覽，再由玩家決定寫入。</p><select data-refine-target>${slots.map(s=>`<option value="${App.escapeAttr(s.id)}">${App.escapeHTML(s.title)}</option>`).join("")}<option value="__new">建立新的長期筆記</option></select></section><section class="memory-refine-card"><h4>④ 整理方式</h4><p>可依用途改變壓縮重點。</p><select data-refine-style><option value="deep">深度整理</option><option value="compact">極簡壓縮</option><option value="continuity">劇情連續性</option></select></section><section class="memory-refine-card full"><h4>整理稿</h4><p>實際執行使用玩家自己的 API；本機預覽不會偽裝成 AI 整理。</p><div class="memory-draft" data-refine-draft>${draft ? App.escapeHTML(draft) : '<span class="note">尚未產生整理稿。</span>'}</div><div class="memory-draft-actions"><button type="button" class="secondary" data-write-draft ${draft?"":"disabled"}>寫入長期筆記</button><button type="button" class="memory-refine-run" data-run-refine>產生整理稿</button></div><div class="memory-refine-status" data-refine-status></div></section></div>`;
  };
  const mount = (root,slots) => {
    const area=root.querySelector("#memory-ai-area");if(!area)return;area.innerHTML=html(slots);
    const syncModel = () => {
      App.config.memory = App.config.memory || {};
      App.config.memory.summaryModel = area.querySelector("[data-refine-model]")?.value.trim() || "";
      const input=document.getElementById("memory-summary-model");if(input)input.value=App.config.memory.summaryModel;
      App.saveStory?.(false);
    };
    const syncSize = () => {
      const src=sourceText(area.querySelector("[data-refine-source]")?.value || "recent20",window.BAOMemoryWorkbench.readSlots());
      const el=area.querySelector("[data-source-size]");if(el)el.textContent=`${src.length.toLocaleString()} 字`;
    };
    area.querySelector("[data-auto-summary]")?.addEventListener("change",e=>{App.config.memory=App.config.memory||{};App.config.memory.mode=e.target.checked?"smart":"rounds";const select=document.getElementById("memory-mode");if(select)select.value=App.config.memory.mode;App.saveStory?.(false);});
    area.querySelector("[data-refine-source]")?.addEventListener("change",syncSize);
    area.querySelector("[data-refine-model]")?.addEventListener("change",syncModel);
    area.querySelector("[data-main-model]")?.addEventListener("click",()=>{area.querySelector("[data-refine-model]").value=App.config?.api?.model||"";syncModel();});
    area.querySelector("[data-run-refine]")?.addEventListener("click",async()=>{
      const status=area.querySelector("[data-refine-status]"),run=area.querySelector("[data-run-refine]");
      if(App.config?.demoMode||!App.config?.api?.key){status.textContent="目前只能預覽功能；玩家連上自己的 API 後才能執行 AI 整理。";return;}
      const src=sourceText(area.querySelector("[data-refine-source]").value,window.BAOMemoryWorkbench.readSlots());
      if(!src.trim()){status.textContent="目前沒有可整理的內容。";return;}
      const model=area.querySelector("[data-refine-model]").value.trim()||App.config.api.model;
      const style=area.querySelector("[data-refine-style]").value;
      syncModel();run.disabled=true;status.textContent=`整理中 · ${model}`;
      try{
        const cfg={...App.config.api,model,__memoryTask:true,maxOutputTokens:1400};
        const result=await API.send(cfg,[{role:"system",content:"只進行記憶整理，不要續寫故事。"},{role:"user",content:prompt(src,style)}]);
        draft=window.BAOHelperData.memoryText(result?.text||"");area.querySelector("[data-refine-draft]").textContent=draft||"模型沒有回傳整理內容。";area.querySelector("[data-write-draft]").disabled=!draft;status.textContent=draft?`完成 · ${Number(result?.usage?.total_tokens||0).toLocaleString()} tokens`:"沒有產生整理稿。";
      }catch(err){status.textContent=`整理失敗：${String(err.message||err).split("\n")[0]}`;}finally{run.disabled=false;}
    });
    area.querySelector("[data-write-draft]")?.addEventListener("click",()=>{
      if(!draft)return;const current=window.BAOMemoryWorkbench.readSlots();const target=area.querySelector("[data-refine-target]").value;
      if(target==="__new")current.push({id:`memory-${Date.now()}`,title:"AI 整理記憶",text:draft.slice(0,20000),enabled:true});else{const slot=current.find(x=>x.id===target);if(slot)slot.text=draft.slice(0,20000);}
      window.BAOMemoryWorkbench.writeSlots(current);syncModel();window.BAOMemoryWorkbench.refresh(root,"notes");
    });
  };
  window.BAOMemoryAI={mount};
})();
