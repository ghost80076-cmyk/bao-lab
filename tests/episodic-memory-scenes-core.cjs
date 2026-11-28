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
assert.equal(recall({input:'未知客觀秘密'}).length,0,'private objective text cannot trigger retrieval');
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
const ranked={};core.ingest(ranked,{episodes:[{text:'下雨了',keywords:['bridge','promise','river'],visibility:'public',certainty:'confirmed',evidenceIds:['a']},
 {text:'bridge promise',keywords:[],visibility:'public',certainty:'confirmed',evidenceIds:['b']}]},messages,messages);
assert.match(recall({state:ranked,input:'bridge promise river',actors:[],hybrid:false})[0].block,/公開事實：下雨了/,'legacy tag-only match ranks first');
assert.match(recall({state:ranked,input:'bridge promise river',actors:[]})[0].block,/公開事實：bridge promise/,'visible full-text can outrank a stronger tag-only match');
// Context only breaks ties among already relevant and authorized claims.
const keysState={};
const keyMessages=['碼頭倉庫','城門警衛','山頂旅館','廣場商店','河邊小屋'].map((place,i)=>({id:'key'+i,role:'assistant',content:place+'的鑰匙由管理員保管。'}));
for(const m of keyMessages)core.ingest(keysState,{episodes:[{text:m.content,visibility:'public',certainty:'confirmed',evidenceIds:[m.id]}]},[m],keyMessages);
const keyHistory=[...keyMessages,{id:'prior-key',role:'user',content:'碼頭倉庫在哪裡？'},{id:'reply-key',role:'assistant',content:'你可以繼續詢問。'},{id:'next-key',role:'user',content:'那把鑰匙呢？'}];
const keyRecall=(over={})=>clone(core.recall({state:keysState,messages:keyHistory,input:'那把鑰匙呢？',actors:[],hybrid:true,...over}));
assert.equal(keyRecall().length,4);
assert.match(keyRecall()[0].block,/碼頭倉庫/,'explicit adjacent context resolves tied candidates');
assert.match(keyRecall()[0].block,/來源：key0/);
assert.doesNotMatch(keyRecall()[0].block,/在哪裡|繼續詢問/,'context itself is never serialized');
assert.ok(!keyRecall({hybrid:false}).some(x=>x.block.includes('碼頭倉庫')),'default lexical mode unchanged');
const withCurrent=input=>keyHistory.map(m=>m.id==='next-key'?{...m,content:input}:m);
assert.ok(!keyRecall({input:'鑰匙呢？',messages:withCurrent('鑰匙呢？')}).some(x=>x.block.includes('碼頭倉庫')),'no explicit continuation: ordinary ranking');
assert.equal(keyRecall({input:'那件事呢？',messages:withCurrent('那件事呢？')}).length,0,'context alone cannot create candidates');
assert.ok(!keyRecall({messages:keyHistory.map(m=>m.id==='prior-key'?{...m,content:'其他話題'}:m.id==='reply-key'?{...m,content:'碼頭倉庫'}:m)}).some(x=>x.block.includes('碼頭倉庫')),'assistant text cannot steer continuity');
const priorAtLimit='碼頭倉庫'.repeat(45);
const priorOverLimit=priorAtLimit+'字';
assert.equal(priorAtLimit.length,180);
assert.equal(priorOverLimit.length,181);
const withPrior=content=>keyHistory.map(m=>m.id==='prior-key'?{...m,content}:m);
assert.match(keyRecall({messages:withPrior(priorAtLimit)})[0].block,/碼頭倉庫/,'180-code-unit prior context remains eligible');
assert.ok(!keyRecall({messages:withPrior(priorOverLimit)}).some(x=>x.block.includes('碼頭倉庫')),'181-code-unit prior context ignored');
assert.ok(!keyRecall({messages:[...keyHistory.slice(0,-2),{id:'interrupt',role:'user',content:'別的話題'},...keyHistory.slice(-2)]}).some(x=>x.block.includes('碼頭倉庫')),'only immediately preceding player turn');
assert.ok(!keyRecall({messages:[{...keyHistory.at(-3)},...keyHistory]}).some(x=>x.block.includes('碼頭倉庫')),'ambiguous message ID disables continuity');
assert.ok(!keyRecall({messages:keyHistory.filter(m=>m.id!=='key0')}).some(x=>x.block.includes('碼頭倉庫')),'missing source still denies recall');
assert.ok(!keyRecall({exclude:keyMessages[0].content}).some(x=>x.block.includes('碼頭倉庫')),'already supplied memory stays excluded');
const scopedKeys=clone(keysState);
scopedKeys.episodicMemory.events[0].visibility='restricted';
scopedKeys.episodicMemory.events[0].knowledge=[{actor:'艾琳',mode:'witnessed',claim:keyMessages[0].content,evidence:scopedKeys.episodicMemory.events[0].evidence}];
assert.match(keyRecall({state:scopedKeys,actors:['艾琳']})[0].block,/碼頭倉庫/);
assert.ok(!keyRecall({state:scopedKeys,actors:['艾琳','守衛']}).some(x=>x.block.includes('碼頭倉庫')),'context cannot unlock private claims');
const keyBefore=JSON.stringify(keysState);keyRecall();assert.equal(JSON.stringify(keysState),keyBefore);
// P2b: an explicitly registered alias and a scene with visible source
// overlap break ties, without turning the scene's whole span into knowledge.
const focusState={npcs:[{npc_id:'focus-a',name:'艾琳',aliases:['阿琳'],presence:'away'},{npc_id:'focus-c',name:'小雪',presence:'away'}]};
const focusMessages=[{id:'focus-u',role:'user',content:'我詢問艾琳鑰匙的去向。'},
 {id:'focus-seen',role:'assistant',content:'艾琳說，她的鑰匙留在碼頭。'},
 {id:'focus-u2',role:'user',content:'木盒與小雪的鑰匙在哪？'},
 {id:'focus-a',role:'assistant',content:'木盒的鑰匙留在櫃台。小雪的鑰匙留在車站。艾琳的鑰匙仍在碼頭。'},
 ...['城門','旅館','商店','小屋','公園'].map((place,i)=>({id:'focus-d'+i,role:'assistant',content:place+' 鑰匙 留在櫃台'}))];
const focusEpisode=(text,evidenceIds)=>({text,evidenceIds,visibility:'public',certainty:'confirmed'});
core.ingest(focusState,{scenes:[focusEpisode('艾琳 鑰匙 留在碼頭',['focus-u','focus-a'])],
 episodes:[focusEpisode('木盒 鑰匙 留在櫃台',['focus-a']),focusEpisode('小雪 鑰匙 留在車站',['focus-a']),...focusMessages.slice(4).map(m=>focusEpisode(m.content,[m.id]))]},focusMessages,focusMessages);
const focused=(over={})=>clone(core.recall({state:focusState,messages:focusMessages,input:'阿琳 鑰匙',actors:[],hybrid:true,...over}));
const focusedOutput=focused();
assert.equal(focusedOutput.length,4);
assert.match(focusedOutput[0].block,/艾琳 鑰匙 留在碼頭/,'registered alias focuses visible scene');
assert.match(focusedOutput[1].block,/木盒 鑰匙 留在櫃台/,'visible shared evidence ranks associated event');
assert.match(focusedOutput[1].block,/來源：focus-a/);
assert.doesNotMatch(JSON.stringify(focusedOutput),/阿琳/,'alias is search metadata, not newly written story text');
assert.ok(!focusedOutput.some(x=>x.block.includes('小雪')),'another explicitly mentioned actor does not inherit a scene ranking bonus');
assert.ok(!focused({hybrid:false}).some(x=>x.block.includes('木盒')),'ordinary mode retains original ordering');
assert.ok(!focused({input:'鑰匙'}).some(x=>x.block.includes('木盒')),'no explicit actor: original ordering');
assert.equal(focused({input:'阿琳'}).length,0,'name alone cannot introduce candidates');
const collision=clone(focusState);collision.npcs.push({npc_id:'focus-b',name:'小夏',aliases:['阿琳']});
assert.ok(!focused({state:collision}).some(x=>x.block.includes('木盒')),'ambiguous alias cannot steer ranking');
const multiple=clone(focusState);multiple.npcs.push({npc_id:'focus-b',name:'小夏'});
assert.ok(!focused({state:multiple,input:'阿琳 小夏 鑰匙'}).some(x=>x.block.includes('木盒')),'multiple explicitly mentioned identities abstain');
const restrictedFocus=clone(focusState);
const focusScene=restrictedFocus.episodicMemory.scenes[0];
focusScene.visibility='restricted';focusScene.knowledge=[{actor:'艾琳',mode:'witnessed',claim:'艾琳 鑰匙 留在碼頭',evidence:[focusScene.evidence[1]]}];
assert.ok(!focused({state:restrictedFocus}).some(x=>/艾琳 鑰匙|木盒/.test(x.block)),'unreadable scene provides no ranking anchor');
const partialFocus=focused({state:restrictedFocus,actors:['艾琳']});
assert.ok(partialFocus.some(x=>x.block.includes('艾琳 鑰匙')));
assert.ok(!partialFocus.some(x=>x.block.includes('木盒')),'hidden objective scene span cannot link another event');
const rumorFocus=clone(restrictedFocus);
rumorFocus.episodicMemory.scenes[0].knowledge[0].mode='rumor';
rumorFocus.episodicMemory.scenes[0].knowledge[0].evidence=[focusScene.evidence.at(-1)];
assert.ok(!focused({state:rumorFocus,actors:['艾琳']}).some(x=>x.block.includes('木盒')),'rumor scene is not an evidence-link anchor');
assert.ok(!focused({messages:focusMessages.map(m=>m.id==='focus-u'?{...m,content:'改寫場景'}:m)}).some(x=>x.block.includes('木盒')),'invalid scene source removes association');
assert.ok(!focused({exclude:'艾琳 鑰匙 留在碼頭'}).some(x=>x.block.includes('木盒')),'excluded scene cannot boost a linked claim');
const focusBefore=JSON.stringify(focusState);focused();assert.equal(JSON.stringify(focusState),focusBefore);
console.log('PASS P2b registered actor focus and visible scene-source ranking guards');
// P2c: an evidenced later update can preserve an older, equally relevant
// memory against newer clutter. The historical event is not deemed true or
// important merely because its date, tags, or repetition count is large.
const priorityState={};
const oldClaim='碼頭倉庫 鑰匙 留在房內';
const currentClaim='碼頭倉庫 鑰匙 留在櫃台';
const priorityOrigin={id:'priority-origin',role:'assistant',content:oldClaim};
const priorityUpdate={id:'priority-update',role:'assistant',content:currentClaim};
const priorityRecent=['城門警衛','山頂旅館','廣場商店','河邊小屋','北區公園'].map((place,i)=>({id:'priority-recent'+i,role:'assistant',content:place+' 鑰匙 留在櫃台'}));
const priorityHistory=[priorityOrigin,priorityUpdate,...Array.from({length:4000},(_,i)=>({id:'priority-filler'+i,role:i%2?'assistant':'user',content:'日常閒談'})),...priorityRecent];
const privateEpisode=(m)=>({text:m.content,evidenceIds:[m.id],visibility:'restricted',certainty:'confirmed',knowledge:[{actor:'艾琳',mode:'witnessed',claim:m.content,evidenceIds:[m.id]}]});
core.ingest(priorityState,{episodes:[privateEpisode(priorityOrigin)]},[priorityOrigin],priorityHistory);
const priorityId=priorityState.episodicMemory.events[0].id;
core.ingest(priorityState,{knowledgeUpdates:[{eventId:priorityId,actor:'艾琳',mode:'told',claim:currentClaim,evidenceIds:[priorityUpdate.id]}]},[priorityUpdate],priorityHistory);
core.ingest(priorityState,{episodes:priorityRecent.map(privateEpisode)},priorityRecent,priorityHistory);
const priorityRecall=(over={})=>clone(core.recall({state:priorityState,messages:priorityHistory,input:'鑰匙',actors:['艾琳'],hybrid:true,...over}));
assert.equal(priorityRecall().length,4);
assert.equal(priorityRecall()[0].id,priorityId,'a valid old update outranks equally relevant recent clutter');
assert.match(priorityRecall()[0].block,/來源：priority-update/);
assert.doesNotMatch(priorityRecall()[0].block,/房內/,'old claim is not substituted for the latest knowledge');
assert.ok(!priorityRecall({hybrid:false}).some(e=>e.id===priorityId),'default mode remains unchanged');
assert.equal(priorityRecall({input:'不相關的金融利率'}).length,0,'priority cannot introduce an irrelevant event');
assert.equal(priorityRecall({actors:['艾琳','守衛']}).length,0,'priority cannot bypass common knowledge');
assert.ok(!priorityRecall({exclude:currentClaim}).some(e=>e.id===priorityId),'excluded content cannot receive priority');
assert.ok(!priorityRecall({messages:priorityHistory.filter(m=>m.id!==priorityUpdate.id)}).some(e=>e.id===priorityId),'missing update evidence cannot retain priority');
assert.ok(!priorityRecall({messages:priorityHistory.map(m=>m.id===priorityUpdate.id?{...m,content:'改寫來源'}:m)}).some(e=>e.id===priorityId),'edited update loses priority');
const rumorPriority=clone(priorityState);rumorPriority.episodicMemory.events[0].knowledge.at(-1).mode='rumor';
assert.ok(!priorityRecall({state:rumorPriority}).some(e=>e.id===priorityId),'rumor is not a priority signal');
const tagPriority=clone(priorityState);tagPriority.episodicMemory.events[0].keywords=['鑰匙'];tagPriority.episodicMemory.events[0].knowledge.at(-1).claim='只是一般通知';
assert.ok(!priorityRecall({state:tagPriority}).some(e=>e.id===priorityId),'tag-only evidence does not gain priority');
const publicPriority={};
const publicEpisode=m=>({text:m.content,evidenceIds:[m.id],visibility:'public',certainty:'confirmed'});
core.ingest(publicPriority,{episodes:[publicEpisode(priorityOrigin)]},[priorityOrigin],priorityHistory);
const originalPublicId=publicPriority.episodicMemory.events[0].id;
core.ingest(publicPriority,{episodes:[{...publicEpisode(priorityUpdate),supersedes:[originalPublicId]}]},[priorityUpdate],priorityHistory);
core.ingest(publicPriority,{episodes:priorityRecent.map(publicEpisode)},priorityRecent,priorityHistory);
const correctionId=publicPriority.episodicMemory.events[1].id;
const publicRecall=(over={})=>priorityRecall({state:publicPriority,actors:[],...over});
assert.equal(publicRecall()[0].id,correctionId,'valid public correction ranks ahead of recent ties');
assert.ok(!publicRecall().some(e=>e.id===originalPublicId),'superseded public fact stays withdrawn');
assert.ok(!publicRecall({hybrid:false}).some(e=>e.id===correctionId),'correction priority is opt-in');
assert.ok(!publicRecall({messages:priorityHistory.filter(m=>m.id!==priorityOrigin.id)}).some(e=>e.id===correctionId),'missing earlier fact removes correction priority');
const privateTarget=clone(publicPriority);privateTarget.episodicMemory.events[0].visibility='restricted';
assert.ok(!publicRecall({state:privateTarget}).some(e=>e.id===correctionId),'hidden target cannot influence public priority');
const ambiguousTarget=clone(publicPriority);ambiguousTarget.episodicMemory.events.push(clone(ambiguousTarget.episodicMemory.events[0]));
assert.ok(!publicRecall({state:ambiguousTarget}).some(e=>e.id===correctionId),'duplicate target identity cannot confer priority');
assert.ok(!publicRecall({messages:priorityHistory.filter(m=>m.id!==priorityUpdate.id)}).some(e=>e.id===correctionId),'rewind removes correction evidence');
const priorityBefore=JSON.stringify(priorityState);priorityRecall();assert.equal(JSON.stringify(priorityState),priorityBefore);
assert.ok(priorityRecall().reduce((n,e)=>n+e.block.length,0)<=2400);
console.log('PASS P2c old evidenced updates and public corrections, 2000-turn gap, unchanged scope and budget');
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
 // Actual wrapper uses the current request's sourceMessages, not another branch.
 ctx.GameState.current=keysState;
 ctx.Chat.messages=clone(keyHistory);
 const rankedConfig={...config,narrativeMode:'world',memory:{...config.memory,hybridRecall:true}};
 ctx.App.config=rankedConfig;
 ctx.App.baseBuild=async()=>[{role:'system',content:'STABLE'},{role:'user',content:'那把鑰匙呢？'}];
 const rankedCalls=calls;
 const rankedOutput=await ctx.App.buildMessages(rankedConfig);
 assert.equal(rankedOutput[0].content,'STABLE');
 assert.match(rankedOutput.at(-1).content,/碼頭倉庫/);
 assert.doesNotMatch(rankedOutput.at(-1).content,/在哪裡|繼續詢問/);
 const alternate=keyHistory.map(m=>m.id==='prior-key'?{...m,content:'其他話題'}:m);
 const alternateOutput=await ctx.App.buildMessages(rankedConfig,{sourceMessages:alternate});
 assert.doesNotMatch(alternateOutput.at(-1).content,/碼頭倉庫/);
 assert.equal(calls,rankedCalls,'context ranking makes no API calls');
 console.log('PASS P2a context tie-break, no new candidates, source branch, permission and zero-call guards');
 console.log('PASS P3 scene spans, provenance, current audience, branch/reload/correction, mixed ranking, actual request schema, zero retrieval calls and stale/failed/blocked guards');
})().catch(e=>{console.error(e);process.exitCode=1;});
