'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const clone=v=>JSON.parse(JSON.stringify(v));
const ctx={console:{...console,warn(){}},structuredClone,addEventListener(){},setTimeout(){},document:{getElementById(){return null;}}};
ctx.window=ctx;vm.createContext(ctx);
const load=n=>vm.runInContext(fs.readFileSync('js/'+n+'.js','utf8'),ctx,{filename:n});
load('helper-data');load('episodic-memory-core');load('chat');vm.runInContext('window.Chat=Chat;',ctx);
const core=ctx.BAOEpisodicMemory;
const messages=[{id:'a',role:'user',content:'在港口，我交給艾琳信封。'},
 {id:'b',role:'assistant',content:'艾琳收下信封並答應在橋邊等你。'},
 {id:'c',role:'user',content:'我問她橋邊的暗號。'},
 {id:'d',role:'assistant',content:'艾琳低聲說，暗號是藍月。'},
 {id:'e',role:'user',content:'我到城門告知守衛。'},
 {id:'f',role:'assistant',content:'守衛得知橋邊的約定。'}];
const scene={text:'未知客觀秘密不能外洩',time:'午夜秘密時刻',entities:['艾琳'],keywords:['橋邊','約定'],evidenceIds:['a','d'],visibility:'restricted',certainty:'confirmed',
 knowledge:[{actor:'艾琳',mode:'witnessed',claim:'艾琳收下信封，答應在橋邊等你；暗號是藍月。',evidenceIds:['b','d']}]};
const state={npcs:[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}]};
core.ingest(state,{scenes:[scene]},messages.slice(0,4),messages);
assert.equal(state.episodicMemory.scenes.length,1);
assert.deepEqual(clone(state.episodicMemory.scenes[0].evidence.map(e=>e.id)),['a','b','c','d'],'expand endpoints to all signed scene messages');
const id=state.episodicMemory.scenes[0].id;
const recall=(over={})=>clone(core.recall({state,messages,input:'橋邊約定',actors:['琳'],hybrid:true,...over}));
assert.equal(recall().length,1);assert.match(recall()[0].block,/場景摘要｜角色認知/);
assert.match(recall()[0].block,/來源：b、d/,'private scene cites knowledge evidence');
assert.doesNotMatch(recall()[0].block,/未知客觀秘密|午夜秘密時刻/);
assert.equal(recall({hybrid:false}).length,0,'legacy/default mode never includes scenes');
assert.equal(recall({actors:['守衛']}).length,0);assert.equal(recall({actors:['琳','守衛']}).length,0);
assert.equal(recall({actors:[]}).length,0);assert.equal(recall({input:'金融利率'}).length,0);
assert.equal(recall({exclude:scene.knowledge[0].claim}).length,0);
assert.equal(recall({maxChars:20}).length,0);
for(const changed of [messages.map(m=>m.id==='c'?{...m,content:'改寫中間訊息'}:m),messages.filter(m=>m.id!=='c'),[...messages,{...messages[0]}],[messages[0],messages[2],messages[1],...messages.slice(3)]])
 assert.equal(recall({messages:changed}).length,0,'rewritten, missing, duplicate or reordered scene evidence must fail');
const before=JSON.stringify(state);recall();assert.equal(JSON.stringify(state),before,'recall does not mutate saved state');
assert.equal(recall({state:clone(state)}).length,1,'portable JSON retains scenes and permissions');
const snapshot=clone(state);
core.ingest(state,{knowledgeUpdates:[{eventId:id,actor:'守衛',mode:'told',claim:scene.knowledge[0].claim,evidenceIds:['f']}]},messages.slice(4),messages);
assert.equal(recall({actors:['艾琳','守衛']}).length,1,'later evidenced common knowledge can unlock scene');
assert.equal(recall({actors:['艾琳','守衛'],messages:messages.slice(0,4)}).length,0,'rewinding removes later observer evidence');
assert.equal(snapshot.episodicMemory.scenes[0].knowledge.length,1,'updates cannot mutate an older snapshot');
core.ingest(state,{scenes:[scene]},messages.slice(0,4),messages);
assert.equal(state.episodicMemory.scenes[0].knowledge.length,2,'replay retains later observations');
const bad=[{...scene,evidenceIds:['a']},{...scene,evidenceIds:['b','d']},{...scene,evidenceIds:['a','c']},{...scene,evidenceIds:['a','missing']},
 {...scene,evidenceIds:['a','d',...Array(24).fill('a')]}];
for(const item of bad){const s={};core.ingest(s,{scenes:[item]},messages.slice(0,4),messages);assert.equal(s.episodicMemory.scenes.length,0);}
const split={};core.ingest(split,{scenes:[scene]},[messages[0],messages[3]],messages);assert.equal(split.episodicMemory.scenes.length,0,'non-contiguous maintenance chunks cannot fabricate a scene');
// A later objective correction may target a scene, without erasing old beliefs.
const publicState={};core.ingest(publicState,{scenes:[{...scene,text:'橋邊鐘聲代表關門',visibility:'public',knowledge:[]}]},messages.slice(0,4),messages);
const publicId=publicState.episodicMemory.scenes[0].id;
core.ingest(publicState,{episodes:[{text:'橋邊鐘聲並非關門',visibility:'public',certainty:'confirmed',evidenceIds:['f'],supersedes:[publicId]}]},messages.slice(4),messages);
const corrected=recall({state:publicState,actors:[]});assert.equal(corrected.length,1);assert.match(corrected[0].block,/並非關門/);assert.doesNotMatch(corrected[0].block,/場景摘要/);
assert.equal(recall({state:publicState,actors:[],messages:messages.slice(0,4)})[0].id,publicId,'branch without correction retains earlier public scene');
// Full-text list should beat a higher tag-only hit. Exact-text duplicates share
// one budget slot; private objective text never participates in full-text scoring.
const ranked={};core.ingest(ranked,{episodes:[{text:'下雨了',keywords:['bridge','promise'],visibility:'public',certainty:'confirmed',evidenceIds:['a']},
 {text:'bridge promise',keywords:[],visibility:'public',certainty:'confirmed',evidenceIds:['b']}]},messages,messages);
assert.equal(recall({state:ranked,input:'bridge promise',actors:[]})[0].block.includes('公開事實：bridge promise'),true);
const duplicate={npcs:clone(state.npcs)};core.ingest(duplicate,{episodes:[{...scene,evidenceIds:['a']}],scenes:[scene]},messages.slice(0,4),messages);
assert.equal(recall({state:duplicate}).length,1,'same visible content in event and scene is sent once');
const bounded={};for(let i=0;i<8;i++)core.ingest(bounded,{scenes:[{...scene,text:'橋邊'+i,visibility:'public',knowledge:[]}]},messages.slice(0,4),messages);
const limited=recall({state:bounded});assert.equal(limited.length,4);assert.ok(limited.reduce((n,e)=>n+e.block.length,0)<=2400);
const context=core.updateContext(state,messages,true);assert.ok(context.some(e=>e.id===id));assert.ok(!core.updateContext(state,messages,false).some(e=>e.id===id));
// Actual automatic-summary request, persistence and prompt injection, with zero
// retrieval calls and exactly the original one summary request per source batch.
const config={narrativeMode:'immersive',api:{key:'mock',model:'mock'},memory:{mode:'smart',maxRounds:4,summaryInterval:4,hybridRecall:true}};
ctx.GameState={current:{npcs:clone(state.npcs)}};
ctx.App={config,activeCharacter:{name:'艾琳'},baseBuild:async()=>[{role:'system',content:'STABLE'},{role:'system',content:'MEMORY'},{role:'user',content:'橋邊約定'}],
 wrapBuildMessages(name,wrapper){this.buildMessages=(...args)=>wrapper.call(this,this.baseBuild,...args);}};
ctx.Chat.renderGuard=()=>{};
const history=()=>[...clone(messages.slice(0,4)),...Array.from({length:12},(_,i)=>({id:'filler'+i,role:i%2?'assistant':'user',content:'日常'}))];
let calls=0;
ctx.API={async send(api,request){calls++;assert.ok(api.__responseSchema.properties.scenes);assert.match(JSON.stringify(request),/場景起點與終點/);return{text:JSON.stringify({events:['約定'],scenes:[scene]})};}};
(async()=>{
 ctx.Chat.messages=history();await ctx.Chat.afterTurn(config);assert.equal(calls,1);assert.equal(ctx.GameState.current.episodicMemory.scenes.length,1);
 ctx.Chat.add('user','橋邊約定');load('episodic-memory');
 const output=await ctx.App.buildMessages(config);assert.equal(output[0].content,'STABLE');assert.equal(output[1].content,'MEMORY');assert.match(output.at(-1).content,/場景摘要/);assert.equal(calls,1);
 for(const memory of [{...config.memory,hybridRecall:false},{...config.memory,episodicRecall:false},{...config.memory,mode:'full'}])assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages({...config,memory})),/場景摘要/);
 const saved=clone(ctx.GameState.current);ctx.GameState.current={};assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages(config)),/場景摘要/);ctx.GameState.current=saved;
 // Failed, repaired, stale and blocked results must never build scene memories.
 for(const mode of ['failed','stale','settings','blocked']){
  ctx.Chat.reset();ctx.Chat.messages=history();ctx.GameState.current={};ctx.App.config=config;
  ctx.API.send=async()=>{calls++;if(mode==='failed')throw Error('provider failed');if(mode==='stale')ctx.GameState.current={};if(mode==='settings')config.memory.hybridRecall=false;
   return{text:JSON.stringify({events:['約定'],scenes:[scene]}),...(mode==='blocked'?{finishReason:'SAFETY'}:{})};};
  await ctx.Chat.afterTurn(config);assert.equal(ctx.GameState.current.episodicMemory,undefined,mode+' must not index');config.memory.hybridRecall=true;
 }
 ctx.Chat.reset();ctx.Chat.messages=history();ctx.GameState.current={};config.memory.hybridRecall=false;
 ctx.API.send=async(api,request)=>{assert.equal(api.__responseSchema.properties.scenes,undefined);assert.doesNotMatch(JSON.stringify(request),/場景起點與終點/);return{text:JSON.stringify({events:['約定'],scenes:[scene]})};};
 await ctx.Chat.afterTurn(config);assert.equal(ctx.GameState.current.episodicMemory?.scenes,undefined,'off mode ignores unsolicited scene output');
 console.log('PASS P3 scene spans, provenance, current audience, branch/reload/correction, mixed ranking, actual request schema, zero retrieval calls and stale/failed/blocked guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
