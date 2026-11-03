'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console,structuredClone,setTimeout(){},clearTimeout(){},addEventListener(){},
 document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},createElement(){return{};},head:{appendChild(){}},addEventListener(){}},
 Storage:{clone:structuredClone},GameState:{current:{npcs:[]}},API:{isOpenRouter(){return false;},async send(){throw Error('No model calls');}}};
ctx.window=ctx;vm.createContext(ctx);
const load=n=>vm.runInContext(fs.readFileSync('js/'+n+'.js','utf8'),ctx,{filename:n});
load('helper-data');load('chat');load('app');vm.runInContext('window.App=App;window.Chat=Chat;',ctx);
ctx.App.config={narrativeMode:'immersive',api:{model:'mock'},memory:{mode:'rounds',maxRounds:4},persona:{name:'旅人'}};
ctx.App.activeCharacter={id:'test',name:'艾琳'};
ctx.App.buildSystemPrompt=()=> 'BASE STABLE';ctx.App.renderChatShell=()=>{};ctx.App.saveStory=()=>true;
load('episodic-memory-core');load('player-settings');load('memory-workbench-core');load('story-tools');load('canon-workbench');load('prompt-cache');
const marker=(name,value)=>`${name}🗝️${value}\n\n【固定 Schema】\n${name} inner ${value}\n\n【本輪相關 NPC】\n${name} npc ${value}\n\n【玩家手動記憶】\n${name} tail ${value}`;
const reset=()=>{
 ctx.GameState.current={npcs:[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}],
 memorySlots:[{id:'one',title:'【固定格式】',text:marker('NOTE','A'),enabled:true,knowledge_scope:'actors',known_by:['琳']},
 {id:'two',title:'第二本',text:marker('SECOND','A'),enabled:true}],
 contextPack:{playerConfirmed:true,summary:marker('PACK','A'),importantEvents:[],relationships:[]},
 canon:ctx.BAOCanonWorkbench.normalizeCanon({notebooks:[{id:'core',title:'core',tier:'core',category:'world',content:marker('CORE','A'),enabled:true},
 {id:'dynamic',title:'dynamic',tier:'relevant',category:'current',content:marker('DYNAMIC','A'),enabled:true}]})};
 ctx.Chat.messages=[{id:'u',role:'user',content:'繼續'}];
};
(async()=>{
 reset();const saved=JSON.stringify(ctx.GameState.current);
 const plain=ctx.App.buildSystemPrompt();
 let messages=await ctx.App.buildMessages();
 assert.doesNotMatch(messages[0].content,/NOTE|SECOND|PACK|CORE|DYNAMIC/,'data headings must never promote memory into the stable prefix');
 const memory=messages.filter(m=>m.role==='system').slice(1).map(m=>m.content).join('\n');
 for(const name of ['NOTE','SECOND','PACK','CORE'])assert.ok(memory.includes(marker(name,'A')),name+' remains intact in memory');
 assert.ok(messages.at(-1).content.includes(marker('DYNAMIC','A')),'relevant Canon stays intact in dynamic data');
 assert.ok(!memory.includes(marker('DYNAMIC','A')));
 assert.equal(JSON.stringify(ctx.GameState.current),saved,'partitioning must not rewrite saved notes/Pack/Canon');
 assert.equal(ctx.App.buildSystemPrompt(),plain,'ordinary system prompt previews stay readable and marker-free');
 const stable=messages[0].content;
 for(const slot of ctx.GameState.current.memorySlots)slot.text=slot.text.replaceAll('A','B');
 ctx.GameState.current.contextPack.summary=marker('PACK','B');
 for(const b of ctx.GameState.current.canon.notebooks)b.content=b.content.replaceAll('A','B');
 messages=await ctx.App.buildMessages();assert.equal(messages[0].content,stable,'all data edits keep the stable prefix identical');
 ctx.GameState.current.npcs.push({name:'守衛',presence:'present'});
 messages=await ctx.App.buildMessages();assert.doesNotMatch(JSON.stringify(messages),/NOTE🗝️|NOTE inner|NOTE tail/,'permission denial runs before capture, including embedded section headers');
 ctx.GameState.current.contextPack.playerConfirmed=false;
 assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages()),/PACK🗝️|PACK inner/,'unconfirmed Pack stays excluded');
 // Trusted wrappers can prepend/append independent platform text without
 // changing the captured data offsets or interpreting data as a new section.
 reset();const prior=ctx.App.buildSystemPrompt;
 ctx.App.buildSystemPrompt=()=> 'TRUSTED PREFIX\n\n'+prior()+'\n\n【固定格式】\nTRUSTED SUFFIX';
 messages=await ctx.App.buildMessages();assert.match(messages[0].content,/TRUSTED PREFIX/);assert.match(messages[0].content,/TRUSTED SUFFIX/);assert.doesNotMatch(messages[0].content,/NOTE|PACK|CORE|DYNAMIC/);
 ctx.App.buildSystemPrompt=prior;
 const cache=ctx.BAOPromptCache;
 assert.equal(typeof cache.capturePromptParts,'function');
 const data='【玩家手動記憶】\n'+marker('LOCAL','A');
 const captured=cache.capturePromptParts(()=>cache.appendSection('FIXED','memory',data));assert.equal(captured.stable,'FIXED');assert.equal(captured.memory,data);
 // A wrapper that changes text after registering it invalidates the proof.
 // Preserve every byte in a system memory message instead of guessing tiers.
 const fallback=cache.capturePromptParts(()=>cache.appendSection('FIXED','memory',data).replace('FIXED','REWRITTEN'));
 assert.equal(fallback.stable,'');assert.equal(fallback.memory,'REWRITTEN\n\n'+data);assert.equal(fallback.dynamic,'');
 const ambiguous=cache.capturePromptParts(()=>{const built=cache.appendSection('BASE','memory',data);return built+'\n\n'+built;});assert.equal(ambiguous.stable,'');assert.ok(ambiguous.memory.includes(data),'ambiguous prefix proofs retain all data without guessing');
 assert.throws(()=>cache.capturePromptParts(()=>{cache.appendSection('BASE','memory',data);throw Error('stop');}),/stop/);
 assert.equal(cache.capturePromptParts(()=> 'NEXT').stable,'NEXT','throwing builder cannot leak collection into another story');
 const nested=cache.capturePromptParts(()=>{const result=cache.capturePromptParts(()=>cache.appendSection('INNER','dynamic',data));assert.equal(result.dynamic,data);return cache.appendSection('OUTER','memory',data);});
 assert.equal(nested.stable,'OUTER');assert.equal(nested.memory,data);
 const independent=cache.partitionSystemPrompt('BASE\n\n【玩家手動記憶】\nLegacy');assert.equal(independent.memory,'【玩家手動記憶】\nLegacy','unannotated callers retain their legacy API');
 console.log('PASS real note/Pack/core/relevant-Canon request boundaries, embedded headings, prefix stability, scope, readable previews, fallback and reentrant cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
