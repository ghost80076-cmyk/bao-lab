(() => {
  'use strict';
  const core = window.BAOStoryDiscussionCore;
  if (!core || !window.App || !window.Storage) return;
  let dialog = null;
  const esc = value => App.escapeHTML(String(value ?? ''));
  const id = () => 'import-' + (globalThis.crypto?.randomUUID?.() || Date.now().toString(36));
  const ownerNow = () => window.GameState?.current;
  const sourceText = messages => JSON.stringify(messages.map(m=>({role:m.role,content:String(m.content||'')})));
  const signature = () => sourceText(Chat.messages || []);
  async function persist(owner) {
    if (ownerNow() !== owner) throw new Error('故事已切換，未寫入其他故事。');
    if (!App.saveStory(false)) throw new Error('無法建立存檔；內容仍留在目前頁面，請重試保存。');
    await Storage.flush();
    const saved = Storage.loadStory();
    if (ownerNow() !== owner || !saved || window.BAOStorageWriteGuard?.verify?.(saved)?.ok === false)
      throw new Error('尚未確認保存成功，請保留此頁並重試。');
  }
  function modal(title, owner) {
    if (dialog) dialog.close();
    const previous = document.activeElement;
    const backdrop = document.createElement('div'); backdrop.className = 'yoru-discussion-backdrop';
    backdrop.innerHTML = `<section class="yoru-discussion" role="dialog" aria-modal="true" aria-labelledby="yoru-discussion-title"><header><h2 id="yoru-discussion-title">${esc(title)}</h2><button type="button" class="secondary" data-close>返回故事</button></header><main data-body></main><p role="status" aria-live="polite" data-status></p></section>`;
    document.body.append(backdrop);
    const view = {backdrop, owner, controller:null, closed:false, status:backdrop.querySelector('[data-status]')};
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); view.close(); }
      if (event.key !== 'Tab') return;
      const items = [...backdrop.querySelectorAll('button,textarea,input,select')].filter(el=>!el.disabled && el.getClientRects().length);
      const first=items[0],last=items.at(-1);
      if (event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
      else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
    };
    view.close = () => {
      if (view.closed) return;
      view.closed = true; view.controller?.abort(); backdrop.remove();
      document.removeEventListener('keydown',keydown,true);
      if (dialog===view) dialog=null;
      if (previous?.isConnected) previous.focus();
    };
    view.current = () => !view.closed && ownerNow()===owner;
    backdrop.querySelector('[data-close]').onclick = view.close;
    document.addEventListener('keydown',keydown,true);
    dialog=view; backdrop.querySelector('[data-close]').focus();
    return view;
  }
  async function locked(view, label, task) {
    if (!view.current()) throw new Error('請回到目前故事重新開啟。');
    const token = {}, lock = window.BAOStoryMaintenanceLock;
    if (!lock || App.__requestPending || Chat.summarizing || !lock.start(view.owner,{label,token})) throw new Error('故事或整理工作正在進行，請完成後再試。');
    view.controller = new AbortController();
    const buttons=[...view.backdrop.querySelectorAll('button:not([data-close])')];
    buttons.forEach(b=>b.disabled=true);
    try { return await task(view.controller.signal); }
    finally { lock.end(view.owner,token); view.controller=null; buttons.forEach(b=>b.disabled=false); }
  }
  function download(name, value) {
    const url=URL.createObjectURL(new Blob([value],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function openDiscussion() {
    const owner=ownerNow();if(!owner) return alert('請先進入故事。');
    const view=modal('故事討論',owner), body=view.backdrop.querySelector('[data-body]');
    const read=()=>core.history(owner.storyDiscussion?.messages);
    body.innerHTML=`<p>戲外討論只參考長期摘要與最近 6 輪可見對話，不會送進正文或自動摘要。使用目前故事模型（${esc(App.config?.api?.model || '未連線')}），會消耗 API 額度或燈火。此故事線保留最近 ${core.MAX_HISTORY} 則討論；完整備份也會包含。</p><div data-log></div><label>想討論什麼？<textarea data-question maxlength="2000" placeholder="例如：整理目前的線索，或討論下一步的可能性"></textarea></label><div class="discussion-actions"><button type="button" class="primary" data-send>送出討論</button><button type="button" class="secondary" data-export>匯出討論 TXT</button><button type="button" class="secondary" data-retry-save>重試保存</button></div>`;
    const render=()=>{
      body.querySelector('[data-log]').innerHTML=read().map((m,i)=>`<article><b>${m.role==='user'?'你':'討論助手'}</b><p>${esc(m.content)}</p>${m.role==='assistant'?`<button type="button" class="secondary" data-note="${i}">編輯並存為長期筆記</button>`:''}</article>`).join('');
      body.querySelectorAll('[data-note]').forEach(b=>b.onclick=async()=>{
        try {
          if (!view.current()) throw new Error('故事已切換，請重新開啟。');
          const value=window.prompt('請確認並編輯要加入故事的筆記。這段內容會從下一輪開始提供給故事模型。',read()[Number(b.dataset.note)]?.content || '');
          if (value===null || !value.trim()) return;
          if ((owner.memory||[]).includes(value.trim())) throw new Error('相同筆記已存在；若尚未保存，請按「重試保存」。');
          if (value.length>4000 || (owner.memory||[]).length>=50) throw new Error('筆記最多 4000 字，且總數不得超過 50 條。');
          await locked(view,'正在保存確認筆記',async()=>{
            owner.memory=[value.trim(),...(owner.memory||[])];
            await persist(owner);view.status.textContent='已將你確認的內容加入長期筆記。';
          });
        } catch(e){view.status.textContent=e.message;}
      });
    };
    render();
    body.querySelector('[data-export]').onclick=()=>download('夜灣故事討論.txt',read().map(m=>(m.role==='user'?'你':'討論助手')+'：\n'+m.content).join('\n\n'));
    body.querySelector('[data-retry-save]').onclick=async()=>{try{await locked(view,'正在保存討論',async()=>{await persist(owner);view.status.textContent='已確認保存。';});}catch(e){view.status.textContent=e.message;}};
    body.querySelector('[data-send]').onclick=async()=>{
      const field=body.querySelector('[data-question]'), question=field.value.trim();if(!question)return;
      try {
        await locked(view,'正在產生故事討論',async signal=>{
          const before=signature(), config=App.config, settings=JSON.stringify(App.config), api={...config.api,__storyTool:true,__discussionTask:true,signal,maxOutputTokens:2048};
          window.BAOCreditsPilot?.prepareAccountConfig?.(api);
          if (!api.key && !window.BAOCreditsPilot?.isAccountReady?.(api)) throw new Error('請先連接故事模型。');
          const messages=core.discussionMessages({messages:Chat.messages,summary:Chat.summary,discussion:read(),question});
          if (window.BAOMemoryCore.bytes(JSON.stringify(messages))>180000) throw new Error('討論來源過大，請縮短問題。');
          view.status.textContent='正在討論…';
          const result=await API.send(api,messages);
          if(!view.current() || App.config!==config || JSON.stringify(App.config)!==settings || signature()!==before || signal.aborted) throw new Error('故事或來源已變更，未加入這次回覆。');
          const error=window.BAOMemoryCore.completionError(result);if(error)throw new Error(error);
          const answer=String(result?.text||'').trim();if(!answer)throw new Error('模型沒有回傳討論內容。');
          if(answer.length>4000)throw new Error('討論回覆超過 4000 字，尚未保存；請縮小問題範圍。');
          owner.storyDiscussion={messages:core.history([...read(),{role:'user',content:question},{role:'assistant',content:answer}])};
          render();await persist(owner);field.value='';view.status.textContent='討論已保存；故事正文與記憶沒有變更。';
        });
      }catch(e){if(!view.closed)view.status.textContent=e.message;}
    };
  }
  function openSplit(messages) {
    const owner=ownerNow();if(!owner)return alert('請先進入一個故事，再匯入紀錄。');
    if(!Array.isArray(messages)||!messages.length)return alert('沒有可整理的匯入來源。');
    const source=sourceText(messages), fingerprint=window.BAOMemoryCore.fingerprint(source);
    const view=modal('匯入設定拆分',owner), body=view.backdrop.querySelector('[data-body]');
    let applied=false;
    body.innerHTML='<p>從已確認說話者的匯入紀錄提取四類草稿。使用記憶整理模型，長篇分批處理，每次最多 8 批，可繼續；完成前不能套用。原始對話與原作品設定保留。套用只新增目前故事的人物、玩家補充、私人世界書與長期筆記，不會發布角色卡。</p><div class="discussion-actions"><button type="button" class="primary" data-generate>產生／繼續拆分草稿</button></div><div data-fields></div><button type="button" class="primary" data-apply disabled>確認並新增勾選設定</button>';
    const fields=body.querySelector('[data-fields]'), apply=body.querySelector('[data-apply]');
    const job=()=>owner.settingSplitJob?.fingerprint===fingerprint?owner.settingSplitJob:null;
    function showDraft() {
      const current=job();if(!current?.complete)return;
      const draft=core.parseDraft(current.summary);
      const edits=current.edits || {};
      applied=Boolean(current.applied);
      fields.innerHTML=Object.entries({characters:'AI 人物設定（JSON 陣列）',player:'玩家補充設定',world:'世界背景設定',summary:'前情摘要筆記'}).map(([key,label])=>`<label><input type="checkbox" data-select="${key}">${label}<textarea aria-label="${label}草稿" data-field="${key}" ${applied?'disabled':''}></textarea></label>`).join('');
      for(const key of ['characters','player','world','summary'])fields.querySelector(`[data-field="${key}"]`).value=typeof edits[key]==='string'?edits[key]:(key==='characters'?JSON.stringify(draft.characters,null,2):draft[key]);
      fields.oninput=()=>{
        if(!view.current()||applied||!job())return;
        job().edits=Object.fromEntries([...fields.querySelectorAll('[data-field]')].map(el=>[el.dataset.field,el.value]));
        // Keep invalid in-progress JSON as an editable draft, never as model context.
        App.saveStory(false);
      };
      apply.disabled=false;apply.textContent=applied?'重試保存已套用內容':'確認並新增勾選設定';
      if(applied)view.status.textContent='此草稿已套用，不會重複新增；可重試保存。';
    }
    showDraft();
    body.querySelector('[data-generate]').onclick=async()=>{
      if (job()?.complete) { showDraft(); return; }
      try { await locked(view,'正在拆分匯入設定',async signal=>{
        if(job()?.applied)throw new Error('此來源已套用，請重新匯入其他來源。');
        const memory=window.BAOMemoryCore, config=App.config, cfg=memory.config(config,'notes',App.modelPresets||[],{signal});
        window.BAOCreditsPilot?.prepareAccountConfig?.(cfg);
        if(!cfg.key&&!window.BAOCreditsPilot?.isAccountReady?.(cfg))throw new Error('請先連接記憶整理模型。');
        const settings=JSON.stringify(config);
        const plan=memory.fingerprint(JSON.stringify([cfg.model,cfg.baseUrl,cfg.protocol,cfg.maxOutputTokens]));
        const previous=job();
        const checkpoint=previous?.plan===plan?previous:{};
        const result=await memory.foldText({source,config:cfg,checkpoint,makeMessages:(chunk,previous)=>core.splitMessages(chunk,previous).map((m,i)=>i?m:{...m,content:memory.taskSystem('匯入設定分類',m.content)}),send:(...args)=>API.send(...args),normalize:r=>JSON.stringify(core.parseDraft(r.text)),isCurrent:()=>view.current()&&App.config===config&&JSON.stringify(config)===settings&&!signal.aborted,save:async progress=>{owner.settingSplitJob={...progress,fingerprint,plan,complete:false};await persist(owner);},onProgress:p=>{view.status.textContent=`已整理 ${p.completed} 批（${Math.floor(p.offset/p.total*100)}%）。`;}});
        if(!view.current())throw new Error('故事已切換。');
        owner.settingSplitJob={...result,fingerprint,plan};await persist(owner);
        view.status.textContent=result.complete?'草稿完成，請修改並勾選要加入故事的類別。':'本次批次已保存，請按「產生／繼續」接續。';
      }); showDraft(); }catch(e){if(!view.closed)view.status.textContent=e.message;}
    };
    apply.onclick=async()=>{
      try {await locked(view,'正在保存確認設定',async()=>{
        if(!job()?.complete)throw new Error('來源尚未完整整理。');
        if(!applied){
          const selected=[...fields.querySelectorAll('[data-select]:checked')].map(e=>e.dataset.select);
          const draft=core.normalizeDraft({characters:JSON.parse(fields.querySelector('[data-field="characters"]').value),...Object.fromEntries(['player','world','summary'].map(key=>[key,fields.querySelector(`[data-field="${key}"]`).value]))});
          const result=core.additions(owner,App.config,draft,selected,id());
          if(selected.includes('world')&&draft.world)window.YoruWorldbookLibraryCore.normalizePack(result.state.worldbookLibrary.installed.at(-1));
          for(const key of ['storyActors','worldbookLibrary','memory'])if(Object.hasOwn(result.state,key))owner[key]=result.state[key];
          App.config.persona=result.config.persona;owner.config=App.config;
          owner.settingSplitJob.applied=true;applied=true;fields.querySelectorAll('input,textarea').forEach(e=>e.disabled=true);
          apply.textContent='重試保存已套用內容';
        }
        await persist(owner);view.status.textContent='已保存確認設定；原對話與原作品保留。';apply.disabled=true;
      });}catch(e){view.status.textContent=e.message;}
    };
  }
  const link=document.createElement('link');link.rel='stylesheet';link.href='css/story-discussion.css?v=1';document.head.append(link);
  window.BAOStoryDiscussion={open:openDiscussion,openSplit};
})();
