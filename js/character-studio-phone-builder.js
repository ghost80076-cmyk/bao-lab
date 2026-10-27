/* No-code authoring controls for the optional phone UI. Raw JSON remains the single source of truth. */
(() => {
  'use strict';
  const form=document.getElementById('studio-form');
  const raw=form?.elements.namedItem('phone_ui_json');
  const enabled=form?.elements.namedItem('phone_ui_enabled');
  const builder=form?.querySelector('[data-phone-builder]');
  const core=window.BAOPhoneUICore;
  if(!form||!raw||!enabled||!builder||!core||window.BAOCharacterStudioPhoneBuilder)return;

  const appLabels={phone:'通話',kakao:'聊天室',x:'X',instagram:'Instagram',spotify:'Spotify',photos:'相簿',notes:'備忘錄'};
  const targetLabels={kakao:'聊天室',photos:'照片',notes:'備忘錄'};
  const q=s=>builder.querySelector(s),qa=s=>[...builder.querySelectorAll(s)];
  const safeArray=v=>Array.isArray(v)?v:[];
  let writing=false,serial=0;
  const statusNode=q('[data-phone-builder-status]');
  const setStatus=(message,tone='')=>{if(statusNode){statusNode.textContent=message;statusNode.dataset.tone=tone;}};
  const parse=(quiet=false)=>{try{const v=JSON.parse(raw.value||'{}');if(!v||typeof v!=='object'||Array.isArray(v))throw new Error();return v;}catch(_){if(!quiet)setStatus('進階 JSON 目前格式不完整；修正後一般表單會重新同步。','warn');return null;}};
  const nextId=(prefix,label,existing=[])=>{
    const ascii=String(label||'').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,28);
    const base=ascii||prefix+'-'+(++serial).toString(36);
    let candidate=ascii?prefix+'-'+base:base,suffix=2;
    const ids=new Set(existing.map(item=>item?.id).filter(Boolean));
    while(ids.has(candidate))candidate=prefix+'-'+base+'-'+suffix++;
    return candidate.slice(0,80);
  };
  const targetKey=t=>t?.app&&t?.id?t.app+'|'+t.id:'';
  const parseTarget=value=>{const parts=String(value||'').split('|'),app=parts.shift(),id=parts.join('|');return ['kakao','photos','notes'].includes(app)&&id?{app,id}:null;};
  const sameTarget=(a,b)=>a?.app===b?.app&&a?.id===b?.id;
  const ensureInteractions=data=>{
    if(!data.interactions||data.interactions.version!==1||data.interactions.invalid)data.interactions={version:1,locks:[],events:[]};
    data.interactions.locks=safeArray(data.interactions.locks);data.interactions.events=safeArray(data.interactions.events);return data.interactions;
  };
  const ensureApp=(data,app)=>{const apps=safeArray(data.apps).filter(item=>core.allowedApps.includes(item));if(!apps.includes(app))apps.push(app);data.apps=apps.length?[...new Set(apps)]:[...core.allowedApps];};
  const write=(data,message='手機內容已更新。')=>{
    writing=true;raw.value=JSON.stringify(data,null,2);raw.dispatchEvent(new Event('input',{bubbles:true}));writing=false;render();setStatus(message,'good');
  };
  const option=(value,label)=>{const n=document.createElement('option');n.value=value;n.textContent=label;return n;};
  const removeButton=(label,fn)=>{const n=document.createElement('button');n.type='button';n.className='secondary';n.textContent='移除';n.setAttribute('aria-label','移除 '+label);n.addEventListener('click',fn);return n;};
  const listItem=(title,detail,remove)=>{
    const li=document.createElement('li'),copy=document.createElement('div'),strong=document.createElement('strong'),small=document.createElement('small');
    strong.textContent=title;small.textContent=detail||'';copy.append(strong,small);li.append(copy,removeButton(title,remove));return li;
  };
  const targets=data=>[
    ...safeArray(data.threads).map(item=>({app:'kakao',id:item.id,label:'聊天室 · '+(item.name||item.id)})),
    ...safeArray(data.photos).map(item=>({app:'photos',id:item.id,label:'照片 · '+(item.title||item.id)})),
    ...safeArray(data.notes).map(item=>({app:'notes',id:item.id,label:'備忘錄 · '+(item.title||item.id)}))
  ].filter(item=>item.id);
  const eventReferences=(event,target)=>sameTarget(event?.when?.target,target)||safeArray(event?.requires).some(item=>sameTarget(item?.target,target))||safeArray(event?.unlock).some(item=>sameTarget(item,target));

  function renderApps(data){
    const selected=new Set(safeArray(data.apps).filter(item=>core.allowedApps.includes(item))),actual=selected.size?selected:new Set(core.allowedApps);
    qa('[data-phone-app]').forEach(input=>{input.checked=actual.has(input.value);});
  }
  function renderContacts(data){
    const list=q('[data-phone-contact-list]'),select=q('[data-phone-thread-contact]');if(!list||!select)return;
    list.replaceChildren();select.replaceChildren(option('',safeArray(data.contacts).length?'選擇聯絡人':'請先建立聯絡人'));
    safeArray(data.contacts).forEach(contact=>{
      select.append(option(contact.id,contact.name||contact.id));
      list.append(listItem(contact.name||'未命名聯絡人',contact.avatar?'已設定頭像':'無頭像',()=>{
        const next=parse();if(!next)return;
        next.contacts=safeArray(next.contacts).filter(item=>item.id!==contact.id);
        const removedThreads=safeArray(next.threads).filter(thread=>safeArray(thread.participants).includes(contact.id));
        removedThreads.forEach(thread=>cleanupTarget(next,{app:'kakao',id:thread.id}));
        next.threads=safeArray(next.threads).filter(thread=>!safeArray(thread.participants).includes(contact.id));
        write(next,'已移除聯絡人「'+(contact.name||contact.id)+'」，相關聊天室與機關也一併移除。');
      }));
    });
  }
  function cleanupTarget(next,target){
    if(next.interactions?.version!==1)return;
    next.interactions.locks=safeArray(next.interactions.locks).filter(item=>!sameTarget(item.target,target));
    next.interactions.events=safeArray(next.interactions.events).filter(item=>!eventReferences(item,target));
  }
  function renderThreads(data){
    const list=q('[data-phone-thread-list]');if(!list)return;list.replaceChildren();
    safeArray(data.threads).forEach(thread=>list.append(listItem(thread.name||thread.id,safeArray(thread.messages).length+' 則初始訊息',()=>{
      const next=parse();if(!next)return;next.threads=safeArray(next.threads).filter(item=>item.id!==thread.id);cleanupTarget(next,{app:'kakao',id:thread.id});write(next,'已移除聊天室「'+(thread.name||thread.id)+'」。');
    })));
  }
  function renderNotes(data){
    const list=q('[data-phone-note-list]');if(!list)return;list.replaceChildren();
    safeArray(data.notes).forEach(note=>list.append(listItem(note.title||note.id,note.text?note.text.slice(0,52):'空白備忘錄',()=>{
      const next=parse();if(!next)return;next.notes=safeArray(next.notes).filter(item=>item.id!==note.id);cleanupTarget(next,{app:'notes',id:note.id});write(next,'已移除備忘錄「'+(note.title||note.id)+'」。');
    })));
  }
  function renderPhotos(data){
    const list=q('[data-phone-photo-list]');if(!list)return;list.replaceChildren();
    safeArray(data.photos).forEach(photo=>list.append(listItem(photo.title||photo.id,photo.caption?photo.caption.slice(0,52):'已設定圖片',()=>{
      const next=parse();if(!next)return;next.photos=safeArray(next.photos).filter(item=>item.id!==photo.id);cleanupTarget(next,{app:'photos',id:photo.id});write(next,'已移除照片「'+(photo.title||photo.id)+'」。');
    })));
  }
  function renderMechanisms(data){
    const all=targets(data),lockTarget=q('[data-phone-lock-target]'),source=q('[data-phone-event-source]'),unlock=q('[data-phone-event-unlock]');
    for(const select of [lockTarget,source,unlock])select?.replaceChildren();
    const placeholder=all.length?'選擇內容':'請先建立聊天室、照片或備忘錄';
    lockTarget?.append(option('',placeholder));source?.append(option('',placeholder));
    all.forEach(item=>{lockTarget?.append(option(targetKey(item),item.label));source?.append(option(targetKey(item),item.label));});
    const interactions=data.interactions?.version===1?data.interactions:{locks:[],events:[]};
    const locked=safeArray(interactions.locks).map(item=>item.target).filter(Boolean);
    unlock?.append(option('',locked.length?'選擇已鎖定內容':'請先設定一個鎖定內容'));
    locked.forEach(target=>{const found=all.find(item=>sameTarget(item,target));if(found)unlock?.append(option(targetKey(found),found.label));});

    const lockList=q('[data-phone-lock-list]');lockList?.replaceChildren();
    safeArray(interactions.locks).forEach(lock=>{
      const found=all.find(item=>sameTarget(item,lock.target)),label=found?.label||(targetLabels[lock.target?.app]||'內容')+' · '+(lock.target?.id||'?');
      const mode=(lock.code?'密碼':'線索解鎖')+' · '+(lock.hidden?'解鎖前隱藏':'可見但鎖定');
      lockList?.append(listItem(label,mode,()=>{const next=parse();if(!next)return;const config=ensureInteractions(next);config.locks=config.locks.filter(item=>!sameTarget(item.target,lock.target));config.events=config.events.filter(item=>!eventReferences(item,lock.target));write(next,'已移除「'+label+'」的鎖定與相關事件。');}));
    });
    const eventList=q('[data-phone-event-list]');eventList?.replaceChildren();
    safeArray(interactions.events).forEach(event=>{
      const from=all.find(item=>sameTarget(item,event.when?.target)),to=all.find(item=>safeArray(event.unlock).some(target=>sameTarget(item,target)));
      const label=from&&to?from.label+' → '+to.label:event.id;
      eventList?.append(listItem(label,event.notification||'無通知文字',()=>{const next=parse();if(!next)return;const config=ensureInteractions(next);config.events=config.events.filter(item=>item.id!==event.id);write(next,'已移除解鎖事件。');}));
    });
  }
  function render(){
    builder.hidden=!enabled.checked;if(!enabled.checked)return;
    const data=parse(true);if(!data){setStatus('進階 JSON 目前格式不完整；修正後一般表單會重新同步。','warn');return;}
    renderApps(data);renderContacts(data);renderThreads(data);renderNotes(data);renderPhotos(data);renderMechanisms(data);
    if(!writing)setStatus('一般作者模式已同步到目前的手機資料。');
  }

  enabled.addEventListener('change',()=>{
    builder.hidden=!enabled.checked;
    if(enabled.checked){
      if(!parse(true)){raw.value=JSON.stringify(core.defaultConfig(),null,2);raw.dispatchEvent(new Event('input',{bubbles:true}));}
      render();setStatus('手機介面已啟用。從 App、聯絡人或故事內容開始設定即可。','good');
    }
  });
  qa('[data-phone-app]').forEach(input=>input.addEventListener('change',()=>{
    const data=parse();if(!data)return;const selected=qa('[data-phone-app]:checked').map(item=>item.value);
    if(!selected.length){input.checked=true;return setStatus('至少保留一個 App；如果不需要手機介面，可以直接取消上方啟用。','warn');}
    data.apps=selected;write(data,'手機桌面已更新：'+selected.map(app=>appLabels[app]).join('、')+'。');
  }));
  q('[data-phone-add-contact]')?.addEventListener('click',()=>{
    const data=parse();if(!data)return;const name=q('[data-phone-contact-name]').value.trim(),avatar=q('[data-phone-contact-avatar]').value.trim();
    if(!name)return setStatus('請先填聯絡人姓名。','warn');if(avatar&&!core.media(avatar))return setStatus('聯絡人頭像請使用可存取的 HTTPS 圖片網址。','warn');
    data.contacts=safeArray(data.contacts);data.contacts.push({id:nextId('contact',name,data.contacts),name,avatar});ensureApp(data,'kakao');if(!String(data.contactName||'').trim())data.contactName=name;
    q('[data-phone-contact-name]').value='';q('[data-phone-contact-avatar]').value='';write(data,'已加入聯絡人「'+name+'」。');
  });
  q('[data-phone-add-thread]')?.addEventListener('click',()=>{
    const data=parse();if(!data)return;const contactId=q('[data-phone-thread-contact]').value,contact=safeArray(data.contacts).find(item=>item.id===contactId);
    if(!contact)return setStatus('請先建立並選擇一位聯絡人。','warn');
    data.threads=safeArray(data.threads);const name=q('[data-phone-thread-name]').value.trim()||contact.name||'聊天室',message=q('[data-phone-thread-message]').value.trim(),from=q('[data-phone-thread-from]').value==='me'?'me':'them';
    data.threads.push({id:nextId('thread',name,data.threads),name,participants:[contact.id],messages:message?[{from,senderId:from==='them'?contact.id:'',senderName:from==='them'?contact.name:String(data.userName||''),text:message}]:[]});ensureApp(data,'kakao');
    q('[data-phone-thread-name]').value='';q('[data-phone-thread-message]').value='';write(data,'已建立聊天室「'+name+'」。');
  });
  q('[data-phone-add-note]')?.addEventListener('click',()=>{
    const data=parse();if(!data)return;const title=q('[data-phone-note-title]').value.trim(),body=q('[data-phone-note-text]').value.trim();if(!title&&!body)return setStatus('備忘錄至少填標題或內容。','warn');
    data.notes=safeArray(data.notes);const label=title||'備忘錄';data.notes.push({id:nextId('note',label,data.notes),title:label,text:body});ensureApp(data,'notes');
    q('[data-phone-note-title]').value='';q('[data-phone-note-text]').value='';write(data,'已加入備忘錄「'+label+'」。');
  });
  q('[data-phone-add-photo]')?.addEventListener('click',()=>{
    const data=parse();if(!data)return;const src=q('[data-phone-photo-src]').value.trim(),title=q('[data-phone-photo-title]').value.trim()||'照片',caption=q('[data-phone-photo-caption]').value.trim();
    if(!src||!core.media(src))return setStatus('照片請使用可直接存取的 HTTPS 圖片網址。','warn');
    data.photos=safeArray(data.photos);data.photos.push({id:nextId('photo',title,data.photos),src,title,caption});ensureApp(data,'photos');
    q('[data-phone-photo-src]').value='';q('[data-phone-photo-title]').value='';q('[data-phone-photo-caption]').value='';write(data,'已加入照片「'+title+'」。');
  });
  q('[data-phone-add-lock]')?.addEventListener('click',()=>{
    const data=parse();if(!data)return;const target=parseTarget(q('[data-phone-lock-target]').value);if(!target)return setStatus('請先選擇要鎖定的內容。','warn');
    const config=ensureInteractions(data);if(config.locks.some(item=>sameTarget(item.target,target)))return setStatus('這份內容已經設定鎖定。','warn');
    config.locks.push({target,code:q('[data-phone-lock-code]').value.trim(),hidden:q('[data-phone-lock-hidden]').checked,hint:q('[data-phone-lock-hint]').value.trim()});ensureApp(data,target.app);
    q('[data-phone-lock-code]').value='';q('[data-phone-lock-hint]').value='';q('[data-phone-lock-hidden]').checked=false;write(data,'已加入故事鎖定。現在可以設定「讀完 A → 解鎖 B」。');
  });
  q('[data-phone-add-event]')?.addEventListener('click',()=>{
    const data=parse();if(!data)return;const source=parseTarget(q('[data-phone-event-source]').value),unlock=parseTarget(q('[data-phone-event-unlock]').value);
    if(!source||!unlock)return setStatus('請選擇玩家要讀取的內容，以及接著解鎖的內容。','warn');if(sameTarget(source,unlock))return setStatus('觸發內容與解鎖內容請選不同項目。','warn');
    const config=ensureInteractions(data);if(!config.locks.some(item=>sameTarget(item.target,unlock)))return setStatus('要解鎖的內容必須先設定鎖定。','warn');
    config.events.push({id:nextId('event','read-unlock',config.events.map(item=>({id:item.id}))),when:{action:'read',target:source},requires:[],unlock:[unlock],notification:q('[data-phone-event-notification]').value.trim()});
    q('[data-phone-event-notification]').value='';write(data,'已加入跨 App 解鎖事件。');
  });

  raw.addEventListener('input',()=>{if(!writing)render();});
  window.addEventListener('bao:character-studio-card-shown',render);
  render();
  window.BAOCharacterStudioPhoneBuilder=Object.freeze({render,parse,targets:()=>targets(parse(true)||{})});
})();
