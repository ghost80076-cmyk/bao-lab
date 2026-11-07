/* Local-only chapter review in the existing Memory Workbench. */
(() => {
  'use strict';
  if (!window.BAOChapterMemoryCore || !window.BAOChapterMemoryWorkflow ||
      !window.BAOMemoryWorkbench) return;
  const core=window.BAOChapterMemoryCore,flow=window.BAOChapterMemoryWorkflow;
  const notices=new WeakMap(),active=new WeakSet();
  const stateNow=()=>window.GameState?.current;
  const busy=()=>Boolean(App.__requestPending || Chat.summarizing);
  const names=value=>[...new Set(String(value||'').split(/[\n,，、]+/)
    .map(x=>x.trim()).filter(Boolean))];
  const same=(owner,config,character)=>stateNow()===owner &&
    App.config===config && App.activeCharacter===character;
  const textNode=(tag,text,className)=>{
    const node=document.createElement(tag);node.textContent=String(text);
    if(className)node.className=className;
    return node;
  };
  const notice=(area,message,error=false)=>{
    const node=area.querySelector('[data-chapter-status]');
    if(node){node.textContent=message;node.dataset.error=error?'true':'false';}
  };
  const dependencies=(owner,config,character)=>({
    owner,config,character,
    currentOwner:stateNow,currentConfig:()=>App.config,
    currentCharacter:()=>App.activeCharacter,currentMessages:()=>Chat.messages,
    isBusy:busy,lock:window.BAOStoryMaintenanceLock,
    save:()=>App.saveStory?.(false)===true,
    flush:()=>Storage.flush(),load:()=>Storage.loadStory(),
    verify:saved=>window.BAOStorageWriteGuard?.verify?.(saved)||{ok:false}
  });
  const mount=root=>{
    const area=root?.querySelector?.('#chapter-memory-area');
    if(!area)return;
    const owner=stateNow(),config=App.config,character=App.activeCharacter;
    if(!owner){area.textContent='請先開啟故事，再建立章節記憶。';return;}
    if(!window.BAOMemoryCore || !window.BAOStoryMaintenanceLock ||
       !window.BAOStorageWriteGuard || !window.BAOEpisodicMemory) {
      area.textContent='章節儲存保護尚未就緒，請重新整理後再試。';return;
    }
    let archive;
    try{archive=flow.archiveOf(owner);}catch(error){area.textContent=String(error.message);return;}
    const messages=Chat.messages||[];
    const windows=flow.ranges(messages,archive,20),available=windows.filter(x=>x.available);
    const entries=archive.chapters.slice(0,core.MAX_CHAPTERS),checks=core.audit(archive,messages);
    area.innerHTML=
      '<p class="chapter-memory-guide">這裡只保存你核對過的章節摘要，內容隨目前故事備份。'+
      '<strong>預設只在本地保存；只有明確啟用下方章節檢索，才會在符合條件時提供少量舊章節給故事模型。不另呼叫模型。</strong></p>'+
      '<div class="chapter-memory-stats"><span data-chapter-count></span><span data-chapter-valid></span></div>'+ 
      '<label class="chapter-recall-toggle"><input type="checkbox" data-chapter-recall-toggle><span><b>使用章節回憶（選用，預設關閉）</b><small>只有智慧整理已覆蓋的舊章節，且來源、NPC 知情、關鍵詞與預算都通過才載入。每輪最多 1 章、粗估增加上限 450 Token；可能增加費用，不保證比較省。完整對話與固定輪數模式不適用。</small></span></label>'+ 
      '<p class="chapter-recall-diagnostic" data-chapter-recall-diagnostic></p>'+
      '<div class="chapter-memory-list" data-chapter-list></div>'+
      '<form class="chapter-memory-form" data-chapter-form>'+
      '<h4>建立並審閱章節</h4>'+
      '<label>完整劇情範圍<select data-chapter-range required><option value="">選擇原文範圍</option></select></label>'+
      '<details class="chapter-memory-source"><summary>閱讀選取範圍的完整原文</summary><pre data-chapter-source>請先選擇章節。</pre></details>'+
      '<label>章節摘要<textarea data-chapter-text maxlength="2000" rows="5" required placeholder="只寫確實發生的事件、承諾、伏筆及角色已知情報，不補造劇情。"></textarea></label>'+
      '<label>關鍵詞（逗號或頓號分隔，最多 20 個）<input data-chapter-keywords maxlength="1000" type="text" placeholder="港口、密約、舊信"></label>'+
      '<label>提供範圍（必須明確確認）<select data-chapter-scope required><option value="">尚未確認</option><option value="actors">限定已知角色</option><option value="shared">共用背景</option><option value="exclude">只保存，不提供模型</option></select></label>'+
      '<label>已知角色名（正式名稱或別名，頓號分隔）<input data-chapter-actors maxlength="3000" type="text" disabled placeholder="艾琳、守衛"></label>'+
      '<label class="chapter-memory-approval"><input type="checkbox" data-chapter-approval required>我已核對原文、摘要與知情範圍，沒有把猜測寫成事實。</label>'+
      '<button type="submit" class="primary" data-chapter-submit>核准並儲存</button></form>'+
      '<p class="chapter-memory-status" data-chapter-status role="status" aria-live="polite"></p>';
    area.querySelector('[data-chapter-count]').textContent='已保存 '+entries.length+' 章';
    area.querySelector('[data-chapter-valid]').textContent='有效 '+checks.filter(x=>x.ok).length+' 章 · 來源失效 '+checks.filter(x=>!x.ok).length+' 章';
    const toggle=area.querySelector('[data-chapter-recall-toggle]');
    const enabled=owner.chapterMemorySettings?.version===1 && owner.chapterMemorySettings.recallEnabled===true;
    toggle.checked=enabled;
    toggle.disabled=!enabled && !checks.some(result=>result.ok);
    const last=window.BAOChapterMemoryRecall?.snapshot?.(owner);
    area.querySelector('[data-chapter-recall-diagnostic]').textContent=last
      ? (last.chapters ? '上一輪使用 '+last.chapters+' 章 · 額外輸入粗估約 '+last.estimatedExtraTokens+' Token；非服務商計費值。'
        : '上一輪沒有注入章節（'+last.reason+'）。')
      : '尚無本次遊玩召回紀錄；未啟用時每輪不增加章節內容。';
    toggle.addEventListener('change',async()=>{
      if(active.has(owner))return;
      const target=toggle.checked;
      if(!same(owner,config,character)||busy()){
        toggle.checked=!target;notice(area,'故事正在生成或已切換，沒有變更章節檢索。',true);return;
      }
      toggle.disabled=true;active.add(owner);notice(area,'正在儲存章節召回設定…');
      try{
        await flow.setRecallEnabled({
          ...dependencies(owner,config,character),messages:Chat.messages,enabled:target,
          sourceValid:()=>!target || core.audit(flow.archiveOf(owner),Chat.messages).some(result=>result.ok)
        });
        notices.set(owner,target?'已啟用選用章節召回；只在相關且預算允許時提供舊章節。':'已關閉章節召回；章節仍保存在目前故事。');
        if(same(owner,config,character)&&root.isConnected)window.BAOMemoryWorkbench.refresh(root,'chapters');
      }catch(error){
        toggle.checked=!target;notice(area,String(error?.message||error),true);
      }finally{active.delete(owner);toggle.disabled=false;}
    });
    const listing=area.querySelector('[data-chapter-list]');
    if(!entries.length)listing.append(textNode('p','尚未保存章節。既有智慧摘要與完整對話都保持不變。','note'));
    const permissionLabel=entry=>entry.knowledge_scope==='shared'?'共用已核准':
      entry.knowledge_scope==='actors'?'限定角色':'不提供模型';
    for(let index=0;index<entries.length;index++){
      const item=entries[index]||{},status=checks[index];
      const card=textNode('article','','chapter-memory-record');card.dataset.chapterId=String(item.id||'');
      const head=textNode('div','','chapter-memory-record-top');
      const from=Number.isInteger(item.source?.start)?item.source.start+1:'?';
      const to=Number.isInteger(item.source?.end)?item.source.end:'?';
      head.append(textNode('b','第 '+from+'–'+to+' 則原文'),
        textNode('small',(status?.ok?'來源已核對':'來源失效，需重建')+' · '+permissionLabel(item)));
      const footer=textNode('div','','chapter-memory-record-bottom');
      const remove=textNode('button','移除此章','secondary');
      remove.type='button';remove.dataset.chapterRemove='';
      footer.append(textNode('span',Array.isArray(item.keywords)?item.keywords.join('、')||'無關鍵詞':'關鍵詞格式異常'),remove);
      card.append(head,textNode('p',item.text||''),footer);listing.append(card);
    }
    const form=area.querySelector('[data-chapter-form]');
    const range=form.querySelector('[data-chapter-range]');
    for(const window of available){
      const option=document.createElement('option');
      option.value=window.start+':'+window.end;
      option.textContent='第 '+(window.start+1)+'–'+window.end+' 則 · '+window.turns+' 輪完整對話';
      range.append(option);
    }
    const preview=form.querySelector('[data-chapter-source]');
    const scope=form.querySelector('[data-chapter-scope]');
    const actors=form.querySelector('[data-chapter-actors]');
    const approval=form.querySelector('[data-chapter-approval]');
    const submit=form.querySelector('[data-chapter-submit]');
    if(!available.length){submit.disabled=true;form.append(textNode('p',
      '沒有可新增的完整章節範圍；可繼續遊玩，或明確移除來源失效的章節。','note'));}
    range.addEventListener('change',()=>{
      const selected=available.find(x=>x.start+':'+x.end===range.value);
      preview.textContent=selected?messages.slice(selected.start,selected.end).map(message=>
        (message.role==='user'?'玩家':'角色')+' · '+message.id+'\n'+message.content).join('\n\n'):'請先選擇章節。';
      approval.checked=false;
    });
    scope.addEventListener('change',()=>{
      actors.disabled=scope.value!=='actors';if(actors.disabled)actors.value='';
      approval.checked=false;
    });
    form.querySelectorAll('[data-chapter-text],[data-chapter-keywords],[data-chapter-actors]')
      .forEach(node=>node.addEventListener('input',()=>{approval.checked=false;}));
    if(notices.has(owner))notice(area,notices.get(owner));
    form.addEventListener('submit',async event=>{
      event.preventDefault();
      if(active.has(owner))return;
      if(!same(owner,config,character)||busy()){
        notice(area,'故事正在生成或已切換；請重新開啟工作台。',true);return;
      }
      if(!approval.checked){notice(area,'請先閱讀原文並確認章節內容。',true);return;}
      const selected=available.find(x=>x.start+':'+x.end===range.value);
      if(!selected){notice(area,'章節範圍無效，沒有變更存檔。',true);return;}
      submit.disabled=true;active.add(owner);notice(area,'正在核對來源並保存章節…');
      try{
        const saved=await flow.saveChapter({
          ...dependencies(owner,config,character),messages,start:selected.start,end:selected.end,
          text:form.querySelector('[data-chapter-text]').value,
          keywords:names(form.querySelector('[data-chapter-keywords]').value),
          scope:scope.value,knownBy:names(actors.value),
          state:owner,resolver:window.BAOEpisodicMemory
        });
        notices.set(owner,'章節 '+saved.id+' 已保存；僅在玩家啟用召回且本輪符合來源與預算條件時才會使用。');
        if(same(owner,config,character)&&root.isConnected)window.BAOMemoryWorkbench.refresh(root,'chapters');
      }catch(error){notice(area,String(error?.message||error),true);}
      finally{active.delete(owner);submit.disabled=false;}
    });
    listing.querySelectorAll('[data-chapter-remove]').forEach(button=>button.addEventListener('click',async()=>{
      if(active.has(owner))return;
      const id=button.closest('[data-chapter-id]')?.dataset.chapterId;
      if(!id || !same(owner,config,character)||busy()){
        notice(area,'故事正在生成或已切換；請重新開啟工作台。',true);return;
      }
      if(!window.confirm('確定移除章節 '+id+' 嗎？原始對話與智慧摘要仍完整保留。'))return;
      button.disabled=true;active.add(owner);notice(area,'正在保存章節移除結果…');
      try{
        await flow.removeChapter({...dependencies(owner,config,character),id});
        notices.set(owner,'已移除 '+id+'；原始對話未改動。');
        if(same(owner,config,character)&&root.isConnected)window.BAOMemoryWorkbench.refresh(root,'chapters');
      }catch(error){notice(area,String(error?.message||error),true);}
      finally{active.delete(owner);button.disabled=false;}
    }));
  };
  window.BAOChapterMemoryWorkbench=Object.freeze({mount});
})();
