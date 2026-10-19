'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let calls=0;
const state={npcs:[{npc_id:'a',name:'艾琳',aliases:['阿琳'],presence:'away'}],worldClock:{tickMinutes:0},canon:{notebooks:[{id:'private',title:'角色筆記',tier:'core',category:'current',knowledge_scope:'actors',known_by:['艾琳'],content:'CANON_PRIVATE'}]},worldbookLibrary:{version:1,enabled:['alias-pack'],installed:[{schema:'yorubay-worldbook-pack',version:1,meta:{id:'alias-pack',name:'Alias Pack',world:'general'},entries:[
 {id:'private',mode:'constant',content:'LORE_PRIVATE',knowledge_scope:'actors',known_by:['阿琳']},
 {id:'public',mode:'constant',content:'LORE_SHARED'}]}],pinned:{}}};
const ctx={console,structuredClone,Date,API:{send(){calls++;throw Error('unexpected model');}},
 App:{activeCharacter:{name:'阿琳'},config:{narrativeMode:'immersive',memory:{mode:'smart'}},saveStory(){},
  buildSystemPrompt(){return'BASE';},
  async buildMessages(){return[{role:'system',content:this.buildSystemPrompt()},{role:'user',content:'戒指'}];},
  wrapBuildMessages(id,fn){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>fn.call(this,next,...args);},
  wrapBuildSystemPrompt(id,fn){const next=this.buildSystemPrompt.bind(this);this.buildSystemPrompt=(...args)=>fn.call(this,next,...args);}},
 Chat:{messages:[{id:'a1',role:'assistant',content:'阿琳看過戒指。'},{id:'u1',role:'user',content:'戒指'}]},
 GameState:{current:state,applyUpdate(patch){if(patch.world_clock)this.current.worldClock.tickMinutes+=patch.world_clock.advance_minutes;}},
 document:{head:{appendChild(){}},createElement(){return{};},querySelector(){return null;},querySelectorAll(){return[];},body:{}},MutationObserver:class{observe(){}},
 fetch(){throw Error('owned pack must not fetch');}};
ctx.window=ctx;vm.createContext(ctx);
const load=name=>vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),ctx,{filename:name});
for(const name of ['episodic-memory-core','canon-workbench','npc-timeline','worldbook-library-core','worldbook-library','episodic-memory'])load(name);
ctx.BAOEpisodicMemory.ingest(state,{episodes:[{text:'戒指事件',evidenceIds:['a1'],knowledge:[{actor:'阿琳',mode:'witnessed',claim:'EPISODE_PRIVATE 戒指',evidenceIds:['a1']}]}]},[ctx.Chat.messages[0]]);
ctx.BAONPCTimeline.schedule({npcId:'a',text:'TIMELINE_PRIVATE',inMinutes:1,kind:'routine'});
ctx.GameState.applyUpdate({world_clock:{advance_minutes:1}});
const output=async()=>JSON.stringify(await ctx.App.buildMessages(ctx.App.config));
(async()=>{
 const before=JSON.stringify(state);
 let text=await output();for(const marker of ['CANON_PRIVATE','LORE_PRIVATE','EPISODE_PRIVATE','TIMELINE_PRIVATE','LORE_SHARED'])assert.ok(text.includes(marker),marker+' alias path');
 assert.equal(JSON.stringify(state),before,'all source gates are read-only');
 state.npcs.push({npc_id:'b',name:'小夏',aliases:['阿琳'],presence:'away'});
 text=await output();assert.doesNotMatch(text,/CANON_PRIVATE|LORE_PRIVATE|EPISODE_PRIVATE|TIMELINE_PRIVATE/);assert.match(text,/LORE_SHARED/);
 ctx.App.activeCharacter.name='艾琳';state.npcs[1].presence='present';
 text=await output();assert.doesNotMatch(text,/CANON_PRIVATE|LORE_PRIVATE|EPISODE_PRIVATE|TIMELINE_PRIVATE/,'shared request must not drop the other speaker');
 state.npcs.pop();ctx.App.activeCharacter.name='阿琳';
 const owner=ctx.GameState.current;ctx.GameState.current={npcs:[],worldClock:{tickMinutes:1}};
 text=await output();assert.doesNotMatch(text,/CANON_PRIVATE|LORE_PRIVATE|EPISODE_PRIVATE|TIMELINE_PRIVATE/,'separate state cannot reuse registry or private records');
 ctx.GameState.current=owner;
 text=await output();assert.match(text,/EPISODE_PRIVATE/,'switching back resolves current registry again');
 assert.equal(calls,0);
 console.log('PASS actual Canon, worldbook runtime, event wrapper and timeline alias gates; collision, mixed cast, state isolation, no calls');
})().catch(error=>{console.error(error);process.exitCode=1;});
