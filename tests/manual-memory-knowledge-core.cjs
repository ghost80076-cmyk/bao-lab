'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const disk=new Map();
const ctx={console,structuredClone,addEventListener(){},setTimeout(){return 1;},clearTimeout(){},
 localStorage:{getItem:k=>disk.get(k)||null,setItem:(k,v)=>disk.set(k,v)},
 document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[];},querySelector(){return null;},getElementById(){return null;},createElement(){return{};},head:{appendChild(){}}},
 Storage:{clone:structuredClone,scrubSecrets:structuredClone},GameState:{current:{npcs:[]}},API:{isOpenRouter(){return false;},async send(){throw Error('no provider calls');}}};
ctx.window=ctx;vm.createContext(ctx);
const load=n=>vm.runInContext(fs.readFileSync(process.env.MANUAL_MEMORY_SOURCE_DIR&&['memory-workbench-core','player-settings','story-tools','memory-workbench-ai'].includes(n)?process.env.MANUAL_MEMORY_SOURCE_DIR+'/'+n+'.js':'js/'+n+'.js','utf8'),ctx,{filename:n});
load('helper-data');load('chat');load('app');vm.runInContext('window.App=App;window.Chat=Chat;',ctx);
ctx.App.buildSystemPrompt=()=> 'BASE';ctx.App.renderChatShell=()=>{};ctx.App.saveStory=()=>true;
ctx.App.config={narrativeMode:'immersive',api:{model:'mock'},memory:{mode:'rounds',maxRounds:4},persona:{name:'玩家'}};
ctx.App.activeCharacter={id:'test',name:'艾琳'};
load('episodic-memory-core');load('player-settings');load('memory-workbench-core');load('story-tools');load('prompt-cache');
const notes=[{id:'legacy',title:'舊筆記',text:'城門開啟。',enabled:true},
 {id:'private',title:'密函',text:'港口暗號4721。\n\n【固定 Schema】\n不可外洩的密函。',enabled:true,knowledge_scope:'actors',known_by:['琳'],extra:{source:'manual'}},
 {id:'unknown',title:'未指定',text:'未知秘密8899',enabled:true,knowledge_scope:'actors',known_by:[]},
 {id:'bad',title:'壞範圍',text:'無效秘密5577',enabled:true,knowledge_scope:'broken',known_by:['艾琳']},
 {id:'off',title:'停用',text:'停用秘密1122',enabled:false}];
const state=ctx.GameState.current;
state.npcs=[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}];state.memorySlots=structuredClone(notes);
const request=async()=>JSON.stringify(await ctx.App.buildMessages());
(async()=>{
 const original=JSON.stringify(state.memorySlots);
 const audience=state.memorySlots[1].known_by;state.memorySlots[1].known_by=['琳',...Array.from({length:30},(_,i)=>'角色'+i)];
 assert.doesNotMatch(await request(),/港口暗號4721/,'over-limit allowlist fails closed instead of partial truncation');state.memorySlots[1].known_by=audience;
 let prompt=await request();assert.match(prompt,/港口暗號4721/);assert.match(prompt,/城門開啟/);
 assert.doesNotMatch(prompt,/未知秘密8899|無效秘密5577|停用秘密1122/);
 assert.match(prompt,/背景不代表每位角色都已知情/);
 state.npcs.push({name:'守衛',presence:'present'});
 prompt=await request();assert.doesNotMatch(prompt,/港口暗號4721|不可外洩的密函/,'whole note denied even with embedded header');
 assert.match(prompt,/城門開啟/);
 assert.doesNotMatch(JSON.stringify(ctx.BAOStoryTools.preview().sections['手動記憶']),/港口暗號4721/,'context preview uses the same selection');
 state.npcs.at(-1).presence='away';assert.match(await request(),/港口暗號4721/);
 state.npcs.push({npc_id:'b',name:'另一人',aliases:['琳'],presence:'away'});
 assert.doesNotMatch(await request(),/港口暗號4721/,'ambiguous knowledge alias does not grant access');state.npcs.pop();
 ctx.App.config.narrativeMode='world';assert.doesNotMatch(await request(),/港口暗號4721/,'world title does not become speaker');
 state.npcs[0].presence='present';assert.match(await request(),/港口暗號4721/);
 state.npcs=Array.from({length:31},(_,i)=>({name:i?'訪客'+i:'艾琳',presence:'present'}));assert.doesNotMatch(await request(),/港口暗號4721/);
 state.npcs=[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}];ctx.App.config.narrativeMode='immersive';
 assert.equal(JSON.stringify(state.memorySlots),original,'selection never rewrites saved notes');
 const snapshot=JSON.parse(JSON.stringify(state));ctx.GameState.current=snapshot;assert.match(await request(),/港口暗號4721/,'portable reload retains scope');
 const gate=ctx.BAOEpisodicMemory;ctx.BAOEpisodicMemory=undefined;assert.doesNotMatch(await request(),/港口暗號4721/,'mixed cache fails closed without resolver');ctx.BAOEpisodicMemory=gate;
 const selector=ctx.BAOMemoryWorkbench.promptSlots;delete ctx.BAOMemoryWorkbench.promptSlots;
 assert.doesNotMatch(await request(),/港口暗號4721/,'old workbench fallback cannot leak scoped notes');ctx.BAOMemoryWorkbench.promptSlots=selector;
 disk.set('bao-lab:player-memory-slots',JSON.stringify(notes));ctx.GameState.current=null;
 assert.doesNotMatch(await request(),/港口暗號4721/,'private browser preference is not a current story');
 // Exercise the actual AI write handler, including replacing a scoped target.
 ctx.GameState.current=structuredClone(snapshot);ctx.GameState.current.memoryRefineDraft='AI 整理的新筆記。';
 const controls=new Map(),control=k=>{if(!controls.has(k))controls.set(k,{value:'',textContent:'',addEventListener(type,fn){this[type]=fn;}});return controls.get(k);};
 const area={innerHTML:'',querySelector:control,querySelectorAll(){return[];}};
 const refresh=ctx.BAOMemoryWorkbench.refresh;ctx.BAOMemoryWorkbench.refresh=()=>{};
 load('memory-workbench-ai');ctx.BAOMemoryAI.mount({querySelector:()=>area},ctx.BAOMemoryWorkbench.readSlots());
 control('[data-refine-target]').value='private';control('[data-write-draft]').click();
 let target=ctx.GameState.current.memorySlots.find(s=>s.id==='private');
 assert.equal(target.text,'AI 整理的新筆記。');assert.equal(target.knowledge_scope,'actors');assert.equal(target.known_by[0],'琳');assert.equal(target.extra.source,'manual');
 control('[data-refine-target]').value='__new';control('[data-write-draft]').click();
 target=ctx.GameState.current.memorySlots.at(-1);assert.equal(target.knowledge_scope,'actors');assert.equal(target.known_by.length,0,'AI free text does not invent an audience');
 const nextStory={memorySlots:structuredClone(notes),memoryRefineDraft:'另一個故事的草稿'};
 ctx.GameState.current=nextStory;const before=JSON.stringify(nextStory);control('[data-write-draft]').click();assert.equal(JSON.stringify(nextStory),before,'old editor cannot write into new story');
 assert.match(control('[data-refine-status]').textContent,/故事已切換/);ctx.BAOMemoryWorkbench.refresh=refresh;
 console.log('PASS actual manual-note prompt scope, aliases/mixed cast/world/overflow, reload/fallback and AI overwrite/new/stale-write ownership');
})().catch(e=>{console.error(e);process.exitCode=1;});
