'use strict';
// Research-only portable asset manager. No startup fetch, DOM, or story dependencies.
// Host supplies a trusted catalog and transactional private storage adapter.
// No production model is approved by this module.
function createAssetManager({catalog,store,fetchAsset,sha256,estimate,lock}){
 if(!catalog||!store||typeof fetchAsset!=='function'||typeof sha256!=='function'||typeof lock!=='function')throw Error('Missing adapter');
 const entries=new Map();
 for(const raw of catalog){
  if(!/^[a-z0-9][a-z0-9.-]{0,80}$/.test(raw.id)||!['stt','tts','runtime'].includes(raw.kind)||!Array.isArray(raw.files)||!raw.files.length||entries.has(raw.id)||!raw.version||!raw.license)throw Error('Invalid catalog entry');
  const seen=new Set();let total=0;
  const files=raw.files.map(f=>{
   if(typeof f.path!=='string'||!f.path.split('/').every(p=>/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(p))||seen.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<1||!/^[a-f0-9]{64}$/.test(f.sha256))throw Error('Invalid asset file');
   const url=new URL(f.url);
   // Only explicitly allowlisted upstream HTTPS origins, no credentials or arbitrary author URLs.
   if(url.origin!=='https://huggingface.co'||url.username||url.password||url.search||url.hash||!/^\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/resolve\/[a-f0-9]{40}\//.test(url.pathname))throw Error('Unapproved download source');
   seen.add(f.path);total+=f.bytes;
   if(!Number.isSafeInteger(total)||total>2_000_000_000)throw Error('Asset size exceeds research limit');
   return Object.freeze({path:f.path,bytes:f.bytes,sha256:f.sha256,url:url.href});
  });
  entries.set(raw.id,Object.freeze({id:raw.id,kind:raw.kind,version:String(raw.version),license:String(raw.license),files:Object.freeze(files),bytes:total,approved:raw.approved===true}));
 }
 const jobs=new Map();
 function entry(id){const e=entries.get(id);if(!e)throw Error('Unknown asset');return e;}
 function key(e){return e.id+'@'+e.version;}
 function list(){return [...entries.values()].map(({files,...meta})=>({...meta}));}
 async function status(id){const e=entry(id);if(jobs.has(id))return 'busy';return await store.isReady(key(e))?'ready':'not-installed';}
 function abortIf(signal){if(signal.aborted)throw Error('Cancelled');}
 async function install(id,{confirmed=false,onProgress=()=>{},importFile}={}){
  const e=entry(id);
  if(!e.approved)throw Error('Research candidate not approved');
  if(confirmed!==true)throw Error('Explicit player consent required');
  if(jobs.has(id))throw Error('Asset busy');
  const controller=new AbortController(),signal=controller.signal; jobs.set(id,controller);
  try{return await lock(key(e),async()=>{
    abortIf(signal);
    if(await store.isReady(key(e)))return 'already-installed';
    if(estimate){const available=await estimate();if(Number.isFinite(available)&&available<e.bytes)throw Error('Insufficient local storage');}
    abortIf(signal);
    const tx=await store.begin(key(e));let received=0;
    try{
     for(const f of e.files){
      abortIf(signal);
      // The adapter must bound streaming bytes before allocation and verify redirect policy.
      // File import is explicit and obeys the identical integrity contract.
      const data=await (importFile?importFile(f,{signal,maxBytes:f.bytes}):fetchAsset(f,{signal,maxBytes:f.bytes}));
      abortIf(signal);
      if(!(data instanceof Uint8Array)||data.byteLength!==f.bytes||await sha256(data)!==f.sha256)throw Error('Asset integrity mismatch: '+f.path);
      abortIf(signal);await tx.put(f.path,data);received+=f.bytes;
      onProgress({received,total:e.bytes,path:f.path});
     }
     abortIf(signal);
     // commit atomically publishes complete files; cancellation before commit is honored.
     await tx.commit();return 'installed';
    }catch(err){await tx.rollback();throw err;}
  });}finally{jobs.delete(id);}
 }
 function cancel(id){const c=jobs.get(id);if(!c)return false;c.abort();return true;}
 async function remove(id,{confirmed=false}={}){
  const e=entry(id);if(confirmed!==true)throw Error('Explicit delete consent required');
  if(jobs.has(id))throw Error('Asset busy');
  return lock(key(e),()=>store.remove(key(e)));
 }
 return {list,status,install,cancel,remove};
}
if(typeof module!=='undefined')module.exports={createAssetManager};
