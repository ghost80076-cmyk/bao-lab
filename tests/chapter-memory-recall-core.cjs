'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const chapters=require('../js/chapter-memory-core.js');
const recall=require('../js/chapter-memory-recall-core.js');
const context={console};context.window=context;vm.createContext(context);
vm.runInContext(fs.readFileSync('js/episodic-memory-core.js','utf8'),context);
const resolver=context.BAOEpisodicMemory;
const story=turns=>{
 const out=[{id:'opening',role:'assistant',content:'故事開場'}];
 for(let i=1;i<=turns;i++)out.push(
  {id:'player-'+i,role:'user',content:'第'+i+'輪：旅人調查港口的舊信。'},
  {id:'reply-'+i,role:'assistant',content:'第'+i+'輪：艾琳依所知回答，秘密仍受保護。'});
 out.push({id:'latest-query',role:'user',content:'你還記得港口舊信的秘密嗎？'});
 return out;
};
const config={narrativeMode:'immersive',memory:{mode:'smart',maxContext:32000,episodicRecall:true}};
function fixture(turns=100){
 const messages=story(turns);
 const draft=chapters.createDraft({messages,start:1,end:41,
  text:'在港口，艾琳曾向旅人透露舊信的線索；守衛並沒有得知保密暗號。',
  keywords:['港口','舊信','秘密']});
 const state={npcs:[{npc_id:'erin',name:'艾琳',aliases:['琳'],presence:'present'},
  {npc_id:'guard',name:'守衛',presence:'away'}],
  chapterMemory:{version:1,chapters:[]},
  chapterMemorySettings:{version:1,recallEnabled:true}};
 state.chapterMemory=chapters.upsert(state.chapterMemory,chapters.approve(draft,{
  messages,knowledge_scope:'actors',known_by:['艾琳'],state,resolver}),messages);
 const chat={messages,summary:'之前調查過港口的信。',summarizedUntil:Math.floor(turns*1.5),
  contextGuard:{rawStart:Math.floor(turns*.9)},lastStoryPromptTokens:900};
 const base=[{role:'system',content:'既有固定角色與世界規則，始終不變。'},
  {role:'system',content:'【長期記憶摘要】之前曾在港口有過約定。'},
  {role:'user',content:'【玩家最新輸入】你還記得港口舊信的秘密嗎？'}];
 return {state,chat,base};
}
const plan=(f,overrides={})=>recall.plan({
 state:f.state,config,request:{},chat:f.chat,primary:'艾琳',
 baseMessages:f.base,resolver,chapterCore:chapters,...overrides
});
for(const rounds of [100,500,1000]){
 const f=fixture(rounds);
 const decision=plan(f);
 assert.equal(decision.reason,'selected',rounds+' turns should selectively retrieve old source');
 assert.equal(decision.selected.length,1);
 assert.ok(decision.addedTokensEstimate>0&&decision.addedTokensEstimate<=recall.MAX_EXTRA_TOKENS_ESTIMATE);
 const before=JSON.stringify(f.base);
 const injected=recall.inject(f.base,decision);
 assert.equal(f.base[0].content,injected[0].content,'stable prefix remains unchanged');
 assert.equal(f.base[1].content,injected[1].content,'existing memory remains unchanged');
 assert.ok(injected.at(-1).content.includes('【選用章節回憶'));
 assert.ok(injected.at(-1).content.endsWith(f.base.at(-1).content),'actual player input remains unedited');
 assert.equal(JSON.stringify(f.base),before,'no mutation of baseline prompt');
 assert.equal(injected.length,f.base.length,'no new messages or extra calls');
 assert.ok(injected.at(-1).content.length-f.base.at(-1).content.length<=2000);
 assert.equal(plan(f,{config:{...config,memory:{...config.memory,mode:'full'}}}).reason,'memory-mode');
 f.state.chapterMemorySettings.recallEnabled=false;
 assert.equal(plan(f).reason,'disabled','per-story default off');
 f.state.chapterMemorySettings.recallEnabled=true;
 assert.equal(plan(f,{request:{contextMessages:[]}}).reason,'revision-source');
 assert.equal(plan(f,{request:{sourceMessages:[]}}).reason,'revision-source');
 f.chat.contextGuard.rawStart=20;
 assert.equal(plan(f).reason,'no-older-chapter','never duplicate currently-present original turns');
 f.chat.contextGuard.rawStart=Math.floor(rounds*.9);
 f.chat.lastStoryPromptTokens=30000;
 assert.equal(plan(f).reason,'context-pressure','never inject under context pressure');
 f.chat.lastStoryPromptTokens=900;
 const edited=story(rounds);edited[13].content+='重要原文已更動';
 f.chat.messages=edited;
 assert.equal(plan(f).reason,'no-safe-match','edited source must never recall a stale chapter');
}
const mixed=fixture();
mixed.state.npcs[1].presence='present';
assert.equal(plan(mixed).reason,'no-safe-match','private chapter must not be visible to an unapproved mixed cast');
const unknown=fixture();
assert.equal(plan(unknown,{resolver:null}).reason,'dependencies','missing actor-scope resolver must fail closed');
const visible=fixture();
visible.base[1].content+=visible.state.chapterMemory.chapters[0].text;
assert.equal(plan(visible).reason,'already-visible','do not duplicate verbatim current memory');
const closed=fixture();
closed.state.chapterMemorySettings=undefined;
assert.equal(plan(closed).reason,'disabled','no field in a legacy story is OFF');
const noQuery=fixture();
noQuery.chat.messages.at(-1).content='今天的天氣';
assert.equal(plan(noQuery).reason,'no-safe-match','no relevant keyword means no extra tokens');
console.log('PASS optional chapter recall: 100/500/1000-turn selection, budget cap, default-off, real NPC permissions, stale source, raw overlap, revision isolation, no provider calls');
