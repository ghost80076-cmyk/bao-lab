/* Chapter-scoped audio assets for local collections and voice messages. */
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
     const request=indexedDB.open('yorubay-audio-assets',2);
     request.onupgradeneeded=event=>{
       const db=request.result;
       if(event.oldVersion===0){
         const meta=db.createObjectStore('metadata',{keyPath:'id'});
         meta.createIndex('scope','scope');meta.createIndex('size','size');
         db.createObjectStore('audio',{keyPath:'id'});
       }
       db.createObjectStore('deletions');
     };
     request.onblocked=()=>reject(Error('本機音訊庫被其他分頁阻擋。'));
     request.onerror=()=>reject(Error('無法開啟本機音訊庫。'));
     request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
   }).catch(e=>{opening=null;throw e;}));
 }
 async function transact(mode,run){
   const db=await open();
   return new Promise((resolve,reject)=>{
     const tx=db.transaction(['metadata','audio','deletions'],mode);let result,error;
     const stop=text=>{error=Error(text);tx.abort();};
     tx.oncomplete=()=>resolve(result);
     tx.onabort=tx.onerror=()=>reject(error||Error('本機音訊庫操作失敗，請確認剩餘儲存空間。'));
     try{run(tx.objectStore('metadata'),tx.objectStore('audio'),v=>{result=v;},stop,tx.objectStore('deletions'));}catch(_){stop('本機音訊庫操作未完成。');}
   });
 }
 // Check deletion markers in the same transaction as audio writes. A purge
 // either removes the write or leaves a marker that blocks it in a stale tab.
 function withLiveScope(deletions,storyId,key,run,stop){
   const story=deletions.get(JSON.stringify([storyId]));
   const chapter=deletions.get(key);
   chapter.onsuccess=()=>{
     if(story.result||chapter.result)return stop('故事或章節已刪除。');
     run();
   };
 }
 async function save(scope,blob,duration,valid,delivery=null){
   if(delivery)delivery=Core.storyVoiceDelivery(delivery);
   const key=scopeKey(scope);
   if(typeof valid!=='function'||!valid())throw Error('故事章節已切換。');
   if(!Number.isFinite(duration)||duration<=0||duration>Core.AUDIO_DRAFT_MAX_SECONDS)throw Error('音檔長度無效。');
   const normalized=await Core.localAudioDraft(blob);
   const bytes=await normalized.blob.arrayBuffer();
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
   const id=JSON.stringify(delivery?[key,hash,delivery.id]:[key,hash]);
   const row={id,scope:key,type:normalized.blob.type,extension:normalized.extension,size:bytes.byteLength,duration,createdAt:new Date().toISOString(),...(delivery?{delivery}:{})};
   if(!valid())throw Error('故事章節已切換。');
   return transact('readwrite',(meta,audio,done,stop,deletions)=>withLiveScope(deletions,scope.storyId,key,()=>{
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
   },stop));
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
 const base64=bytes=>{const a=new Uint8Array(bytes);let out='';for(let i=0;i<a.length;i+=8192)out+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(out);};
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 async function exportPack(storyId,chapters){
   const keys=new Map(chapters.map(chapterId=>[scopeKey({storyId,chapterId}),chapterId]));
   const rows=await transact('readonly',(meta,audio,done,stop)=>{
     const items=[];let pending=0,finished=false;
     const finish=()=>{if(finished&&!pending)done(items);};
     const cursor=meta.openCursor();cursor.onsuccess=()=>{
       const entry=cursor.result;if(!entry){finished=true;finish();return;}
       const row=entry.value,chapterId=keys.get(row.scope);
       if(chapterId){
         pending++;const req=audio.get(row.id);req.onsuccess=()=>{
           const stored=req.result;
           const blob=stored?.bytes instanceof ArrayBuffer
             ? new Blob([stored.bytes],{type:row.type})
             : stored?.blob;
           if(!(blob instanceof Blob)||blob.size!==row.size||blob.type!==row.type)return stop('音訊備份引用不完整。');
           items.push({chapterId,hash:JSON.parse(row.id)[1],type:row.type,duration:row.duration,createdAt:row.createdAt,blob,...(row.delivery?{delivery:row.delivery}:{})});
           pending--;finish();
         };
       }
       entry.continue();
     };
   });
   const items=[];
   for(const {blob,...row} of rows)items.push({...row,data:base64(await blob.arrayBuffer())});
   return {version:items.some(item=>item.delivery)?2:1,items};
 }
 async function validatePack(pack,chapterIds){
   if(![1,2].includes(pack?.version)||!Array.isArray(pack.items)||pack.items.length>chapterIds.length*COUNT||pack.items.length>LIMIT/12)throw Error('音訊備份格式無效。');
   const ids=new Set(chapterIds),counts=new Map(),seen=new Set(),rows=[];let total=0;
   for(const item of pack.items){
     if(!ids.has(item?.chapterId)||typeof item.data!=='string'||item.data.length>Math.ceil(Core.AUDIO_DRAFT_MAX_BYTES/3)*4||item.data.length%4!==0||/[^A-Za-z0-9+/=]/.test(item.data)||!/^[a-f0-9]{64}$/.test(item.hash)||!Number.isFinite(item.duration)||item.duration<=0||item.duration>Core.AUDIO_DRAFT_MAX_SECONDS||typeof item.type!=='string')throw Error('音訊備份資料無效。');
     const delivery=item.delivery===undefined?null:Core.storyVoiceDelivery(item.delivery);
     if(delivery&&pack.version!==2)throw Error('音訊備份版本與訊息格式不符。');
     const key=JSON.stringify(delivery?[item.chapterId,delivery.id]:[item.chapterId,item.hash]);
     if(seen.has(key))throw Error('音訊備份包含重複引用。');
     seen.add(key);const count=(counts.get(item.chapterId)||0)+1;counts.set(item.chapterId,count);if(count>COUNT)throw Error('章節音訊超過數量上限。');
     const raw=atob(item.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;
     total+=bytes.byteLength;if(total>LIMIT)throw Error('音訊備份超過 128 MiB。');
     const normalized=await Core.localAudioDraft(new Blob([bytes],{type:item.type}));
     if(normalized.blob.type!==item.type||await digest(bytes)!==item.hash)throw Error('音訊備份雜湊或格式不符。');
     rows.push({chapterId:item.chapterId,hash:item.hash,type:item.type,extension:normalized.extension,duration:item.duration,createdAt:typeof item.createdAt==='string'&&Number.isFinite(Date.parse(item.createdAt))?new Date(item.createdAt).toISOString():new Date().toISOString(),bytes,...(delivery?{delivery}:{})});
   }
   return rows;
 }
 function importPack(rows,storyId,chapterMap){
   const prepared=rows.map(row=>{
     if(!Object.hasOwn(chapterMap,row.chapterId))throw Error('音訊備份章節不存在。');
     const scope=scopeKey({storyId,chapterId:chapterMap[row.chapterId]}),id=JSON.stringify(row.delivery?[scope,row.hash,row.delivery.id]:[scope,row.hash]);
     return {meta:{id,scope,type:row.type,extension:row.extension,duration:row.duration,createdAt:row.createdAt,size:row.bytes.byteLength,...(row.delivery?{delivery:row.delivery}:{})},bytes:row.bytes};
   });
   return transact('readwrite',(meta,audio,done,stop,deletions)=>{
     const keys=new Set([JSON.stringify([storyId]),...prepared.map(row=>row.meta.scope)]);
     const checks=Array.from(keys,key=>deletions.get(key));
     checks.at(-1).onsuccess=()=>{
       if(checks.some(check=>check.result))return stop('故事或章節已刪除。');
       let total=0;
       const request=meta.index('size').openKeyCursor();
       request.onsuccess=()=>{
         const cursor=request.result;
         if(cursor){total+=cursor.key;cursor.continue();return;}
         if(total+prepared.reduce((n,row)=>n+row.meta.size,0)>LIMIT)return stop('匯入後超過本機音訊容量上限。');
         for(const row of prepared){meta.add(row.meta);audio.add({id:row.meta.id,bytes:row.bytes});}
         done(prepared.length);
       };
     };
   });
 }
 // Deletions are authorized by committed story-library tombstones, never by
 // missing records or a caller's current chapter. Preserve promoted children.
 function purgeDeleted(records){
   const stories=new Set(),chapters=new Set();
   for(const row of records||[]){
     if(row.kind==='deletion')stories.add(row.storyId);
     else if(row.kind==='chapter-deletion')chapters.add(JSON.stringify([row.storyId,row.chapterId]));
   }
   if(!stories.size&&!chapters.size)return Promise.resolve(0);
   return transact('readwrite',(meta,audio,done,_,deletions)=>{
     for(const storyId of stories)deletions.put(true,JSON.stringify([storyId]));
     for(const key of chapters)deletions.put(true,key);
     let count=0;const request=meta.openCursor();request.onsuccess=()=>{
       const cursor=request.result;if(!cursor){done(count);return;}
       let storyId;try{[storyId]=JSON.parse(cursor.value.scope);}catch(_){}
       if(stories.has(storyId)||chapters.has(cursor.value.scope)){audio.delete(cursor.primaryKey);cursor.delete();count++;}
       cursor.continue();
     };
   });
 }
 window.BAOStoryVoiceAssets=Object.freeze({save,list,get,remove,exportPack,validatePack,importPack,purgeDeleted});
})();