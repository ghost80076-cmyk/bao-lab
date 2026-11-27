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
 const base64=bytes=>{const a=new Uint8Array(bytes);let out='';for(let i=0;i<a.length;i+=8192)out+=String.fromCharCode(...a.subarray(i,i+8192));return btoa(out);};
 const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 function exportPack(storyId,chapters){
   const keys=new Map(chapters.map(chapterId=>[scopeKey({storyId,chapterId}),chapterId]));
   return transact('readonly',(meta,audio,done,stop)=>{
     const items=[];let pending=0,finished=false;
     const finish=()=>{if(finished&&!pending)done({version:1,items});};
     const cursor=meta.openCursor();cursor.onsuccess=()=>{
       const entry=cursor.result;if(!entry){finished=true;finish();return;}
       const row=entry.value,chapterId=keys.get(row.scope);
       if(chapterId){
         pending++;const req=audio.get(row.id);req.onsuccess=()=>{
           const bytes=req.result?.bytes;
           if(!(bytes instanceof ArrayBuffer)||bytes.byteLength!==row.size)return stop('音訊備份引用不完整。');
           const hash=JSON.parse(row.id)[1];
           items.push({chapterId,hash,type:row.type,duration:row.duration,createdAt:row.createdAt,data:base64(bytes)});
           pending--;finish();
         };
       }
       entry.continue();
     };
   });
 }
 async function validatePack(pack,chapterIds){
   if(pack?.version!==1||!Array.isArray(pack.items)||pack.items.length>chapterIds.length*COUNT||pack.items.length>LIMIT/12)throw Error('音訊備份格式無效。');
   const ids=new Set(chapterIds),counts=new Map(),seen=new Set(),rows=[];let total=0;
   for(const item of pack.items){
     if(!ids.has(item?.chapterId)||typeof item.data!=='string'||item.data.length>Math.ceil(Core.AUDIO_DRAFT_MAX_BYTES/3)*4||item.data.length%4!==0||/[^A-Za-z0-9+/=]/.test(item.data)||!/^[a-f0-9]{64}$/.test(item.hash)||!Number.isFinite(item.duration)||item.duration<=0||item.duration>Core.AUDIO_DRAFT_MAX_SECONDS||typeof item.type!=='string')throw Error('音訊備份資料無效。');
     const key=JSON.stringify([item.chapterId,item.hash]);
     if(seen.has(key))throw Error('音訊備份包含重複引用。');
     seen.add(key);const count=(counts.get(item.chapterId)||0)+1;counts.set(item.chapterId,count);if(count>COUNT)throw Error('章節音訊超過數量上限。');
     const raw=atob(item.data),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;
     total+=bytes.byteLength;if(total>LIMIT)throw Error('音訊備份超過 128 MiB。');
     const normalized=await Core.localAudioDraft(new Blob([bytes],{type:item.type}));
     if(normalized.blob.type!==item.type||await digest(bytes)!==item.hash)throw Error('音訊備份雜湊或格式不符。');
     rows.push({chapterId:item.chapterId,hash:item.hash,type:item.type,extension:normalized.extension,duration:item.duration,createdAt:typeof item.createdAt==='string'&&Number.isFinite(Date.parse(item.createdAt))?new Date(item.createdAt).toISOString():new Date().toISOString(),bytes});
   }
   return rows;
 }
 function importPack(rows,storyId,chapterMap){
   const prepared=rows.map(row=>{
     if(!Object.hasOwn(chapterMap,row.chapterId))throw Error('音訊備份章節不存在。');
     const scope=scopeKey({storyId,chapterId:chapterMap[row.chapterId]}),id=JSON.stringify([scope,row.hash]);
     return {meta:{id,scope,type:row.type,extension:row.extension,duration:row.duration,createdAt:row.createdAt,size:row.bytes.byteLength},bytes:row.bytes};
   });
   return transact('readwrite',(meta,audio,done,stop)=>{
     let total=0;const request=meta.index('size').openKeyCursor();
     request.onsuccess=()=>{
       const cursor=request.result;if(cursor){total+=cursor.key;cursor.continue();return;}
       if(total+prepared.reduce((n,row)=>n+row.meta.size,0)>LIMIT)return stop('匯入後超過本機音訊容量上限。');
       for(const row of prepared){meta.add(row.meta);audio.add({id:row.meta.id,bytes:row.bytes});}
       done(prepared.length);
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
   return transact('readwrite',(meta,audio,done)=>{
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