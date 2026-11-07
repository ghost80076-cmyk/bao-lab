'use strict';
const assert=require('node:assert/strict');
const chapter=require('../js/chapter-memory-core.js');
const workflow=require('../js/chapter-memory-workflow.js');
const clone=x=>structuredClone(x);
const messages=[{id:'g',role:'assistant',content:'開場白'}];
for(let i=1;i<=45;i++){
  messages.push({id:'u'+i,role:'user',content:'第'+i+'輪玩家在港口提出問題。'},
    {id:'a'+i,role:'assistant',content:'第'+i+'輪艾琳回答她確實知道的內容。'});
}
const baseRanges=workflow.ranges(messages,null,20);
assert.deepEqual(baseRanges.map(x=>[x.start,x.end,x.turns]),[[1,41,20],[41,81,20],[81,91,5]]);
assert.deepEqual(baseRanges.map(x=>x.available),[true,true,true]);
const nextSource=messages.slice();
nextSource[6]={...nextSource[6],role:'tool'};
assert.equal(workflow.ranges(nextSource,null,20).some(x=>x.start===1&&x.end===41),false,
  'tool and nonalternating messages must split rather than invent an uninterrupted chapter');
let owner={name:'story-A'},activeOwner=owner;
let activeConfig={id:'config-A'}, activeCharacter={id:'character-A'};
let disk=null,saveCalls=0,flushCalls=0,modelCalls=0;
let flushError=false,verifyFailure=false,refuseSave=false;
let onFlush=()=>{};
let lockOwner=null;
const lock={
  start(o){if(lockOwner)return false;lockOwner=o;return true;},
  end(o){if(lockOwner===o){lockOwner=null;return true;}return false;}
};
const params=()=>({
  owner,config:activeConfig,character:activeCharacter,
  currentOwner:()=>activeOwner,currentConfig:()=>activeConfig,
  currentCharacter:()=>activeCharacter,currentMessages:()=>messages,
  isBusy:()=>false,lock,
  save:()=>{
    if(refuseSave)return false;
    saveCalls++;disk={state:clone(activeOwner)};return true;
  },
  flush:async()=>{
    flushCalls++;onFlush();
    if(flushError)throw Error('IndexedDB offline');
  },
  load:()=>disk,
  verify:()=>({ok:!verifyFailure})
});
const resolver={resolveActor:(_state,name)=>name==='琳'?'艾琳':name};
(async()=>{
  const chosen=baseRanges[0], before=JSON.stringify(messages);
  const save=()=>workflow.saveChapter({...params(),messages,start:chosen.start,end:chosen.end,
    text:'艾琳與玩家在港口合作調查舊信，尚未結案。',keywords:['舊信','港口'],
    scope:'actors',knownBy:['琳'],state:owner,resolver});
  let approved=await save();
  assert.equal(saveCalls,1);
  assert.equal(flushCalls,1);
  assert.deepEqual(approved.known_by,['艾琳']);
  assert.equal(chapter.check(approved,messages).ok,true);
  assert.equal(owner.chapterMemory.chapters.length,1);
  assert.deepEqual(workflow.ranges(messages,owner.chapterMemory,20).map(x=>x.available),[false,true,true]);
  assert.equal(JSON.stringify(messages),before,'saving a chapter must never mutate source chat');
  assert.equal(modelCalls,0,'no model call in manual chapter approval');
  assert.equal(lockOwner,null);
  owner=clone(disk.state);activeOwner=owner;
  assert.equal(chapter.check(owner.chapterMemory.chapters[0],messages).ok,true,'full story reload keeps source-bound chapter');
  assert.equal(JSON.stringify(owner.chapterMemory.chapters),JSON.stringify(disk.state.chapterMemory));
  const previous=owner.chapterMemory;
  refuseSave=true;
  await assert.rejects(workflow.removeChapter({...params(),id:approved.id}),/尚未受理保存/);
  assert.equal(owner.chapterMemory,previous,'synchronous save rejection restores original archive');
  assert.equal(lockOwner,null);refuseSave=false;
  flushError=true;
  await assert.rejects(workflow.removeChapter({...params(),id:approved.id}),/IndexedDB offline/);
  assert.equal(owner.chapterMemory,previous,'failed durable flush restores owner archive');
  assert.equal(lockOwner,null);flushError=false;
  verifyFailure=true;
  await assert.rejects(workflow.removeChapter({...params(),id:approved.id}),/尚未確認寫入/);
  assert.equal(owner.chapterMemory,previous,'storage verification failure restores owner archive');
  verifyFailure=false;
  onFlush=()=>{activeOwner={name:'story-B'};};
  await assert.rejects(workflow.removeChapter({...params(),id:approved.id}),/來源已變更/);
  assert.equal(owner.chapterMemory,previous,'story switch during flush cannot alter former owner');
  activeOwner=owner;onFlush=()=>{};
  const changed=clone(messages);
  changed[52].content+='來源已改寫';
  await assert.rejects(workflow.saveChapter({...params(),messages,start:41,end:81,
    currentMessages:()=>changed,text:'另一章。',keywords:['舊信'],scope:'shared',knownBy:[]}),
    /來源已改變|來源已變更/,'editing selected messages before commit invalidates chapter');
  assert.equal(owner.chapterMemory,previous);
  await assert.rejects(workflow.saveChapter({...params(),messages,start:41,end:81,
    text:'未分類的內容。',keywords:[],scope:'actors',knownBy:[],state:owner,resolver}),/知情名單/);
  assert.equal(owner.chapterMemory,previous);
  const busyLock={...lock,start:()=>false};
  await assert.rejects(workflow.removeChapter({...params(),id:approved.id,lock:busyLock}),/正在整理或保存/);
  assert.equal(owner.chapterMemory,previous);
  const editedOld=clone(messages);editedOld[11].content+='較早章節已改寫';
  let audit=chapter.audit(owner.chapterMemory,editedOld);
  assert.ok(audit.some(x=>!x.ok),'source rewrite makes old record invalid without deleting it');
  await workflow.removeChapter({...params(),id:approved.id});
  assert.equal(owner.chapterMemory.chapters.length,0);
  assert.equal(disk.state.chapterMemory.chapters.length,0,'explicit removal is persisted');
  assert.equal(lockOwner,null);
  assert.equal(modelCalls,0);
  console.log('PASS chapter source windows, manual approval, per-story save+reload, provider-free operation, failed flush/verification rollback, source edit and story-switch guards');
})().catch(err=>{console.error(err);process.exitCode=1;});
