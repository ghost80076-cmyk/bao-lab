(() => {
  if (typeof App === "undefined" || typeof Chat === "undefined" || typeof API === "undefined") return;
  const currentStory = () => window.GameState?.current;
  const currentDraft = () => String(currentStory()?.memoryRefineDraft || "");
  const active = new WeakMap(), updates = new WeakMap(), views = new WeakMap();
  const refresh = (area,owner) => {
    if(!owner||currentStory()!==owner||views.get(area)!==owner)return;
    const running=active.get(owner);
    area.querySelectorAll('button,select,input').forEach(control=>control.disabled=Boolean(running));
    if(running){area.querySelector('[data-refine-source]').value=running.mode;area.querySelector('[data-refine-style]').value=running.style;}
    if(currentDraft())area.querySelector('[data-refine-draft]').textContent=currentDraft();
    area.querySelector('[data-write-draft]').disabled=Boolean(running)||!currentDraft();
    if(updates.has(owner))area.querySelector('[data-refine-status]').textContent=updates.get(owner);
  };
  const notify = (owner,message) => {
    updates.set(owner,message);
    document.querySelectorAll('#memory-ai-area').forEach(area=>refresh(area,owner));
  };
  const sourceText = (mode, slots) => {
    const all = Chat.messages || [];
    const take = n => all.slice(-Math.max(1,n)*2);
    let chosen = mode === "recent10" ? take(10) : mode === "recent40" ? take(40) : mode === "unsummarized" ? all.slice(Math.max(0,Number(Chat.summarizedUntil||0))) : mode === "all" || mode === "all-plus-notes" ? all : take(20);
    let text = chosen.map(m=>`[${m.id || "legacy"}] ${m.role === "user" ? "玩家" : "角色"}：${m.role === "assistant" && Chat.modelContent ? Chat.modelContent(m) : m.content}`).join("\n\n");
    if (mode === "all-plus-notes") {
      const notes = slots.filter(x=>x.enabled&&x.text?.trim()).map(x=>`【${x.title}】\n${x.text.trim()}`).join("\n\n");
      text = [text,notes].filter(Boolean).join("\n\n");
    }
    return text;
  };
  const prompt = (source,style,previous="") => {
    const focus = style === "compact" ? "高度壓縮，只保留會影響後續劇情或角色行為的資訊。" : style === "continuity" ? "優先整理時間順序、因果、承諾、未完成目標與伏筆。" : "完整整理角色關係、重要事件、情緒轉折、秘密、承諾、物品或能力變化與未完成事項。";
    return ["你是角色扮演故事的記憶整理助手，不是故事作者。",focus,"只能使用來源中已經存在的資訊，不得自行補劇情。",window.BAOHelperData.memoryRules,"四類摘要各最多 8 項，每項最多 80 字；合併重複資訊，只輸出完整 JSON。",previous ? `【已完成批次的摘要】\n${previous}` : "",`【本批來源】\n${source}`].join("\n\n");
  };
  const html = slots => {
    const draft = currentDraft();
    let model = "尚未連接";
    try { model = window.BAOMemoryCore.resolve(App.config).model || model; } catch {}
    const smart = App.config?.memory?.mode === "smart";
    const initial = sourceText("recent20",slots).length;
    return `<label class="memory-auto-row"><span><b>自動整理</b><br><small class="note">開啟後沿用智慧摘要；關閉後只保留固定輪數。</small></span><input type="checkbox" data-auto-summary ${smart?"checked":""}></label><div class="memory-refine-grid"><section class="memory-refine-card"><h4>① 資料範圍</h4><p>範圍越小通常越省 Token。<br><b data-source-size>${initial.toLocaleString()} 字</b> · 實際 Token 以服務商回傳為準。</p><select data-refine-source><option value="recent10">最近 10 輪</option><option value="recent20" selected>最近 20 輪</option><option value="recent40">最近 40 輪</option><option value="unsummarized">尚未摘要內容</option><option value="all">全部對話</option><option value="all-plus-notes">全部對話＋長期筆記</option></select></section><section class="memory-refine-card"><h4>② 整理模型</h4><p>與自動記憶、劇情檔案及摘要包共用同一個整理模型；到 API 設定選擇沿用聊天或獨立模型。</p><div class="memory-model-line"><input data-refine-model readonly aria-label="目前整理模型" value="${App.escapeAttr(model)}"><button type="button" class="secondary" data-main-model>API 設定</button></div></section><section class="memory-refine-card"><h4>③ 寫入位置</h4><p>整理稿先預覽，再決定寫入；不會更新自動摘要進度。</p><select data-refine-target>${slots.map(s=>`<option value="${App.escapeAttr(s.id)}">${App.escapeHTML(s.title)}</option>`).join("")}<option value="__new">建立新的長期筆記</option></select></section><section class="memory-refine-card"><h4>④ 整理方式</h4><p>可依用途改變壓縮重點。</p><select data-refine-style><option value="deep">深度整理</option><option value="compact">極簡壓縮</option><option value="continuity">劇情連續性</option></select></section><section class="memory-refine-card full"><h4>整理稿</h4><p>使用目前設定的整理模型，依連線方式消耗 API 額度或燈火；長篇會分批整理，每次最多 8 批；成功批次會保存進度，完成全部來源後才提供可寫入的草稿。</p><div class="memory-draft" data-refine-draft>${draft ? App.escapeHTML(draft) : '<span class="note">尚未產生整理稿。</span>'}</div><div class="memory-draft-actions"><button type="button" class="secondary" data-write-draft ${draft?"":"disabled"}>寫入長期筆記</button><button type="button" class="memory-refine-run" data-run-refine>產生整理稿</button></div><div class="memory-refine-status" role="status" aria-live="polite" data-refine-status></div></section></div>`;
  };
  const mount = (root,slots) => {
    const area=root.querySelector("#memory-ai-area");if(!area)return;area.innerHTML=html(slots);
    const pending=currentStory()?.memoryRefineJob;
    const viewOwner=currentStory();
    if(pending?.mode)area.querySelector('[data-refine-source]').value=pending.mode;
    if(pending?.style)area.querySelector('[data-refine-style]').value=pending.style;
    if(pending)area.querySelector('[data-refine-status]').textContent=`已保存 ${pending.completed||0} 批，可按「產生整理稿」繼續；仍會產生模型費用。`;
    views.set(area,viewOwner);
    refresh(area,viewOwner);
    const syncSize = () => {
      const src=sourceText(area.querySelector("[data-refine-source]")?.value || "recent20",window.BAOMemoryWorkbench.readSlots());
      const el=area.querySelector("[data-source-size]");if(el)el.textContent=`${src.length.toLocaleString()} 字`;
    };
    area.querySelector("[data-auto-summary]")?.addEventListener("change",e=>{App.config.memory=App.config.memory||{};App.config.memory.mode=e.target.checked?"smart":"rounds";const select=document.getElementById("memory-mode");if(select)select.value=App.config.memory.mode;App.saveStory?.(false);});
    area.querySelector("[data-refine-source]")?.addEventListener("change",syncSize);
    area.querySelector("[data-main-model]")?.addEventListener("click",()=>{
      root.querySelector('.memory-desk-close')?.click();
      window.BAOChatAPISettings?.open?.();
    });
    area.querySelector("[data-run-refine]")?.addEventListener("click",async()=>{
      const status=area.querySelector("[data-refine-status]"),run=area.querySelector("[data-run-refine]");
      const core=window.BAOMemoryCore,owner=currentStory(),storyConfig=App.config;
      if(!core){status.textContent='整理器尚未載入完成，請重新載入頁面；原資料保留。';return;}
      if(!owner || storyConfig?.demoMode){status.textContent="請先連接整理模型，再整理目前故事。";return;}
      if(active.has(owner)){status.textContent='本故事的 AI 整理仍在進行中。';return;}
      const mode=area.querySelector("[data-refine-source]").value;
      const style=area.querySelector("[data-refine-style]").value;
      Chat.ensureMessageIds?.();
      const readSource=()=>sourceText(mode,window.BAOMemoryWorkbench.readSlots());
      const src=readSource();
      if(!src.trim()){status.textContent="目前沒有可整理的內容。";return;}
      const sourceId=core.fingerprint(src);
      const isCurrent=()=>currentStory()===owner&&App.config===storyConfig&&core.fingerprint(readSource())===sourceId;
      const controls=[...area.querySelectorAll('button,select,input')];
      try{
        const cfg=core.config(storyConfig,'notes',App.modelPresets||[]);
        window.BAOCreditsPilot?.prepareAccountConfig?.(cfg);
        if(!cfg.key&&!cfg.local&&!window.BAOCreditsPilot?.isAccountReady?.(cfg))throw new Error("整理模型尚未連線，請先完成 API 設定。");
        const makeMessages=(chunk,previous)=>[{role:"system",content:"只進行記憶整理，不要續寫故事。"},{role:"user",content:prompt(chunk,style,previous)}];
        const planId=core.fingerprint(JSON.stringify([1,mode,style,cfg.model,cfg.baseUrl,cfg.protocol,cfg.maxOutputTokens,cfg.__memoryInputTokens,cfg.__memoryContextTokens]));
        const jobId=core.fingerprint(JSON.stringify([sourceId,planId]));
        const saved=owner.memoryRefineJob;
        const prior=saved?.planId===planId&&saved.offset<=src.length&&saved.prefix===core.fingerprint(src.slice(0,saved.offset))?saved:{};
        const remaining=src.slice(prior.offset||0);
        const estimated=Math.max(1,Math.ceil(core.tokens(remaining)/core.sourceBudget(cfg,makeMessages('',prior.summary||''))));
        if(estimated>1&&!confirm(`本次來源預估至少需要 ${estimated} 批整理，每批會產生模型費用；每次最多執行 8 批，可從成功進度繼續。要開始嗎？`))return;
        active.set(owner,{mode,style});
        controls.forEach(control=>control.disabled=true);
        notify(owner,`整理中 · ${cfg.model}`);
        const result=await core.foldText({source:src,config:cfg,checkpoint:prior,makeMessages,
          send:(...args)=>API.send(...args),isCurrent,
          normalize:async response=>{
            const normalized=await Chat.normalizeMemoryResult(cfg,response?.text||'',isCurrent);
            if(!normalized.summary)throw new Error(normalized.error||'模型沒有產生可用整理稿。');
            return normalized.summary;
          },
          save:async checkpoint=>{owner.memoryRefineJob={version:1,id:jobId,planId,prefix:core.fingerprint(src.slice(0,checkpoint.offset)),mode,style,...checkpoint};App.saveStory?.(false);},
          onProgress:progress=>notify(owner,`整理中 · 已完成 ${progress.completed} 批 · ${Math.floor(progress.offset/src.length*100)}%`)
        });
        if(result.complete){
          owner.memoryRefineDraft=result.summary;
          delete owner.memoryRefineJob;
          area.querySelector('[data-refine-draft]').textContent=result.summary;
          notify(owner,`完成 · 共 ${result.completed} 批，請預覽後寫入。`);
        }else notify(owner,`已保存 ${result.completed} 批進度，尚有來源未整理；按「產生整理稿」繼續。`);
        App.saveStory?.(false);
      }catch(err){if(currentStory()===owner)notify(owner,`整理失敗：${String(err.message||err).split("\n")[0]}${owner.memoryRefineJob?'；已完成批次保留，可再次按下繼續。':''}`);}
      finally{
        active.delete(owner);
        controls.forEach(control=>control.disabled=false);
        area.querySelector('[data-write-draft]').disabled=!currentDraft();
        notify(owner,updates.get(owner)||status.textContent);
      }
    });
    area.querySelector("[data-write-draft]")?.addEventListener("click",()=>{
      const draft=currentDraft();if(!draft)return;const current=window.BAOMemoryWorkbench.readSlots();const target=area.querySelector("[data-refine-target]").value;
      if(target==="__new")current.push({id:`memory-${Date.now()}`,title:"AI 整理記憶",text:draft.slice(0,20000),enabled:true});else{const slot=current.find(x=>x.id===target);if(slot)slot.text=draft.slice(0,20000);}
      window.BAOMemoryWorkbench.writeSlots(current);App.saveStory?.(false);window.BAOMemoryWorkbench.refresh(root,"notes");
    });
  };
  window.BAOMemoryAI={mount};
})();
