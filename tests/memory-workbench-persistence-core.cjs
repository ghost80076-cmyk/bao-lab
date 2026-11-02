'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fixture() {
  const controls = new Map();
  function control(key) {
    if (!controls.has(key)) controls.set(key, {value: '', textContent: '', disabled: false,
      addEventListener(type, fn) {this[type] = fn;}});
    return controls.get(key);
  }
  const area = {querySelector: control, querySelectorAll: () => [], innerHTML: ''};
  let disk, sends = 0, flushFailure = false, failFinal = false, mutate = () => {};
  const ctx = {console, confirm: () => true,
    document: {querySelectorAll: () => [area], getElementById: () => null},
    App: {config: {api: {key:'mock',model:'test'}}, escapeHTML:String,escapeAttr:String,
      saveStory() {
        if (failFinal && ctx.GameState.current.memoryRefineDraft && !ctx.GameState.current.memoryRefineJob) return false;
        disk = structuredClone(ctx.GameState.current); return true;
      }},
    Chat: {messages:[{id:'u',role:'user',content:'我走進店裡'},{id:'a',role:'assistant',content:'店員向你點頭'}],
      normalizeMemoryResult: async () => ({summary:'已確認的摘要'})},
    GameState: {current:{}}, BAOHelperData: {memoryRules:''},
    BAOMemoryWorkbench: {readSlots:()=>[],refresh(){}},
    Storage: {flush:async()=>{if(flushFailure)throw new Error('storage offline');}, loadStory:()=>({state:disk})},
    BAOStorageWriteGuard: {verify:()=>({ok:true})},
    API: {send:async()=>{sends++;mutate();return{text:'model result',finishReason:'STOP'};}}
  };
  ctx.window=ctx;
  vm.createContext(ctx);
  for(const file of ['memory-core.js','story-maintenance-lock.js','memory-workbench-ai.js'])
    vm.runInContext(fs.readFileSync('js/'+file,'utf8'),ctx);
  ctx.BAOMemoryAI.mount({querySelector:key=>key==='#memory-ai-area'?area:null},[]);
  control('[data-refine-source]').value='all';control('[data-refine-style]').value='deep';
  return {ctx,run:()=>control('[data-run-refine]').click(),count:()=>sends,
    failure(value){flushFailure=value;},finalFailure(value){failFinal=value;},
    mutate(fn){mutate=fn;},status:()=>control('[data-refine-status]').textContent,
    reload(){ctx.GameState.current=structuredClone(disk);}};
}
(async()=>{
  const f=fixture(),owner=f.ctx.GameState.current;
  f.ctx.BAOStoryMaintenanceLock.start(owner);
  await f.run();assert.equal(f.count(),0);
  f.ctx.BAOStoryMaintenanceLock.end(owner);
  f.failure(true);await f.run();
  assert.equal(owner.memoryRefineJob,undefined,'failed flush cannot advance checkpoint');
  assert.equal(owner.memoryRefineDraft,undefined);
  assert.match(f.status(),/storage offline/);
  assert.equal(f.ctx.BAOStoryMaintenanceLock.has(owner),false);
  f.failure(false);f.finalFailure(true);await f.run();
  assert.equal(owner.memoryRefineJob.offset>0,true);
  assert.equal(owner.memoryRefineDraft,undefined,'failed final save keeps completed checkpoint');
  f.reload();f.finalFailure(false);
  const before=f.count();await f.run();
  assert.equal(f.count(),before,'completed checkpoint survives reload without another provider call');
  assert.equal(f.ctx.GameState.current.memoryRefineDraft,'已確認的摘要');
  const stale=fixture();
  stale.mutate(()=>{stale.ctx.App.config.api.model='changed-in-place';});
  await stale.run();
  assert.equal(stale.ctx.GameState.current.memoryRefineDraft,undefined);
  assert.equal(stale.ctx.GameState.current.memoryRefineJob,undefined);
  assert.match(stale.status(),/來源已變更/);
  console.log('AI memory workbench: shared lock, durable progress, final-save retry after reload and in-place setting changes passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
