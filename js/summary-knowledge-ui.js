(() => {
  'use strict';
  if (typeof App==='undefined'||typeof Chat==='undefined'||!window.BAOSummaryKnowledgeCore||!window.BAOMemoryWorkbench) return;
  const core=window.BAOSummaryKnowledgeCore, busy=new WeakSet();
  const esc=value=>App.escapeHTML(String(value??'')),attr=value=>App.escapeAttr(String(value??''));
  const state=()=>window.GameState?.current;
  const options=(value)=>[['actors','指定知情角色'],['shared','所有角色已知'],['exclude','不提供給故事模型']].map(([key,label])=>`<option value="${key}" ${value===key?'selected':''}>${label}</option>`).join('');
  const inspect=owner=>{
    if(!owner?.summaryKnowledge?.active)return '尚未啟用：摘要沿用原本提供方式。';
    if(App.config?.memory?.mode!=='smart')return '範圍已保存；目前模式只用原文，未引用壓縮摘要。';
    try{
      const result=core.view({state:owner,summary:Chat.summary,cursor:Chat.summarizedUntil,messages:Chat.messages,config:App.config,primary:App.activeCharacter?.name||''});
      return result.pending?'摘要已更新：仍沿用上次審閱內容，其後原文會繼續保留；請重新審閱。':`已啟用：本輪可用 ${result.selected}／${result.total} 段，已核對前 ${result.coveredUntil} 則原文。`;
    }catch(error){return error.message;}
  };
  const mount=root=>{
    const host=root.querySelector('[data-summary-knowledge]'),owner=state(),config=App.config;
    if(!host||!owner)return;
    const unavailable=busy.has(owner)||Chat.summarizing||App.__requestPending;
    const expanded=host.querySelector('.summary-review')?.open===true;
    host.innerHTML=`<details class="memory-player-details summary-review" ${expanded?'open':''}><summary>摘要知情審閱（選用）${owner.summaryKnowledge?.active?' · 已啟用':''}</summary><p class="note">手動核對每段摘要由誰知道；不會呼叫模型，也不會刪除原摘要或對話。新段落預設待指定，全部核對後才套用。</p><p class="note">自動摘要更新後，仍使用上次審閱內容並保留後續原文，可能增加上下文用量。來源改寫或回溯不符時會暫停智慧模式的故事送出，直到重新審閱或停用範圍。</p><p class="note">範圍只控制這份壓縮摘要；近期原文、筆記、摘要包或其他來源的同一資訊仍依各自設定提供；固定輪數／完整對話模式不引用這份壓縮摘要。這是玩家指定範圍，不代表摘要內容或角色知情已被原文逐句證實。停用範圍或還原到未啟用狀態，會恢復一般摘要提供方式。</p><p class="note" data-summary-review-state>${esc(inspect(owner))}</p><div class="summary-review-actions"><button type="button" class="secondary" data-summary-review-prepare ${!Chat.summary||unavailable?'disabled':''}>審閱目前摘要</button><button type="button" class="secondary" data-summary-review-undo ${!core.canUndo({state:owner,summary:Chat.summary,cursor:Chat.summarizedUntil,messages:Chat.messages})||unavailable?'disabled':''}>還原上次範圍</button><button type="button" class="secondary" data-summary-review-off ${!owner.summaryKnowledge?.active||unavailable?'disabled':''}>停用範圍（恢復一般摘要）</button></div><div data-summary-review-editor></div><p class="note" role="status" aria-live="polite" data-summary-review-status></p></details>`;
    const status=host.querySelector('[data-summary-review-status]'),editor=host.querySelector('[data-summary-review-editor]');
    const current=()=>state()===owner&&App.config===config;
    const assertReady=()=>{if(!host.isConnected||!current())throw Error('故事已切換，請重新開啟記憶工作台；未套用這次審閱。');if(busy.has(owner)||Chat.summarizing||App.__requestPending)throw Error('故事送出或整理仍在進行，請完成後再套用。');};
    const commit=async(changes,isCurrent)=>{
      if(!window.BAOMemoryCore?.commitState)throw Error('保存模組尚未就緒，請重新整理頁面。');
      const lock=window.BAOStoryMaintenanceLock,token={};let locked=false;
      if(lock){locked=Boolean(lock.start(owner,{label:'正在保存摘要知情範圍',token}));if(!locked)throw Error('其他整理仍在進行，請完成後再試。');}
      busy.add(owner);const controls=[...host.querySelectorAll('button,select,input')].map(e=>[e,e.disabled]);controls.forEach(([e])=>e.disabled=true);
      try{
        await BAOMemoryCore.commitState({owner,changes,isCurrent,save:()=>App.saveStory(false),flush:()=>window.Storage?.flush?.(),load:window.Storage?.loadStory?.bind(window.Storage),verify:window.BAOStorageWriteGuard?.verify});
      }finally{busy.delete(owner);controls.forEach(([e,disabled])=>e.disabled=disabled);if(locked)lock.end(owner,token);if(current()&&!host.isConnected){const opened=document.querySelector('.memory-desk-backdrop');if(opened)mount(opened);}}
    };
    const run=async(action)=>{
      try{assertReady();await action();if(host.isConnected&&current()){mount(root);const next=root.querySelector('[data-summary-review-status]');if(next)next.textContent='已保存摘要知情範圍；原摘要與原文保留。';root.querySelector('[data-summary-review-prepare]')?.focus({preventScroll:true});}}
      catch(error){if(host.isConnected)status.textContent=error.message;}
    };
    host.querySelector('[data-summary-review-prepare]').addEventListener('click',()=>{
      try{
        assertReady();
        const candidate=core.draft({summary:Chat.summary,cursor:Chat.summarizedUntil,messages:Chat.messages,previous:owner.summaryKnowledge});
        editor.innerHTML=`<p class="note">以下 ${candidate.entries.length} 段來自目前摘要；涵蓋前 ${candidate.cursor} 則完整原文。段落不會自動推測知情角色；請依原文核對。關閉視窗會放棄尚未套用的審閱稿。</p><details class="memory-player-details" data-summary-review-evidence><summary>查看這份摘要涵蓋的原文（${candidate.cursor} 則）</summary><div class="summary-review-actions"><button type="button" class="secondary" data-summary-source-prev>上一頁原文</button><span class="note" data-summary-source-page></span><button type="button" class="secondary" data-summary-source-next>下一頁原文</button></div><div data-summary-source-messages></div></details><div class="summary-review-grid">${candidate.entries.map((entry,i)=>`<article class="memory-note-card" data-summary-review-entry="${i}" aria-label="摘要第 ${i+1} 段"><p class="summary-review-text">${esc(entry.text)}</p><div class="memory-note-permissions"><label>第 ${i+1} 段提供範圍<select data-summary-review-scope>${options(entry.knowledge_scope)}</select></label><label>知情角色（正式名稱或已登錄別名，以頓號分隔）<input data-summary-review-actors maxlength="3300" value="${attr(entry.known_by.join('、'))}" ${entry.knowledge_scope!=='actors'?'disabled':''}></label></div></article>`).join('')}</div><button type="button" class="secondary" data-summary-review-apply>套用全部已核對範圍</button>`;
        let sourcePage=0;
        const showSources=()=>{
          try{
            if(!current())throw Error('故事已切換，請重新開啟記憶工作台。');
            if(JSON.stringify(candidate.sources)!==JSON.stringify(core.proof(Chat.messages,candidate.cursor)))throw Error('原文已變更，請重新開啟審閱稿。');
            const pages=Math.ceil(candidate.cursor/10),start=sourcePage*10;
            editor.querySelector('[data-summary-source-page]').textContent=`第 ${sourcePage+1}／${pages} 頁`;
            editor.querySelector('[data-summary-source-prev]').disabled=sourcePage===0;
            editor.querySelector('[data-summary-source-next]').disabled=sourcePage>=pages-1;
            editor.querySelector('[data-summary-source-messages]').innerHTML=Chat.messages.slice(start,Math.min(candidate.cursor,start+10)).map((message,i)=>`<article class="memory-context-item"><span class="role">第 ${start+i+1} 則 · ${message.role==='user'?'玩家':'角色'}</span><b class="summary-review-source-id">${esc(message.id)}</b><pre class="summary-review-source" tabindex="0">${esc(message.content)}</pre>${typeof message.context_content==='string'&&message.context_content.trim()&&message.context_content!==message.content?`<details><summary>整理時使用的語意內容</summary><pre class="summary-review-source" tabindex="0">${esc(message.context_content)}</pre></details>`:''}</article>`).join('');
          }catch(error){status.textContent=error.message;editor.querySelector('[data-summary-source-messages]').textContent='原文來源尚未核對，未顯示其他故事內容。';}
        };
        editor.querySelector('[data-summary-review-evidence]').addEventListener('toggle',e=>{if(e.target.open)showSources();});
        editor.querySelector('[data-summary-source-prev]').addEventListener('click',()=>{sourcePage=Math.max(0,sourcePage-1);showSources();});
        editor.querySelector('[data-summary-source-next]').addEventListener('click',()=>{sourcePage=Math.min(Math.ceil(candidate.cursor/10)-1,sourcePage+1);showSources();});
        editor.querySelectorAll('[data-summary-review-scope]').forEach(e=>e.addEventListener('change',()=>{e.closest('[data-summary-review-entry]').querySelector('[data-summary-review-actors]').disabled=e.value!=='actors';}));
        editor.querySelector('[data-summary-review-apply]').addEventListener('click',()=>run(async()=>{
          const entries=[...editor.querySelectorAll('[data-summary-review-entry]')].map((e,i)=>({text:candidate.entries[i].text,
            knowledge_scope:e.querySelector('[data-summary-review-scope]').value,
            known_by:e.querySelector('[data-summary-review-actors]').value.split(/[\n,，、]+/).map(n=>n.trim()).filter(Boolean)}));
          const approved=core.approve(candidate,entries,Chat.messages,Chat.summary,Chat.summarizedUntil,owner);
          const prior=owner.summaryKnowledge===undefined?null:structuredClone(owner.summaryKnowledge);
          const stable=()=>current()&&candidate.summary===Chat.summary&&candidate.cursor===Chat.summarizedUntil
            &&JSON.stringify(candidate.sources)===JSON.stringify(core.proof(Chat.messages,candidate.cursor));
          await commit({summaryKnowledge:approved,summaryKnowledgeBackup:{appliedId:approved.id,appliedSignature:core.fingerprint(JSON.stringify(approved)),previous:prior}},stable);
        }));
        status.textContent='審閱稿尚未套用。';editor.querySelector('[data-summary-review-scope]')?.focus({preventScroll:true});
      }catch(error){status.textContent=error.message;}
    });
    host.querySelector('[data-summary-review-undo]').addEventListener('click',()=>run(async()=>{
      if(!core.canUndo({state:owner,summary:Chat.summary,cursor:Chat.summarizedUntil,messages:Chat.messages}))throw Error('摘要或來源已更新，不能還原過時範圍；請重新審閱。');
      const applied=owner.summaryKnowledge,backup=owner.summaryKnowledgeBackup;
      await commit({summaryKnowledge:backup.previous===null?undefined:structuredClone(backup.previous),summaryKnowledgeBackup:undefined},()=>current()&&Chat.summary===applied.summary&&Chat.summarizedUntil===applied.cursor&&JSON.stringify(core.proof(Chat.messages,applied.cursor))===JSON.stringify(applied.sources));
    }));
    host.querySelector('[data-summary-review-off]').addEventListener('click',()=>run(async()=>{
      const previous=owner.summaryKnowledge,summary=Chat.summary,cursor=Chat.summarizedUntil;
      if(!previous?.active)throw Error('逐段範圍已停用。');
      await commit({summaryKnowledge:{...previous,active:false},summaryKnowledgeBackup:undefined},()=>current()&&Chat.summary===summary&&Chat.summarizedUntil===cursor);
    }));
  };
  window.BAOSummaryKnowledgeUI=Object.freeze({mount});
  document.querySelectorAll('.memory-desk-backdrop').forEach(mount);
})();
