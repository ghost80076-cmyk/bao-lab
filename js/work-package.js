/* Local work-package intake and media. No remote downloads or model calls. */
(() => {
  'use strict';
  const Core=window.BAOWorkPackageCore, engine=CharacterEngine;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const style=document.createElement('link');style.rel='stylesheet';style.href='css/work-package.css?v=1';document.head.append(style);
  function validate(result){
    const lib=result.character.gameplay?.initial_state?.worldbookLibrary||result.character.initial_state?.worldbookLibrary;
    if(lib){
      if(!engine.normalizeWorldbookLibrary(lib)||new TextEncoder().encode(JSON.stringify(lib)).length>3500000)throw new Error('作品世界書超過目前 6 包／3.5 MB 上限。');
      if(!window.YoruWorldbookLibraryCore)throw new Error('世界書工具尚在載入，請稍後再匯入。');
      for(const book of [...lib.installed,...Object.values(lib.pinned)]){if(new TextEncoder().encode(JSON.stringify(book)).length>1600000)throw new Error('單包世界書超過 1.6 MB，請由 Creator 分卷，保留原文。');window.YoruWorldbookLibraryCore.normalizePack(book);}
    }
    return window.BAOCharacterImport.inspect(result.character);
  }
  async function prepareFile(file){
    if(file.size>Core.LIMITS.archive)throw new Error('作品 ZIP 超過 32 MB。');
    const files=await Core.unzip(new Uint8Array(await file.arrayBuffer()));
    if(!files['manifest.json'])throw new Error('這份 ZIP 尚未整理成夜灣作品包；請交給 Creator MCP 轉換，保留原檔。');
    const result=Core.assemble(Core.jsonFile(files,'manifest.json'),files);validate(result);
    const used=new Set(['manifest.json',result.manifest.character,result.manifest.regex,...result.manifest.worldbooks.map(x=>typeof x==='string'?x:x.path),...result.assets.map(x=>x.path)]);
    const packageFiles=Object.fromEntries(Object.entries(files).filter(([name])=>!used.has(name)));
    return {converted:false,format:'夜灣作品包',origin:file.name,character:result.character,manifest:result.manifest,
      packageOptions:{assets:result.assets.map(({bytes,...meta})=>({...meta,blob:new Blob([bytes],{type:meta.mime})})),packageFiles}};
  }
  function dialog(title){
    const wrap=document.createElement('div');wrap.className='work-package-overlay';
    wrap.innerHTML=`<section class="work-package-dialog" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header><h2>${esc(title)}</h2><button type="button" class="text-button" data-close aria-label="關閉${esc(title)}">關閉</button></header><div data-body></div></section>`;
    document.body.append(wrap);const old=document.activeElement;
    const close=()=>{wrap.remove();old?.focus?.();};
    wrap.querySelector('[data-close]').onclick=close;
    wrap.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();wrap.querySelector('[data-close]').click();}
      if(event.key==='Tab'){
        const nodes=[...wrap.querySelectorAll('button,input,[tabindex="0"]')].filter(x=>!x.disabled);
        if(event.shiftKey&&document.activeElement===nodes[0]){event.preventDefault();nodes.at(-1)?.focus();}
        else if(!event.shiftKey&&document.activeElement===nodes.at(-1)){event.preventDefault();nodes[0]?.focus();}
      }
    });wrap.querySelector('[data-close]').focus();return {wrap,body:wrap.querySelector('[data-body]'),close};
  }
  function preview(draft,save){
    return new Promise((resolve,reject)=>{
      const {wrap,body,close}=dialog('匯入作品包'),m=draft.manifest,urls=[];
      const cancel=()=>{urls.forEach(url=>URL.revokeObjectURL(url));close();reject(new Error('已取消作品包匯入，沒有寫入資料。'));};
      wrap.querySelector('[data-close]').onclick=cancel;
      const assets=draft.packageOptions.assets;
      const images=assets.slice(0,8).map(asset=>{const url=URL.createObjectURL(asset.blob);urls.push(url);return `<figure><img src="${url}" alt="${esc(asset.name)}"><figcaption>${esc(asset.name)}</figcaption></figure>`;}).join('');
      const manual=Array.isArray(m.adaptation?.manual)?m.adaptation.manual:[];
      body.innerHTML=`<h3>${esc(draft.character.meta?.name||draft.character.name)}</h3><p>一次保存角色、${m.worldbooks.length} 包世界書與 ${assets.length} 張圖片到這台瀏覽器。</p><div class="work-package-grid">${images}</div>${assets.length>8?`<p>另外 ${assets.length-8} 張圖片也會一併保存。</p>`:''}${m.regex?'<p>原作正則一併保留，可在作品的 Regex 工具查看與啟用。</p>':''}${manual.length?`<details open><summary>仍需適配的功能</summary><ul>${manual.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:''}<p data-error role="status"></p><footer><button type="button" class="secondary" data-cancel>取消</button><button type="button" class="primary" data-confirm>匯入到本機</button></footer>`;
      body.querySelector('[data-cancel]').onclick=cancel;
      body.querySelector('[data-confirm]').onclick=async event=>{
        event.target.disabled=true;
        try{const saved=await save(draft.character,null,draft.packageOptions);urls.forEach(url=>URL.revokeObjectURL(url));close();resolve(saved);}
        catch(error){body.querySelector('[data-error]').textContent=error.message;event.target.disabled=false;}
      };
    });
  }
  function sceneURL(character,state,role='scene'){
    const asset=Core.matchAsset(character?.asset_manifest?.assets,state,role);
    return asset?engine.getWorkAssetURL?.(character.id,asset.id)||'':'';
  }
  function rewriteHTML(html,character){
    let value=String(html||'');
    for(const asset of character?.asset_manifest?.assets||[]){
      const url=engine.getWorkAssetURL?.(character.id,asset.id);if(!url)continue;
      for(const ref of new Set(['yorubay-asset://'+asset.id,'embeded://'+asset.path,asset.source_uri].filter(Boolean)))value=value.split(ref).join(url);
    }return value;
  }
  // Opaque sandbox frames cannot dereference the parent page's Blob URLs.
  // Convert only images used by this display copy; never persist rewritten rules.
  const encodedImages=new WeakMap(),frameJobs=new WeakMap();
  function setFrameHTML(frame,html,character){
    const owner=character?.id,job={},references=[];frameJobs.set(frame,job);
    for(const asset of engine.getWorkAssets?.(owner)||[]){
      const refs=[...new Set(['yorubay-asset://'+asset.id,'embeded://'+asset.path,asset.source_uri,asset.public_url?'https://yorubay.com/'+asset.public_url:null].filter(Boolean))].filter(ref=>html.includes(ref));
      if(refs.length)references.push({asset,refs});
    }
    if(!references.length){frame.srcdoc=html;return;}
    frame.dataset.workAssetsPending='1';
    void (async()=>{
      let result=html;
      for(const {asset,refs} of references){
        if(!asset.blob&&/^assets\/community\/[a-zA-Z0-9_-]+\/media\/[a-zA-Z0-9_.-]+$/.test(asset.public_url||'')){
          const response=await fetch('/'+asset.public_url,{credentials:'omit'});if(!response.ok)throw new Error('作品圖片讀取失敗。');asset.blob=await response.blob();
        }
        if(!asset.blob)continue;
        if(!encodedImages.has(asset.blob))encodedImages.set(asset.blob,new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(asset.blob);}));
        const url=await encodedImages.get(asset.blob);for(const ref of refs)result=result.split(ref).join(url);
      }
      if(frameJobs.get(frame)!==job||!frame.isConnected||App.activeCharacter?.id!==owner)return;
      delete frame.dataset.workAssetsPending;frame.srcdoc=result;
    })().catch(error=>{console.warn('作品圖片顯示副本準備失敗：',error);if(frame.isConnected&&frameJobs.get(frame)===job){delete frame.dataset.workAssetsPending;frame.srcdoc=html;}});
  }
  function syncSceneCard(character,state){
    const host=document.querySelector('#chat-view .chat-main');if(!host)return;
    let card=host.querySelector('[data-work-current-scene]');
    const src=sceneURL(character,state)||String(character?.reading_background||'');
    if(!character?.asset_manifest?.assets?.length||!src){card?.remove();return;}
    if(!card){card=document.createElement('details');card.dataset.workCurrentScene='';card.className='work-package-current-scene';card.innerHTML='<summary></summary><div class="gameplay-scene-visual"><img alt="目前場景"><img class="work-package-portrait" alt="目前人物"></div>';host.prepend(card);}
    const label='場景圖片 · '+String(state?.location||'目前位置'),summary=card.querySelector('summary');if(summary.textContent!==label)summary.textContent=label;
    const image=card.querySelector('img');if(image.getAttribute('src')!==src)image.src=src;
    const portrait=card.querySelector('.work-package-portrait'),url=sceneURL(character,state,'portrait');portrait.hidden=!url;if(url&&portrait.getAttribute('src')!==url)portrait.src=url;
  }
  function gallery(){
    const character=App.activeCharacter,assets=engine.getWorkAssets?.(character?.id)||[];
    const {body}=dialog('作品圖片');
    body.innerHTML='<label>尋找圖片<input type="search" data-search placeholder="圖片名稱"></label><div class="work-package-grid" data-images></div>';
    const render=()=>{const term=body.querySelector('[data-search]').value.toLowerCase();body.querySelector('[data-images]').innerHTML=assets.filter(x=>x.name.toLowerCase().includes(term)).map(asset=>`<figure><img loading="lazy" src="${esc(engine.getWorkAssetURL(character.id,asset.id))}" alt="${esc(asset.name)}"><figcaption>${esc(asset.name)}</figcaption></figure>`).join('');};
    body.querySelector('[data-search]').oninput=render;render();
  }
  async function download(id){const result=await engine.exportWorkPackage(id),url=URL.createObjectURL(new Blob([result.bytes],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download=id+'.yorubay.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function enhance(){
    const input=document.getElementById('import-character-file');if(input)input.accept='application/json,.json,image/png,.png,application/zip,.zip';
    const button=document.getElementById('import-character-button');if(button&&button.textContent!=='匯入作品（JSON／PNG／ZIP）')button.textContent='匯入作品（JSON／PNG／ZIP）';
    document.querySelectorAll('.local-character-row').forEach(row=>{const remove=row.querySelector('[data-remove-character]');if(!remove||row.querySelector('[data-work-export]'))return;const b=document.createElement('button');b.className='text-button';b.textContent='匯出作品包';b.dataset.workExport=remove.dataset.removeCharacter;row.insertBefore(b,remove);});
    const aside=document.querySelector('#chat-view aside'),count=App.activeCharacter?.asset_manifest?.assets?.length||0;
    let galleryButton=aside?.querySelector('[data-work-gallery]');
    if(aside&&count&&!galleryButton){galleryButton=document.createElement('button');galleryButton.className='text-button';galleryButton.dataset.workGallery='';galleryButton.onclick=gallery;(aside.querySelector('[data-chat-tool-body="world"]')||aside).append(galleryButton);}
    if(galleryButton&&!count){galleryButton.remove();galleryButton=null;}
    if(galleryButton){galleryButton.hidden=false;if(galleryButton.textContent!==`作品圖片（${count}）`)galleryButton.textContent=`作品圖片（${count}）`;}
  }
  document.addEventListener('click',event=>{const b=event.target.closest?.('[data-work-export]');if(b)download(b.dataset.workExport).catch(error=>window.alert(error.message));});
  const observer=new MutationObserver(()=>{if(!pending){pending=true;requestAnimationFrame(()=>{pending=false;enhance();});}});let pending=false;
  observer.observe(document.body,{childList:true,subtree:true});enhance();
  window.BAOWorkPackage={prepareFile,preview,sceneURL,rewriteHTML,setFrameHTML,syncSceneCard,gallery,download};
})();
