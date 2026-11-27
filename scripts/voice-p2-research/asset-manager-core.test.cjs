'use strict';
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {createAssetManager}=require('./asset-manager-core.cjs');
const sha256=x=>createHash('sha256').update(x).digest('hex');
const bytes=new Uint8Array([1,2,3]);
const good={id:'test-stt',kind:'stt',version:'v1',license:'fixture',approved:true,files:[{path:'onnx/model.onnx',bytes:3,sha256:sha256(bytes),url:'https://huggingface.co/example/model/resolve/'+'a'.repeat(40)+'/onnx/model.onnx'}]};
function fixture(catalog=[good],opts={}){
 const ready=new Map();let requests=0,rollbacks=0;
 const store={isReady:async k=>ready.has(k),remove:async k=>ready.delete(k),begin:async k=>{
   const temp=new Map();
   return {put:async(p,b)=>temp.set(p,b),commit:async()=>ready.set(k,temp),rollback:async()=>{rollbacks++;temp.clear();}};
 }};
 const manager=createAssetManager({catalog,store,sha256,lock:async(k,fn)=>fn(),estimate:async()=>100,
 fetchAsset:async()=>{requests++;return bytes;},...opts});
 return {manager,ready,requests:()=>requests,rollbacks:()=>rollbacks};
}
async function main(){
 const f=fixture(),m=f.manager;
 assert.equal(m.list()[0].bytes,3);assert.equal(await m.status('test-stt'),'not-installed');assert.equal(f.requests(),0);
 await assert.rejects(m.install('test-stt'),/consent/);assert.equal(f.requests(),0);
 let progress;
 assert.equal(await m.install('test-stt',{confirmed:true,onProgress:p=>progress=p}),'installed');
 assert.equal(progress.received,3);assert.equal(await m.status('test-stt'),'ready');
 assert.equal(await m.install('test-stt',{confirmed:true}),'already-installed');assert.equal(f.requests(),1);
 await assert.rejects(m.remove('test-stt'),/consent/);await m.remove('test-stt',{confirmed:true});
 assert.equal(await m.status('test-stt'),'not-installed');
 await m.install('test-stt',{confirmed:true,importFile:async()=>bytes});assert.equal(f.requests(),1);
 const bad=fixture([good],{fetchAsset:async()=>new Uint8Array([0,0,0])});
 await assert.rejects(bad.manager.install('test-stt',{confirmed:true}),/integrity/);
 assert.equal(bad.ready.size,0);assert.equal(bad.rollbacks(),1);
 const low=fixture([good],{estimate:async()=>2});await assert.rejects(low.manager.install('test-stt',{confirmed:true}),/storage/);assert.equal(low.requests(),0);
 let release;const pending=fixture([good],{fetchAsset:async()=>new Promise(resolve=>{release=resolve;})});
 const job=pending.manager.install('test-stt',{confirmed:true});await new Promise(resolve=>setImmediate(resolve));
 await assert.rejects(pending.manager.install('test-stt',{confirmed:true}),/busy/);
 assert.equal(pending.manager.cancel('test-stt'),true);release(bytes);await assert.rejects(job,/Cancelled/);assert.equal(pending.ready.size,0);
 const unapproved=fixture([{...good,approved:false}]);await assert.rejects(unapproved.manager.install('test-stt',{confirmed:true}),/not approved/);assert.equal(unapproved.requests(),0);
 assert.throws(()=>fixture([{...good,files:[{...good.files[0],path:'../secret'}]}]),/Invalid/);
 assert.throws(()=>fixture([{...good,files:[{...good.files[0],url:'https://example.com/file'}]}]),/Unapproved/);
 console.log('Opt-in asset contract fixtures passed; no real downloads or storage adapter tested.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
