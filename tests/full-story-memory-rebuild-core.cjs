const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../js/full-story-memory-rebuild-core.js');
const memoryCore = require('../js/memory-core.js');

const make = n => Array.from({ length: n }, (_, i) => [
  { id: 'u-' + (i + 1), role: 'user', content: '玩家第' + (i + 1) + '輪' },
  { id: 'a-' + (i + 1), role: 'assistant', content: '故事第' + (i + 1) + '輪結果', context_content: '整理後語義第' + (i + 1) + '輪結果' }
]).flat();

const plan = core.plan(make(100), 20);
assert.equal(plan.eligible, 80);
assert.equal(plan.endId, 'a-80');
assert.equal(plan.endIndex, 159);
assert.equal(core.restore(make(101), plan).endIndex, 159, 'appended turns may not invalidate a completed source prefix');
const tampered = make(100); tampered[1].content = '歷史遭到修改';
assert.throws(() => core.restore(tampered, plan), /來源原文已修改/);
const undone = make(4); undone.splice(2, 0, { id:'orphan', role:'user', content:'沒有答覆' });
assert.throws(() => core.plan(undone, 1), /沒有角色回覆/, 'incomplete middle turns must not silently disappear');
const greeting = [{ id:'greeting',role:'assistant',content:'故事開場' }, ...make(5)];
assert.equal(core.units(greeting)[0].messages[0].id, 'greeting');
const budget = { fits: (_, m) => JSON.stringify(m).length < 850 };
const picked = core.batch(plan.units, 0, budget, {}, text => [{ role:'user',content:text }]);
assert(picked.length > 0 && picked.length < 20);
assert(picked.at(-1).endId.startsWith('a-'));
assert.throws(() => core.cleanResult({events: [],knownFacts: [],relationships: [],openThreads: [],reviewedRounds: 1,
  evidence:[{text:'假的',messageIds:['unknown']}],stateEvidence:[]},['u-1','a-1'],1),/證據/);

global.window = global;
global.App = {
  config: { api:{key:'mock',model:'model-a',protocol:'openai',baseUrl:'http://local.test'}, memory:{mode:'smart'} },
  modelPresets:[], saveStory: () => true, escapeHTML: x => String(x), escapeAttr: x => String(x), __requestPending: false
};
global.Chat = { messages:make(100),summary:'OLD_OFFICIAL',summarizedUntil:40,
  memoryHealth:{phase:'success'},summarizing:false,ensureMessageIds() { return this.messages; } };
global.GameState = { current: { memory:['OLD_OFFICIAL'],modules:{inventory:['KEEP']},location:'公寓',money:100,
  episodicMemory:{events:['legacy-keep']},canon:{notebooks:['keep']}, memorySlots:[{text:'玩家手動筆記'}] } };
global.BAOMemoryCore = memoryCore;
global.BAOFullMemoryRebuildCore = core;
global.Storage = { flush:async()=>{},loadStory:()=>({ok:true}) };
global.BAOStorageWriteGuard = {verify:()=>({ok:true})};
let calls=0, blockAt=2;
global.API={send:async (cfg, messages) => {
  assert.equal(cfg.__memoryTask, true);
  const prompt=messages[1].content;
  calls++;
  if (calls === blockAt) return {text:'',finishReason:'PROHIBITED_CONTENT'};
  if (prompt.includes('【原始對話】')) {
    const count=Number(prompt.match(/必須完整檢查 (\d+) 輪/)[1]);
    const id=prompt.match(/\[(u-\d+)\]/)[1];
    return {text:JSON.stringify({
      reviewedRounds:count, events:['已確認的重要事件 '+id],knownFacts:[],relationships:[],openThreads:[],
      evidence:[{text:'事件 '+id,messageIds:[id],certainty:'confirmed',knownBy:[]}],
      stateEvidence:[{kind:'money',detail:'某回合的經濟變化 '+id,messageIds:[id]}]
    }),finishReason:'STOP'};
  }
  assert(prompt.includes('【已按時間排序的分段整理】'));
  return {text:JSON.stringify({events:['最新已驗證摘要'],knownFacts:[],relationships:[],openThreads:[]}),finishReason:'STOP'};
}};
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname,'../js/story-maintenance-lock.js'),'utf8'));
vm.runInThisContext(fs.readFileSync(require('node:path').join(__dirname,'../js/full-story-memory-rebuild.js'),'utf8'));
const service=global.BAOFullStoryMemoryRebuild;
(async () => {
  const owner = GameState.current;
  assert.equal(BAOStoryMaintenanceLock.start(owner), true);
  await assert.rejects(service.run(20), /正在執行/);
  assert.equal(calls, 0, 'a busy story must not consume a paid request');
  BAOStoryMaintenanceLock.end(owner);
  const originalSend = API.send;
  API.send = async (...args) => {
    assert.equal(BAOStoryMaintenanceLock.has(owner), true, 'maintenance owns this story during each paid call');
    return originalSend(...args);
  };
  await assert.rejects(service.run(20), /阻擋/);
  assert.equal(BAOStoryMaintenanceLock.has(owner), false, 'blocked provider releases the maintenance guard');
  const paused=service.getDisplayJob();
  assert.equal(paused.job.cursor,20);
  assert.equal(Chat.summary,'OLD_OFFICIAL');
  assert.equal(Chat.summarizedUntil,40);
  assert.equal(GameState.current.location,'公寓');
  assert.equal(GameState.current.money,100);
  assert.deepEqual(GameState.current.modules.inventory,['KEEP']);

  blockAt=999;
  let next=await service.run(20);
  assert.equal(next.eligible,80);
  assert.equal(next.stage,'ready');
  assert.equal(GameState.current.fullMemoryRebuild.parts.length,4);
  assert.equal(GameState.current.fullMemoryRebuild.parts[0].start,1);
  assert.equal(GameState.current.fullMemoryRebuild.parts.at(-1).end,80);
  assert.equal(GameState.current.fullMemoryRebuild.parts.at(-1).output.stateEvidence[0].kind,'money');
  assert.equal(Chat.summary,'OLD_OFFICIAL', 'a completed draft must not automatically replace official memory');
  assert.equal(GameState.current.episodicMemory.events[0],'legacy-keep');
  Chat.messages.push(...make(1).map((m,i)=>({...m,id:m.id+'-new'})));
  await service.apply();
  assert.equal(Chat.summarizedUntil,160);
  assert.match(Chat.summary,/最新已驗證摘要/);
  assert.equal(GameState.current.fullMemoryRebuild.stage,'applied');
  assert.equal(GameState.current.fullMemoryRebuildBackup.summary,'OLD_OFFICIAL');
  assert.equal(GameState.current.money,100);
  assert.equal(GameState.current.canon.notebooks[0],'keep');
  assert.equal(GameState.current.memorySlots[0].text,'玩家手動筆記');
  await service.rollback();
  Chat.messages=make(100); // remove the appended story used to test frozen-source commits
  assert.equal(Chat.summary,'OLD_OFFICIAL');
  assert.equal(Chat.summarizedUntil,40);
  assert.equal(GameState.current.fullMemoryRebuildBackup,null);

  await service.run(20); // four paid extraction calls
  await service.run(20); // explicit second action for final merge
  assert.equal(GameState.current.fullMemoryRebuild.stage,'ready');
  await service.apply();
  Chat.summary='AUTO_SUMMARY_MOVED_ON';
  await assert.rejects(service.rollback(),/後續摘要修改/);
  assert.equal(Chat.summary,'AUTO_SUMMARY_MOVED_ON');
  await service.reset();
  assert.equal(GameState.current.fullMemoryRebuild,undefined);
  assert.equal(Chat.summary,'AUTO_SUMMARY_MOVED_ON');

  // Source changes after a paid checkpoint forbid stale resume and commit.
  Chat.summary='OLD_OFFICIAL';
  Chat.summarizedUntil=40;
  await service.run(40); // this covers only the first 60 completed rounds
  Chat.messages[1].content='被編輯的故事原文';
  await assert.rejects(service.run(40),/來源原文已修改/);
  await assert.rejects(service.apply(),/尚未完成全部歷史重建|來源原文已修改/);
  await service.reset();
  assert.equal(Chat.summary,'OLD_OFFICIAL');

  // Checkpoint write failures revert progress and leave official memory unchanged.
  let failOnce=true;
  const oldSave=App.saveStory;
  App.saveStory=() => { if (failOnce) { failOnce=false; return false; } return true; };
  await assert.rejects(service.run(20),/進度未前移/);
  assert.equal(GameState.current.fullMemoryRebuild,undefined);
  assert.equal(Chat.summary,'OLD_OFFICIAL');
  App.saveStory=oldSave;

  console.log('full story memory rebuild core and runtime tests passed');
})().catch(error => { console.error(error); process.exitCode=1; });
