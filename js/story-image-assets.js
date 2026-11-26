/* Local visual assets: atomic asset + reference writes, independent of canonical story saves. */
(() => {
  'use strict';
  const Core = window.BAOImageGenerationCore;
  const MAX_TOTAL = 256 * 1024 * 1024, MAX_LINKS = 128;
  let ready;
  const open = () => ready || (ready = new Promise((resolve,reject) => {
    const request = indexedDB.open('yorubay-visual-assets',1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('assets',{keyPath:'id'}).createIndex('size','size');
      db.createObjectStore('thumbnails',{keyPath:'id'});
      const links = db.createObjectStore('links',{keyPath:'id'});
      links.createIndex('storyId','storyId'); links.createIndex('assetId','assetId');
    };
    request.onblocked = () => reject(new Error('圖片庫被其他分頁阻擋，請關閉舊分頁後重試。'));
    request.onerror = () => reject(new Error('無法開啟本機圖片庫。'));
    request.onsuccess = () => { const db=request.result; db.onversionchange=()=>{db.close();ready=null;};resolve(db); };
  }).catch(error=>{ready=null;throw error;}));
  async function transaction(mode,run) {
    const db = await open();
    return new Promise((resolve,reject) => {
      const tx = db.transaction(['assets','links','thumbnails'],mode); let result, failure;
      const stop = text => { failure=new Error(text);tx.abort(); };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure || new Error('圖片儲存失敗，可能空間不足。結果仍可下載；請釋放空間後重試保存。'));
      try { run(tx.objectStore('assets'),tx.objectStore('links'),value=>{result=value;},stop,tx.objectStore('thumbnails')); }
      catch (_) { stop('圖片資料操作失敗，未完成保存。'); }
    });
  }
  const notify = () => window.dispatchEvent(new CustomEvent('bao:generated-images-changed'));
  const refs = () => window.BAOStoryLibrary?.refs?.() || {};
  const scope = () => ({...refs(),messageIds:(window.Chat?.messages || []).filter(m=>m.role==='assistant').map(m=>m.id).filter(Boolean)});
  function metadata(input) {
    const text = (key,n=160) => Core.txt(input[key],n);
    const link = {id:text('id',500),assetId:text('assetId'),storyId:text('storyId'),chapterId:text('chapterId'),
      messageId:text('messageId'),title:text('title'),description:text('description',1600),characterId:text('characterId'),
      characterName:text('characterName'),chapterLabel:text('chapterLabel'),archived:input.archived===true,createdAt:text('createdAt',40),sourceType:'player-generated',
      provider:text('provider',30),model:text('model'),kind:input.kind==='selfie'?'selfie':'scene',
      inStory:input.inStory===true,inPhone:input.inPhone===true};
    if (!link.storyId || !link.chapterId || !link.messageId || !/^sha256-[a-f0-9]{64}$/.test(link.assetId)) throw new Error('圖片缺少故事、章節或回覆關聯。');
    link.id = JSON.stringify([link.storyId,link.chapterId,link.messageId,link.assetId]);
    return link;
  }
  async function prepare(blob) {
    if (!(blob instanceof Blob) || !blob.size || blob.size>Core.MAX_BYTES) throw new Error('圖片必須在 16 MiB 以內。');
    const bytes = await blob.arrayBuffer();
    const type = Core.imageType(new Uint8Array(bytes));
    if (type!==blob.type) throw new Error('圖片格式與內容不符。');
    const url = URL.createObjectURL(blob), img = new Image();
    try {
      img.src = url;
      await img.decode().catch(()=>{throw new Error('無法解碼生成圖片，請核對供應商結果。');});
      const width=img.naturalWidth,height=img.naturalHeight;
      if (!width || !height || width*height>32000000) throw new Error('圖片超過 3,200 萬像素。');
      const canvas=document.createElement('canvas'),ratio=Math.min(1,320/Math.max(width,height));
      canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
      const thumb=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.78));
      canvas.width=canvas.height=1;
      if (!thumb) throw new Error('無法建立圖片預覽。');
      const hash=await crypto.subtle.digest('SHA-256',bytes);
      return {id:'sha256-'+Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join(''),bytes,type,width,height,size:bytes.byteLength,thumbnail:await thumb.arrayBuffer()};
    } finally {img.src='';URL.revokeObjectURL(url);}
  }
  async function save(asset,input) {
    const link=metadata({...input,assetId:asset.id});
    await transaction('readwrite',(assets,links,done,stop,thumbnails)=>{
      // Read only size metadata through cursors, never all high-resolution bytes.
      let size=0; const cursor=assets.index('size').openKeyCursor();
      cursor.onsuccess=()=>{
        const row=cursor.result;
        if(row){size+=row.key;row.continue();return;}
        const existing=assets.getKey(asset.id);
        existing.onsuccess=()=>{
          if(!existing.result && size+asset.size>MAX_TOTAL)return stop('本機生成圖片已達 256 MiB，請先備份並刪除不用的圖片。');
          const request=links.index('storyId').getAll(link.storyId);
          request.onsuccess=()=>{
            if(request.result.length>=MAX_LINKS && !request.result.some(x=>x.id===link.id))return stop('這個故事已達 128 張圖片引用，請先備份與整理。');
            if(!existing.result){assets.put({...asset,thumbnail:undefined});thumbnails.put({id:asset.id,bytes:asset.thumbnail});}
            links.put(link);done(link);
          };
        };
      };
    });notify();return link;
  }
  const list = storyId => transaction('readonly',(_,links,done)=>{const r=links.index('storyId').getAll(storyId);r.onsuccess=()=>done(r.result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));});
  const get = id => transaction('readonly',(assets,_,done)=>{const r=assets.get(id);r.onsuccess=()=>done(r.result);});
  const getThumbnail = id => transaction('readonly',(_,__,done,stop,thumbnails)=>{const r=thumbnails.get(id);r.onsuccess=()=>done(r.result);});
  const visible = (links,current=scope(),target) => links.filter(link=>!link.archived && link.storyId===current.storyId && link.chapterId===current.chapterId && current.messageIds.includes(link.messageId) && (!target || link[target]));
  async function remove(id) {
    await transaction('readwrite',(assets,links,done,stop,thumbnails)=>{
      const r=links.get(id);r.onsuccess=()=>{
        if(!r.result)return;
        const assetId=r.result.assetId;links.delete(id);
        const count=links.index('assetId').count(assetId);count.onsuccess=()=>{if(count.result===0){assets.delete(assetId);thumbnails.delete(assetId);}done(true);};
      };
    });notify();
  }
  const toBase64 = bytes => {let out='';const a=new Uint8Array(bytes);for(let i=0;i<a.length;i+=8192)out+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(out);};
  async function exportPack(storyId) {
    // A single read transaction provides a consistent reference + asset snapshot.
    return transaction('readonly',(assets,links,done,stop,thumbnails)=>{
      const r=links.index('storyId').getAll(storyId);r.onsuccess=()=>{
        const records=r.result,ids=[...new Set(records.map(x=>x.assetId))],pack={version:1,links:records,assets:[]};
        if(!ids.length){done(pack);return;}
        for(const id of ids){const a=assets.get(id);a.onsuccess=()=>{
          if(!a.result)return stop('圖片引用遺失，備份已停止。');
          pack.assets.push({id,type:a.result.type,data:toBase64(a.result.bytes)});
          if(pack.assets.length===ids.length)done(pack);
        };}
      };
    });
  }
  async function validatePack(pack) {
    if(pack?.version!==1 || !Array.isArray(pack.assets) || !Array.isArray(pack.links) || pack.assets.length>MAX_LINKS || pack.links.length>MAX_LINKS)throw new Error('圖片備份格式或數量不符。');
    const prepared=[];let size=0;
    for(const item of pack.assets){
      const asset=await prepare(Core.base64(item.data,item.type));
      size+=asset.size;
      if(size>MAX_TOTAL || asset.id!==item.id || prepared.some(a=>a.id===asset.id))throw new Error('圖片備份容量、雜湊或重複內容不符。');
      prepared.push(asset);
    }
    const links=pack.links.map(metadata);
    if(links.some(l=>!prepared.some(a=>a.id===l.assetId)) || new Set(links.map(l=>l.id)).size!==links.length)throw new Error('圖片備份引用不完整。');
    return {assets:prepared,links};
  }
  async function importPack(pack,storyId,chapterMap) {
    const links=pack.links.map(link=>{
      if(!chapterMap[link.chapterId] && !link.archived)throw new Error('圖片備份引用了不存在的章節。');
      return metadata({...link,storyId,chapterId:chapterMap[link.chapterId] || 'archive-'+storyId,archived:link.archived});
    });
    await transaction('readwrite',(assets,refs,done,stop,thumbnails)=>{
      let size=0;const existing=new Set(),r=assets.index('size').openKeyCursor();r.onsuccess=()=>{
        const row=r.result;if(row){existing.add(row.primaryKey);size+=row.key;row.continue();return;}
        if(size+pack.assets.filter(a=>!existing.has(a.id)).reduce((sum,a)=>sum+a.size,0)>MAX_TOTAL)return stop('匯入圖片後會超過 256 MiB，請先釋放空間。');
        for(const asset of pack.assets)if(!existing.has(asset.id)){assets.put({...asset,thumbnail:undefined});thumbnails.put({id:asset.id,bytes:asset.thumbnail});}
        for(const link of links)refs.put(link);done(true);
      };
    });notify();
  }
  window.BAOImageAssets=Object.freeze({scope,prepare,save,list,get,getThumbnail,visible,remove,exportPack,validatePack,importPack});
})();
