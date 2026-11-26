/* Player-driven image generation and local visual collection; never updates GameState. */
(() => {
  'use strict';
  const Core=window.BAOImageGenerationCore,Assets=window.BAOImageAssets;
  if(!Core || !Assets)return;
  const client=Core.createClient();
  const settings={provider:'openai',model:Core.OPENAI[0],key:'',endpoint:''}; // Key stays in this page's memory only.
  let catalog=[],renderRevision=0,storyCleanup=()=>{};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const button=(text,fn)=>{const node=el('button',text);node.type='button';node.addEventListener('click',fn);return node;};
  const field=(title,tag='input')=>{const wrap=el('label'),input=el(tag);input.setAttribute('aria-label',title);wrap.append(el('span',title),input);return {wrap,input};};
  const options=(select,values)=>{select.replaceChildren(...values.map(value=>{const o=el('option',Array.isArray(value)?value[1]:value||'供應商預設');o.value=Array.isArray(value)?value[0]:value;return o;}));};
  const check=title=>{const f=field(title);f.input.type='checkbox';f.wrap.className='image-gen-check';return f;};
  const statusError=node=>error=>{node.textContent=error?.message || '操作失敗，請重試。';};
  function download(blob,name) {
    const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  const sameScope=current=>{const now=Assets.scope();return now.storyId===current.storyId && now.chapterId===current.chapterId && current.messageId && now.messageIds.includes(current.messageId);};
  function cast(card) {
    const base=Array.isArray(card.initial_state?.npcs)?card.initial_state.npcs:[];
    const combined=[...base];
    for(const npc of window.GameState?.current?.npcs || [])if(!combined.some(n=>String(n.id||n.name)===String(npc.id||npc.name)))combined.push(npc);
    const people=combined.slice(0,50).map(n=>({id:String(n.id||n.name),name:String(n.name||n.id),appearance:Core.txt(n.appearance,6000),outfit:Core.txt(n.outfit,1000)}));
    if(!people.length)people.push({id:String(card.id||''),name:String(card.name||'角色'),appearance:Core.txt(card.content?.profile?.appearance || card.appearance || window.BAOStoryImagePrompts?.profileOf(card),6000),outfit:''});
    return people;
  }
  function thumbnail(record,full=false) {
    const img=el('img');img.alt=record.title||'已保存的生成圖片';img.loading='lazy';img.decoding='async';
    img.className=full?'image-gen-full':'image-gen-thumb';
    let url='',dead=false;
    const load=async()=>{try{
      const asset=await (full?Assets.get(record.assetId):Assets.getThumbnail(record.assetId));
      if(dead || !img.isConnected)return;
      if(!asset){img.replaceWith(el('p','圖片檔案遺失，請匯入圖片備份。'));return;}
      url=URL.createObjectURL(new Blob([asset.bytes],{type:full?asset.type:'image/jpeg'}));img.src=url;
    }catch(_){if(!dead)img.replaceWith(el('p','圖片讀取失敗。'));}};
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void load();}});
    observer.observe(img);
    return {img,cleanup:()=>{dead=true;observer.disconnect();if(url)URL.revokeObjectURL(url);}};
  }
  function mountCollection(container,{phone=false,scene=null}={}) {
    let dead=false,offset=0,cleanups=[];
    const current=Assets.scope(),status=el('p'),grid=el('div'),heading=el('h3',phone?'玩家生成收藏':'已保存的生成圖片');
    status.setAttribute('role','status');grid.className='image-gen-gallery';
    const help=el('p',phone?'這些照片由玩家手動生成，角色不會因收藏而自動知情。':'圖片按章節與回覆保存；其他章節／已回溯圖片可在完整圖集中管理。');
    const all=check('顯示本故事所有章節與已回溯圖片');
    const more=button('載入更多',()=>{offset+=12;void paint();});
    const cleanup=()=>{cleanups.forEach(fn=>fn());cleanups=[];};
    const paint=async()=>{
      try{
        const records=await Assets.list(current.storyId);
        if(dead || !container.isConnected)return;
        cleanup();grid.replaceChildren();
        const rows=all.input.checked&&!phone?records:Assets.visible(records,current,phone?'inPhone':null).filter(r=>!scene || r.messageId===scene.id);
        for(const record of rows.slice(0,offset+12)){
          const card=el('article'),thumb=thumbnail(record);cleanups.push(thumb.cleanup);
          const title=el('strong',record.title||'生成圖片');
          const note=el('small',`${record.chapterLabel||'章節'}${record.archived?'（已封存）':''} · ${record.characterName||record.kind} · ${record.createdAt} · 玩家生成`);
          const preview=button('檢視／下載',async()=>{
            try{const asset=await Assets.get(record.assetId);if(!asset)throw new Error('圖片遺失，請匯入備份。');
              const view=window.BAOStoryImagePrompts.dialog(record.title||'生成圖片',record.description||'玩家生成的視覺素材，不會改寫故事。');
              const url=URL.createObjectURL(new Blob([asset.bytes],{type:asset.type}));view.urls.add(url);
              const image=el('img');image.className='image-gen-full';image.src=url;image.alt=record.title;
              view.panel.append(image,button('下載圖片',()=>{try{download(new Blob([asset.bytes],{type:asset.type}),'yorubay-image.'+asset.type.split('/')[1]);view.status.textContent='已交給瀏覽器下載；請確認下載紀錄。';}catch(_){view.status.textContent='下載啟動失敗，請檢查瀏覽器設定。';}}),view.status,view.close);
            }catch(error){statusError(status)(error);}
          });
          const remove=button('刪除此章圖片',async()=>{
            if(!confirm('刪除這個章節的圖片引用？其他章節仍使用的圖片會保留。'))return;
            try{await Assets.remove(record.id);await paint();}catch(error){statusError(status)(error);}
          });
          card.append(thumb.img,title,note,preview);
          if(!phone){
            const copy=button('保存到目前回覆／相簿',async()=>{
              try{if(!sameScope({...current,messageId:scene?.id}))throw new Error('故事或回覆已改變，請重新開啟畫面工具。');
                const asset=await Assets.get(record.assetId);if(!asset)throw new Error('圖片遺失。');
                await Assets.save(asset,{...record,...current,dmKey:null,dmOffer:null,messageId:scene.id,archived:false,inStory:true,inPhone:true});await paint();
              }catch(error){statusError(status)(error);}
            });
            card.append(copy,remove);
          }
          grid.append(card);
        }
        more.hidden=rows.length<=offset+12;
        if(!rows.length)grid.append(el('p','尚未保存圖片。'));
      }catch(error){statusError(status)(error);}
    };
    all.input.addEventListener('change',()=>{offset=0;void paint();});
    container.append(heading,help);if(!phone)container.append(all.wrap);container.append(grid,more,status);
    const changed=()=>{void paint();};window.addEventListener('bao:generated-images-changed',changed);void paint();
    return ()=>{dead=true;cleanup();window.removeEventListener('bao:generated-images-changed',changed);};
  }
  async function exportStory() {
    const current=Assets.scope();
    const story=await window.BAOStoryBackup.buildBundle(current.storyId);
    const images=await Assets.exportPack(current.storyId);
    images.links=images.links.map(link=>({...link,archived:link.archived || !story.chapters.some(chapter=>chapter.chapterId===link.chapterId)}));
    if(Assets.scope().storyId!==current.storyId)throw new Error('故事已切換，請重新匯出。');
    return {schema:'yorubay-illustrated-story',version:1,story,images};
  }
  async function importStory(bundle) {
    if(bundle?.schema!=='yorubay-illustrated-story'||bundle.version!==1)throw new Error('請選擇「故事＋生成圖片」備份。');
    const pack=await Assets.validatePack(bundle.images);
    const story=window.BAOStoryBackup.sanitizeBundle(bundle.story);
    for(const link of pack.links){
      const chapter=story.chapters.find(c=>c.chapterId===link.chapterId);
      // Rolled-back image records intentionally remain archived; chapter must exist.
      if(!chapter && !link.archived)throw new Error('備份中的圖片章節不存在。');
    }
    const imported=await window.BAOStoryBackup.importBundle(story);
    try{await Assets.importPack(pack,imported.storyId,imported.chapterMap);}
    catch(error){
      try{if(!await window.BAOStoryLibrary.deleteStory(imported.storyId))throw new Error();}
      catch(_){throw new Error('圖片匯入失敗，且無法清除這次新匯入的故事；請在故事書庫檢查匯入副本。原故事及備份仍保留。');}
      throw error;
    }
    return imported;
  }
  function attach(view,{scene,card,output,profile,dm=null}) {
    const {panel,status}=view,current={...Assets.scope(),messageId:scene.id};
    const section=el('details');section.className='image-generation';section.open=true;
    section.append(el('summary','生成場景圖片／角色照片'));
    const kind=field('圖片類型','select');options(kind.input,[['scene','故事場景'],['selfie','角色自拍／生活照']]);
    const castList=cast(card);
    const people=dm?[castList.find(p=>p.id===dm.senderId || p.name===dm.name) ||
      {id:dm.senderId,name:dm.name,appearance:'',outfit:''}]:castList;
    const character=field('角色','select');options(character.input,people.map(p=>[p.id,p.name]));
    const appearance=field('角色外貌（只用於這張照片）','textarea');appearance.input.rows=3;
    const refreshPerson=()=>{const p=people.find(p=>p.id===character.input.value);appearance.input.value=[p?.appearance,p?.outfit].filter(Boolean).join('\n');};
    const kindChanged=()=>{character.wrap.hidden=appearance.wrap.hidden=kind.input.value!=='selfie';consent.input.checked=false;};
    kind.input.addEventListener('change',kindChanged);
    refreshPerson();character.input.addEventListener('change',refreshPerson);
    const photo=field('拍攝場景、服裝、表情、構圖與風格','textarea');photo.input.rows=2;photo.input.placeholder='例如：窗邊、微笑、半身自拍、自然光';
    const provider=field('圖片供應商','select');options(provider.input,[['openai','OpenAI Images'],['gemini','Google Gemini Image'],['openrouter','OpenRouter Images'],['custom','自訂 OpenAI Images 中轉（未驗證）']]);provider.input.value=settings.provider;
    const model=field('圖片模型','select'),customModel=field('中轉圖片 Model ID'),endpoint=field('中轉完整 Images 端點');
    endpoint.input.type='url';endpoint.input.value=settings.endpoint;customModel.input.value='';
    const customConsent=check('我已查閱此中轉文件，確認所填模型及端點支援 OpenAI Images；金鑰會交給此中轉。');
    const key=field('圖片 API Key（只留在本頁，重載後需重填）');key.input.type='password';key.input.autocomplete='off';key.input.value=settings.key;
    const ratio=field('圖片比例','select'),quality=field('品質／解析度','select');
    const reference=field('選用已授權的角色參考圖');reference.input.type='file';reference.input.accept='image/png,image/jpeg,image/webp';
    const authorized=check('我有權將此參考圖片送給所選供應商。');let referenceData='',referenceBusy=false,referenceEpoch=0;
    const consistency=el('p');
    const consent=check('我確認本次圖片請求可能收費，並同意將以下完整提示詞及已選參考圖送給此供應商。');
    const prompt=field('即將送出的完整圖片提示詞（可修改）','textarea');prompt.input.rows=7;
    const compile=()=>{const out=output(),person=people.find(p=>p.id===character.input.value);prompt.input.value=[out.image_prompt||scene.context,
      kind.input.value==='selfie'?`角色照片：${person?.name||''}\n外貌：${appearance.input.value}`:'',
      photo.input.value,out.continuity_prompt||profile.value,out.negative_prompt?`避免：${out.negative_prompt}`:'',
      '僅生成視覺素材；不增添故事事實。'].filter(Boolean).join('\n\n').slice(0,24000);consent.input.checked=false;};
    if(dm){
      kind.input.value=dm.offer.kind;
      const sender=people.find(p=>p.id===dm.senderId || p.name===dm.name);
      if(sender)character.input.value=sender.id;
      refreshPerson();
      if(!sender)appearance.input.value='';
    }
    compile();kindChanged();
    const config=()=>({provider:provider.input.value,model:provider.input.value==='custom'?customModel.input.value:model.input.value,
      endpoint:endpoint.input.value,key:key.input.value,catalog,ratio:ratio.input.value,quality:quality.input.value,
      referenceAuthorized:authorized.input.checked,
      confirmedRoute:customConsent.input.checked?endpoint.input.value+'|'+customModel.input.value:''});
    const updateCaps=()=>{
      try{const caps=Core.capability(config());options(ratio.input,caps.ratios);options(quality.input,caps.qualities);
        reference.wrap.hidden=authorized.wrap.hidden=!caps.reference;
        if(!caps.reference){referenceEpoch++;referenceBusy=false;referenceData='';reference.input.value='';authorized.input.checked=false;}
        consistency.textContent=caps.reference?'未選參考圖時僅為文字外觀近似；選擇並授權參考圖可加強一致性，不能保證同一張臉。':'此路徑使用文字外觀近似，不傳送參考圖，也不保證同一張臉。';
      }catch(error){options(ratio.input,['']);options(quality.input,['']);consistency.textContent=error.message;}
      consent.input.checked=false;
    };
    const refreshModels=()=>{
      const p=provider.input.value;options(model.input,p==='openai'?Core.OPENAI:p==='gemini'?Core.GEMINI:p==='openrouter'?catalog.map(m=>[m.id,m.name||m.id]):[]);
      if([...model.input.options].some(o=>o.value===settings.model))model.input.value=settings.model;
      model.wrap.hidden=p==='custom';customModel.wrap.hidden=endpoint.wrap.hidden=customConsent.wrap.hidden=p!=='custom';updateCaps();
    };
    const discover=button('讀取 OpenRouter 生圖目錄',async()=>{
      discover.disabled=true;status.textContent='正在讀取公開模型能力目錄（不生成圖片）…';
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{const res=await fetch('https://openrouter.ai/api/v1/images/models',{signal:controller.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
        if(!res.ok)throw new Error('模型目錄讀取失敗。');
        const parsed=JSON.parse(new TextDecoder().decode(await Core.readBounded(res,2*1024*1024)));
        catalog=(parsed.data||[]).filter(m=>typeof m.id==='string' && m.architecture?.output_modalities?.includes('image')).slice(0,500);
        if(!catalog.length)throw new Error('目錄沒有可用生圖模型。');
        if(provider.input.value!=='openrouter'){
          provider.input.value='openrouter';provider.input.dispatchEvent(new Event('change'));
        }else refreshModels();status.textContent='目錄已更新；品質選項只列目錄宣告能力，實際供應商可能有額外限制。';
      }catch(_){status.textContent='無法讀取 OpenRouter 生圖目錄，請稍後手動重試。';}finally{clearTimeout(timer);discover.disabled=false;}
    });
    provider.input.addEventListener('change',()=>{referenceEpoch++;referenceBusy=false;key.input.value='';referenceData='';reference.input.value='';authorized.input.checked=false;refreshModels();});
    model.input.addEventListener('change',updateCaps);
    for(const input of [endpoint.input,customModel.input])input.addEventListener('input',()=>{customConsent.input.checked=false;updateCaps();});
    customConsent.input.addEventListener('change',updateCaps);
    reference.input.addEventListener('change',async()=>{
      const epoch=++referenceEpoch;referenceData='';referenceBusy=false;authorized.input.checked=false;const file=reference.input.files?.[0];if(!file)return;
      referenceBusy=true;
      try{const encoded=await window.BAOStoryImages.encode(file);if(epoch!==referenceEpoch)return;referenceData=encoded.data;status.textContent='參考圖已在本機縮圖；只有主動生成時才傳送。';}catch(error){if(epoch===referenceEpoch){statusError(status)(error);reference.input.value='';}}finally{if(epoch===referenceEpoch)referenceBusy=false;}
    });
    refreshModels();
    const price=el('p','每次只生成 1 張。費用依模型、品質、尺寸與輸入計算；取消或逾時不保證免收費。不自動重試或換模型。OpenAI 可能要求組織驗證；中轉需允許瀏覽器 CORS。');
    const links=el('p');for(const [label,url] of [['OpenAI 價格','https://developers.openai.com/api/docs/pricing'],['Google 價格','https://ai.google.dev/gemini-api/docs/pricing'],['OpenRouter 模型價格','https://openrouter.ai/models?output_modalities=image']]){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a,document.createTextNode('　'));}
    const result=el('section'),busyStatus=el('p');result.className='image-gen-result';busyStatus.setAttribute('role','status');let controller=null,resultUrl='';
    const generate=button('確認並生成 1 張圖片',async()=>{
      if(controller)return;
      if(dm && !dm.valid()){status.textContent='分享位置或照片提議已改變，請重新開啟。';return;}
      if(!sameScope(current)){status.textContent='請先保存故事，並從有效 AI 回覆開啟畫面工具。';return;}
      if(referenceBusy){status.textContent='參考圖片仍在處理中。';return;}
      if(!consent.input.checked){status.textContent='請先核對完整提示詞、模型及費用，勾選本次確認。';return;}
      const chosen=config(),snapshot={kind:kind.input.value,characterId:kind.input.value==='selfie'?character.input.value:'',characterName:kind.input.value==='selfie'?people.find(p=>p.id===character.input.value)?.name:'',description:photo.input.value};
      try{Core.request(chosen,prompt.input.value,referenceData);}catch(error){statusError(status)(error);return;}
      settings.provider=chosen.provider;settings.model=chosen.model;settings.key=chosen.key;settings.endpoint=chosen.endpoint;
      controller=new AbortController();generate.disabled=true;cancel.hidden=false;consent.input.checked=false;
      busyStatus.textContent='正在生成圖片…請保持此頁開啟。';status.textContent='';
      try{
        const blob=await client.generate(chosen,prompt.input.value,{reference:referenceData,signal:controller.signal});
        const prepared=await Assets.prepare(blob);
        if(controller.signal.aborted || !view.overlay.isConnected){busyStatus.textContent='操作已取消，未自動保存結果；請核對供應商帳單。';return;}
        if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=URL.createObjectURL(blob);view.urls.add(resultUrl);
        result.replaceChildren();const img=el('img');img.src=resultUrl;img.alt='本次生成結果';img.className='image-gen-full';
        const title=field('圖片標題');title.input.value=dm?dm.offer.description.slice(0,100):snapshot.kind==='selfie'?`${snapshot.characterName}的照片`:'故事場景';
        const story=check('加入指定回覆的故事畫面'),phone=check('加入本章 Phone 相簿');story.input.checked=true;
        const save=button(dm?(dm.x?'確認發布至 X':dm.group?'傳送至這段群聊':'傳送至這段私訊'):'保存圖片',async()=>{
          save.disabled=true;
          try{if(!sameScope(current))throw new Error('故事已改變，請下載圖片後在正確故事匯入。');
            if(dm && !dm.valid())throw new Error('分享位置或照片提議已改變。');
            await Assets.save(prepared,{...current,...snapshot,...(dm?{dmKey:dm.key,dmOffer:dm.signature,characterName:dm.name,characterId:dm.senderId}:{}),title:title.input.value,createdAt:new Date().toISOString(),provider:chosen.provider,model:chosen.model,inStory:story.input.checked,inPhone:phone.input.checked});
            if(dm){dm.delivered();view.dismiss();return;}
            status.textContent='圖片與引用已保存到本機。跨裝置請使用「故事＋生成圖片」備份。';
          }catch(error){statusError(status)(error);}finally{save.disabled=false;}
        });
        if(dm){story.input.checked=false;story.wrap.hidden=true;}
        result.append(img,title.wrap,story.wrap,phone.wrap,save,button('下載圖片',()=>{try{download(blob,'yorubay-image.'+blob.type.split('/')[1]);status.textContent='已交給瀏覽器下載；請確認下載紀錄。';}catch(_){status.textContent='下載啟動失敗，請檢查瀏覽器設定。';}}),button('捨棄此結果',()=>{URL.revokeObjectURL(resultUrl);resultUrl='';result.replaceChildren();}));
        busyStatus.textContent=sameScope(current)?'圖片已生成，尚未保存。重新生成需再次勾選費用確認。':'圖片已生成，但故事已切換；請先下載保留圖片。';
      }catch(error){busyStatus.textContent=error.message||'圖片生成失敗。';}finally{controller=null;generate.disabled=false;cancel.hidden=true;}
    });
    generate.className='image-gen-generate';
    const cancel=button('取消等待',()=>controller?.abort());cancel.hidden=true;
    section.append(kind.wrap,character.wrap,appearance.wrap,photo.wrap,button('套用現有 Prompt／角色與拍攝設定',compile),prompt.wrap,
      provider.wrap,model.wrap,discover,customModel.wrap,endpoint.wrap,customConsent.wrap,key.wrap,ratio.wrap,quality.wrap,
      reference.wrap,authorized.wrap,consistency,price,links,consent.wrap,generate,cancel,busyStatus,result);
    const gallery=el('details');gallery.append(el('summary','生成圖集與完整備份'));const body=el('div');gallery.append(body);
    const cleanupCollection=mountCollection(body,{scene});
    const backup=button('下載故事＋生成圖片備份',async()=>{backup.disabled=true;try{const bundle=await exportStory();download(new Blob([JSON.stringify(bundle)],{type:'application/json'}),'yorubay-illustrated-story.json');status.textContent='已交給瀏覽器下載；請確認備份檔案。';}catch(error){statusError(status)(error);}finally{backup.disabled=false;}});
    const restore=field('匯入故事＋生成圖片備份');restore.input.type='file';restore.input.accept='.json,application/json';
    restore.input.addEventListener('change',async()=>{const file=restore.input.files?.[0];if(!file)return;
      restore.input.disabled=true;try{
        if(file.size>360*1024*1024)throw new Error('備份超過 360 MiB，無法匯入。');
        const value=JSON.parse(await file.text());const imported=await importStory(value);
        status.textContent=`已匯入 ${imported.chapterCount} 個章節及圖片，請從故事書庫開啟「${imported.title}」。`;
      }catch(error){statusError(status)(error);}finally{restore.input.disabled=false;restore.input.value='';}
    });
    body.prepend(el('p','一般故事 JSON／TXT／Drive 備份不包含生成圖片。請用此處的完整備份攜帶圖片；備份含私人圖片與故事，請自行保管。'),backup,restore.wrap);
    panel.append(section);if(!dm)panel.append(gallery);
    view.onDismiss(()=>{referenceEpoch++;controller?.abort();cleanupCollection();});
  }
  async function renderStory() {
    const revision=++renderRevision,current=Assets.scope();if(!current.storyId){storyCleanup();return;}
    let records;try{records=Assets.visible(await Assets.list(current.storyId),current,'inStory');}catch(_){return;}
    if(revision!==renderRevision || Assets.scope().chapterId!==current.chapterId)return;
    const stream=document.getElementById('chat-stream'),top=stream?.getBoundingClientRect().top;
    const anchor=stream && [...stream.querySelectorAll('.message')].find(node=>node.getBoundingClientRect().bottom>top);
    const offset=anchor?.getBoundingClientRect().top;
    const opened=new Set([...document.querySelectorAll('.generated-story-pictures[open]')].map(node=>node.dataset.messageId));
    storyCleanup();const cleanup=[];
    document.querySelectorAll('.generated-story-pictures').forEach(node=>node.remove());
    for(const node of document.querySelectorAll('[data-bao-scene-prompt]')){
      const messageId=node.dataset.messageId,items=records.filter(r=>r.messageId===messageId);if(!items.length)continue;
      const strip=el('details');strip.className='generated-story-pictures';strip.dataset.messageId=messageId;strip.open=opened.has(messageId);strip.append(el('summary',`已保存畫面 · ${items.length}`));
      for(const record of items){const thumb=thumbnail(record);strip.append(thumb.img,el('small',record.title));cleanup.push(thumb.cleanup);}
      node.parentNode.append(strip);
    }
    if(anchor?.isConnected)stream.scrollTop+=anchor.getBoundingClientRect().top-offset;
    storyCleanup=()=>cleanup.forEach(fn=>fn());
  }
  window.addEventListener('bao:generated-images-changed',()=>{void renderStory();window.BAOPhoneUI?.refreshFromState();});
  window.BAOImageGeneration=Object.freeze({thumbnail,attach,renderStory,mountCollection,exportStory,importStory});
})();
