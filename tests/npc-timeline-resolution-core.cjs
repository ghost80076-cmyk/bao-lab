'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(separate = false) {
  const state={npcs:[{npc_id:'npc-1',name:'艾琳',presence:'present'}],worldClock:{tickMinutes:0},modules:{},moduleDefinitions:[]};
  const ctx={console,structuredClone,App:{config:{narrativeMode:'world',api:{model:'mock',baseUrl:'https://mock.test',key:'test',protocol:'openai'},cost:{}},activeCharacter:{name:'港城故事'},renderChatShell(){},wrapBuildSystemPrompt(){}},
    Chat:{messages:[{id:'u1',role:'user',content:'我離開城市。'}]},GameState:{current:state,applyUpdate(update){if(update.world_clock)this.current.worldClock.tickMinutes+=update.world_clock.advance_minutes;}},
    WorldStateEngine:{enabled:()=>true,stateSnapshot:()=>({}),async update(){throw new Error('unexpected extra state call');},markPersistenceHint(){}},document:{}};
  ctx.window=ctx;vm.createContext(ctx);
  const load=name=>vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),ctx);
  load('helper-data');load('episodic-memory-core');
  if (separate) {
    delete ctx.WorldStateEngine;
    load('world-state');
    vm.runInContext('window.WorldStateEngine = WorldStateEngine;',ctx);
  }
  load('npc-timeline');
  return {ctx,state,core:ctx.BAONPCTimeline,load};
}
(async()=>{
  const {ctx,state,core}=harness();
  core.schedule({npcId:'npc-1',text:'是否接受王城邀請',inMinutes:60});
  const id=state.npcTimeline.schedules[0].id;
  const quote='艾琳看著來信，明確拒絕了王城的邀請。';
  const raw={npc_timeline:{resolve:[{id,quote}]}};
  assert.equal(core.resolutionContract(),'','unexpired schedules add no resolution contract');
  assert.equal(ctx.BAOHelperData.stateUpdate(raw,[],quote).npc_timeline,undefined);
  ctx.GameState.applyUpdate({world_clock:{advance_minutes:60}});
  assert.equal(core.pendingContext()[0].id,id);
  assert.equal(ctx.WorldStateEngine.stateSnapshot().npc_timeline_ready[0].id,id);
  assert.match(core.resolutionContract(),/npc_timeline/);
  ctx.Chat.messages.push({id:'wish',role:'user',content:quote});
  assert.equal(ctx.BAOHelperData.stateUpdate(raw,[],quote).npc_timeline,undefined,'player wish is not assistant evidence');
  ctx.Chat.messages.push({id:'greeting',role:'assistant',content:quote,greeting:true});
  assert.equal(ctx.BAOHelperData.stateUpdate(raw,[],quote).npc_timeline,undefined,'greeting cannot close a later task');
  ctx.Chat.messages.push({id:'a1',role:'assistant',content:quote});
  assert.equal(ctx.BAOHelperData.stateUpdate(raw,[],'different turn').npc_timeline,undefined,'old source outside current batch rejected');
  assert.equal(core.checkedResolutions({resolve:[{id,quote:'艾琳接受了王城的邀請。'}]},quote).length,0,'invented quote rejected');
  assert.equal(core.checkedResolutions({resolve:[{id:'nt-unknown',quote}]},quote).length,0);
  const patch=ctx.BAOHelperData.stateUpdate(raw,[],quote);
  assert.equal(patch.npc_timeline.resolve[0].evidence.id,'a1');
  ctx.GameState.applyUpdate(patch);
  assert.equal(core.snapshot('npc-1').schedules[0].status,'resolved');
  assert.match(core.promptBlock(),/明確拒絕/,'negative outcome retained exactly');
  ctx.GameState.applyUpdate(patch);assert.equal(state.npcTimeline.schedules.length,1,'replay is idempotent');
  assert.equal(core.pendingContext().length,0,'resolved tasks leave active contract');
  ctx.Chat.messages.at(-1).content='艾琳還沒有作決定。';
  assert.equal(core.snapshot('npc-1').schedules[0].status,'invalidated');
  assert.doesNotMatch(core.promptBlock(),/明確拒絕/,'edited evidence cannot remain model knowledge');
  assert.equal(core.reopen(id),true);assert.equal(core.snapshot('npc-1').schedules[0].status,'ready');
  ctx.Chat.messages.push({id:'a2',role:'assistant',content:'艾琳重新讀完來信後，接受了王城的邀請。'});
  const revised={npc_timeline:{resolve:[{id,quote:ctx.Chat.messages.at(-1).content}]}};
  const newer=ctx.BAOHelperData.stateUpdate(revised,[],ctx.Chat.messages.at(-1).content);
  // A delayed patch cannot write into a different story/branch.
  ctx.GameState.current={npcs:[],worldClock:{tickMinutes:60}};ctx.GameState.applyUpdate(newer);
  assert.equal(state.npcTimeline.schedules[0].status,'ready');ctx.GameState.current=state;
  state.npcs.push({npc_id:'npc-2',name:'守衛',presence:'present'});
  assert.equal(core.pendingContext().length,0);assert.equal(ctx.BAOHelperData.stateUpdate(revised,[],ctx.Chat.messages.at(-1).content).npc_timeline,undefined,'mixed cast cannot request private task closure');
  state.npcs.pop();ctx.GameState.applyUpdate(newer);
  assert.equal(core.snapshot('npc-1').schedules[0].resolution.evidence.id,'a2');
  ctx.Chat.messages.pop();assert.equal(core.snapshot('npc-1').schedules[0].status,'invalidated','rewound message invalidates resolution');

  // Real merged-state wrapper: one story generation, followed by local extraction.
  const h=harness(), c=h.ctx;
  h.core.schedule({npcId:'npc-1',text:'是否赴約',inMinutes:1});
  c.GameState.applyUpdate({world_clock:{advance_minutes:1}});
  let calls=0;
  const resultQuote='艾琳收起信封，決定拒絕這次赴約。';
  c.API={wrapSend(id,fn){const next=this.send.bind(this);this.send=(...args)=>fn(next,...args);},async send(config,messages){
    calls++;assert.match(JSON.stringify(messages),/NPC 日程結案 PATCH/);
    return {text:resultQuote+'<BAO_STATE>'+JSON.stringify({npc_timeline:{resolve:[{id:'nt-1',quote:resultQuote}]}})+'</BAO_STATE>'};
  }};
  h.load('same-model-state-merge');
  c.Chat.messages.push({id:'u2',role:'user',content:'妳決定了嗎？'});
  const response=await c.API.send(c.App.config.api,[{role:'user',content:'妳決定了嗎？'}]);
  c.Chat.messages.push({id:'a2',role:'assistant',content:response.text});
  await c.WorldStateEngine.update(c.App.config,'妳決定了嗎？',response.text);
  assert.equal(calls,1);assert.equal(h.core.snapshot('npc-1').schedules[0].status,'resolved');
  assert.equal(h.core.snapshot('npc-1').schedules[0].resolution.quote,resultQuote);
  // Actual separate-helper batching keeps one configured helper request.
  const separate=harness(true), sc=separate.ctx;
  separate.core.schedule({npcId:'npc-1',text:'是否赴約',inMinutes:1});
  sc.GameState.applyUpdate({world_clock:{advance_minutes:1}});
  sc.Chat.messages.push({id:'sep-user',role:'user',content:'妳決定了嗎？'},{id:'sep-ai',role:'assistant',content:resultQuote});
  sc.App.config.cost={stateApiMode:'separate',stateInterval:1,stateApi:{model:'tracker',baseUrl:'https://helper.test',key:'test'}};
  let helperCalls=0;
  sc.API={wrapSend(id,fn){const next=this.send.bind(this);this.send=(...args)=>fn(next,...args);},async send(config,messages){
    helperCalls++;assert.equal(config.model,'tracker');assert.equal(config.__stateTask,true);
    assert.match(JSON.stringify(messages),/NPC 日程結案 PATCH/);
    return {text:JSON.stringify({npc_timeline:{resolve:[{id:'nt-1',quote:resultQuote}]}})};
  }};
  separate.load('world-state-cost');separate.load('same-model-state-merge');
  await sc.WorldStateEngine.update(sc.App.config,'妳決定了嗎？',resultQuote);
  assert.equal(helperCalls,1);assert.equal(separate.core.snapshot('npc-1').schedules[0].status,'resolved');
  console.log('PASS sourced NPC decisions, fabricated/player/stale evidence rejection, rewind/reopen, cast isolation and one-call merged and configured separate-helper settlement');
})().catch(error=>{console.error(error);process.exitCode=1;});
