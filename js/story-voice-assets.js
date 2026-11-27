/* Chapter-local player audio collection. Separate from story turns and delivery. */
(()=>{
 'use strict';
 const Core=window.BAOStoryVoiceCore;
 if(!Core||window.BAOStoryVoiceAssets)return;
 const LIMIT=128*1024*1024,COUNT=32;
 let opening;
 function scopeKey(scope){
   const {storyId,chapterId}=scope||{};
   if(typeof storyId!=='string'||!storyId||storyId.length>300||typeof chapterId!=='string'||!chapterId||chapterId.length>300)throw Error('請先保存有效的故事章節。');
   return JSON.stringify([storyId,chapterId]);
 }
 function open(){
   return opening||(opening=new Promise((resolve,reject)=>{
     const request=indexedDB.open('yorubay-audio-assets',1);
     request.onupgradeneeded=()=>{
       const db=request.result;
       const meta=db.createObjectStore('metadata',{keyPath:'id'});
       meta.createIndex('scope','scope');meta.createIndex('size','size');
       db.createObjectStore('audio',{keyPath:'id'});
     };
     request.onblocked=()=>reject(Error('本機音訊庫被其他分頁阻擋。'));
     request.onerror=()=>reject(Error('無法開啟本機音訊庫。'));
     request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
   }).catch(e=>{opening=null;throw e;}));
 }
 async function transact(mode,run){
   const db=await open();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction(['metadata','audio'],mode);let result,error;
     const stop=text=>{error=Error(text);tx.abort();};
     tx.oncomplete=()=>resolve(result);
     tx.onabort=tx.onerror=()=>reject(error||Error('本機音訊庫操作失敗，請確認剩餘儲存空間。'));
     try{run(tx.objectStore('metadata'),tx.objectStore('audio'),v=>{result=v;},stop);}catch(_){stop('本機音訊庫操作未完成。');}
   });
 }
 async function save(scope,blob,duration,valid){
   const key=scopeKey(scope);
   if(typeof valid!=='function'||!valid())throw Error('故事章節已切換。');
   if(!Number.isFinite(duration)||duration<=0||duration>Core.AUDIO_DRAFT_MAX_SECONDS)throw Error('音檔長度無效。');
   const normalized=await Core.localAudioDraft(blob);
   const bytes=await normalized.blob.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   const id=JSON.stringify([key,hash]);
   const row={id,scope:key,type:normalized.blob.type,extension:normalized.extension,size:bytes.byteLength,duration,createdAt:new Date().toISOString()};
   if(!valid())throw Error('故事章節已切換。');
   return transact('readwrite',(meta,audio,done,stop)=>{
     if(!valid())return stop('故事章節已切換。');
     const existing=meta.get(id);
     existing.onsuccess=()=>{
       if(!valid())return stop('故事章節已切換。');
       if(existing.result){done(existing.result);return;}
       let size=0;const cursor=meta.index('size').openKeyCursor();
       cursor.onsuccess=()=>{
         const item=cursor.result;
         if(item){size+=item.key;item.continue();return;}
         if(size+row.size>LIMIT)return stop('音訊庫已達 128 MiB，請下載並刪除不用的音檔。');
         const count=meta.index('scope').count(key);
         count.onsuccess=()=>{
           if(!valid())return stop('故事章節已切換。');
           if(count.result>=COUNT)return stop('本章節最多保存 32 段音訊。');
           meta.add(row);audio.add({id,bytes});done(row);
         };
       };
     };
   });
 }
 function list(scope){
   const key=scopeKey(scope);
   return transact('readonly',(meta,_,done)=>{const request=meta.index('scope').getAll(key);request.onsuccess=()=>done(request.result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));});
 }
 function get(scope,id){
   const key=scopeKey(scope);
   return transact('readonly',(meta,audio,done,stop)=>{
     const request=meta.get(id);request.onsuccess=()=>{
       const row=request.result;if(!row||row.scope!==key)return stop('這段音訊不屬於目前章節。');
       const asset=audio.get(id);asset.onsuccess=()=>{
         const stored=asset.result;
         const blob=stored?.bytes instanceof ArrayBuffer?new Blob([stored.bytes],{type:row.type}):stored?.blob;
         if(!(blob instanceof Blob)||blob.size!==row.size||blob.type!==row.type)return stop('本機音訊已遺失或格式不符。');
         done({row,blob});
       };
     };
   });
 }
 function remove(scope,id){
   const key=scopeKey(scope);
   return transact('readwrite',(meta,audio,done,stop)=>{
     const request=meta.get(id);request.onsuccess=()=>{
       if(!request.result||request.result.scope!==key)return stop('這段音訊不屬於目前章節。');
       meta.delete(id);audio.delete(id);done(true);
     };
   });
 }
 window.BAOStoryVoiceAssets=Object.freeze({save,list,get,remove});
})();