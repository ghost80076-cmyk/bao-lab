'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const clone=value=>JSON.parse(JSON.stringify(value));
const ctx={console,structuredClone,setTimeout(){},clearTimeout(){},addEventListener(){},
 document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},createElement(){return{};},head:{appendChild(){}},addEventListener(){}},
 Storage:{clone:structuredClone,scrubSecrets:structuredClone},GameState:{current:{}},API:{isOpenRouter(){return false;},async send(){throw Error('no paid calls');}}};
ctx.window=ctx;vm.createContext(ctx);const load=name=>vm.runInContext(fs.readFileSync('js/'+name+'.js','utf8'),ctx,{filename:name});
load('helper-data');load('memory-core');load('episodic-memory-core');load('summary-knowledge-core');load('chat');load('app');vm.runInContext('window.Chat=Chat;window.App=App;',ctx);
const core=ctx.BAOSummaryKnowledgeCore;
const messages=[{id:'a',role:'user',content:'我和艾琳交談。'},{id:'b',role:'assistant',content:'艾琳回應了港口的消息。'},
 ...Array.from({length:30},(_,i)=>({id:'tail'+i,role:i%2?'assistant':'user',content:i===0?'較晚原文8841。':'後續日常。'}))];
const summary='港口暗號7712。\n城門開放。\n排除事項9911。';
const state={npcs:[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}]};
const config={narrativeMode:'immersive',api:{model:'mock'},memory:{mode:'smart',maxRounds:4,summaryInterval:4},persona:{name:'旅人'}};
ctx.App.config=config;ctx.App.activeCharacter={id:'review-fixture',name:'艾琳'};ctx.App.buildSystemPrompt=()=> 'FIXED';ctx.App.saveStory=()=>true;ctx.App.renderChatShell=()=>{};
ctx.GameState.current=state;ctx.Chat.messages=clone(messages);ctx.Chat.summary=summary;ctx.Chat.summarizedUntil=2;
const candidate=core.draft({summary,cursor:2,messages});
assert.equal(candidate.entries.length,3);assert.equal(candidate.entries.map(e=>e.text).join(''),summary,'segmentation preserves all punctuation/newlines');
assert.ok(candidate.entries.every(e=>e.knowledge_scope==='actors'&&!e.known_by.length),'no guessed audiences');
assert.throws(()=>core.approve(candidate,candidate.entries,messages,summary,2),/第 1 段/);
const entries=candidate.entries.map((e,i)=>({...e,knowledge_scope:['actors','shared','exclude'][i],known_by:i?[]:['琳']}));
const approved=core.approve(candidate,entries,messages,summary,2);state.summaryKnowledge=approved;
const view=(over={})=>core.view({state,summary,cursor:2,messages,config,primary:'艾琳',...over});
assert.match(view().text,/港口暗號7712/);assert.match(view().text,/城門開放/);assert.doesNotMatch(view().text,/排除事項9911/);assert.match(view().text,/玩家指定已知角色/);
state.npcs.push({name:'守衛',presence:'present'});assert.doesNotMatch(view().text,/港口暗號7712/);assert.match(view().text,/城門開放/);state.npcs.pop();
state.npcs.push({npc_id:'collision',name:'另一人',aliases:['琳'],presence:'away'});assert.doesNotMatch(view({primary:'琳'}).text,/港口暗號7712/);assert.throws(()=>core.approve(candidate,entries,messages,summary,2),/名稱有歧義/);state.npcs.pop();
assert.doesNotMatch(view({config:{narrativeMode:'world'},primary:'作品標題'}).text,/港口暗號7712/,'world title is not a role');
state.npcs[0].aliases=[];state.npcs.push({npc_id:'b',name:'守衛',aliases:['琳'],presence:'away'});assert.doesNotMatch(view({primary:'守衛'}).text,/港口暗號7712/,'reassigning an alias cannot transfer a saved canonical permission');state.npcs.pop();state.npcs[0].aliases=['琳'];
const before=JSON.stringify(state);view();assert.equal(JSON.stringify(state),before,'read-only role selection');
assert.match(view({state:clone(state)}).text,/港口暗號7712/,'JSON backups preserve scope');
const fresh=core.draft({summary:summary+'新段落。',cursor:4,messages,previous:approved});assert.equal(fresh.entries[0].known_by[0],'艾琳');assert.equal(fresh.entries.at(-1).known_by.length,0,'only unchanged reviewed text seeds the next draft');
for(const changed of [messages.map(m=>m.id==='a'?{...m,content:'改寫'}:m),messages.slice(1),[messages[1],messages[0],...messages.slice(2)],[...messages,{...messages[0]}]]){
 assert.throws(()=>view({messages:changed}),/原文|來源|完整/);
 assert.throws(()=>core.approve(candidate,entries,changed,summary,2),/變更|來源|原文/);
}
assert.throws(()=>view({cursor:0}),/進度不符/);assert.throws(()=>view({resolver:null}),/尚未就緒/);
assert.throws(()=>core.approve(candidate,entries,messages,'新摘要',2),/已變更/);
assert.throws(()=>core.approve(candidate,entries.map((e,i)=>i?e:{...e,known_by:Array(31).fill('艾琳')}),messages,summary,2),/最多 30/);
assert.throws(()=>core.approve(candidate,entries.map((e,i)=>i?e:{...e,text:'不能偷換摘要'}),messages,summary,2),/第 1 段/);
assert.throws(()=>core.draft({summary:'一句。'.repeat(257),cursor:2,messages}),/256/);
assert.throws(()=>core.draft({summary,cursor:3,messages}),/完整原文/);
state.summaryKnowledgeBackup={appliedId:approved.id,appliedSignature:core.fingerprint(JSON.stringify(approved)),previous:null};
assert.equal(core.canUndo({state,summary,cursor:2,messages}),true);
assert.equal(core.canUndo({state,summary:'更新摘要',cursor:2,messages}),false);
const edited=clone(state);edited.summaryKnowledge.entries[0].known_by=['守衛'];assert.equal(core.canUndo({state:edited,summary,cursor:2,messages}),false,'an in-place scope edit invalidates old rollback ownership');
(async()=>{
 let output=await ctx.Chat.context(config);assert.match(JSON.stringify(output),/港口暗號7712/);assert.doesNotMatch(JSON.stringify(output),/排除事項9911/);
 state.npcs.push({name:'守衛',presence:'present'});output=await ctx.Chat.context(config);assert.doesNotMatch(JSON.stringify(output),/港口暗號7712/);assert.match(JSON.stringify(output),/城門開放/);state.npcs.pop();
 const original=ctx.Chat.summary,oldCursor=ctx.Chat.summarizedUntil;
 ctx.Chat.summary='未審閱新摘要5533。';ctx.Chat.summarizedUntil=4;
 output=await ctx.Chat.context(config);assert.doesNotMatch(JSON.stringify(output),/未審閱新摘要5533/);assert.match(JSON.stringify(output),/城門開放/);assert.match(JSON.stringify(output),/較晚原文8841/);assert.equal(ctx.Chat.contextGuard.rawStart,2,'new automatic summary cannot trim past last reviewed coverage');
 assert.equal(view({summary:ctx.Chat.summary,cursor:4}).pending,true);
 load('story-tools');load('prompt-cache');
 const actual=await ctx.App.buildMessages();assert.match(JSON.stringify(actual),/港口暗號7712/);assert.doesNotMatch(JSON.stringify(actual),/未審閱新摘要5533|排除事項9911/);assert.equal(actual[0].content,'FIXED');
 const preview=JSON.stringify(ctx.BAOStoryTools.preview());assert.doesNotMatch(preview,/未審閱新摘要5533|排除事項9911/,'context preview matches selected summary');assert.match(preview,/較晚原文8841/);
 ctx.Chat.messages[0].content='來源改寫';await assert.rejects(ctx.App.buildMessages(),/來源已改寫/);
 ctx.Chat.messages=clone(messages);ctx.Chat.summary=original;ctx.Chat.summarizedUntil=oldCursor;
 const savedCore=ctx.BAOSummaryKnowledgeCore;ctx.BAOSummaryKnowledgeCore=undefined;await assert.rejects(ctx.Chat.context(config),/尚未就緒/);ctx.BAOSummaryKnowledgeCore=savedCore;
 for(const mode of ['rounds','full'])assert.doesNotMatch(JSON.stringify(await ctx.Chat.context({...config,memory:{...config.memory,mode}})),/港口暗號7712|城門開放/,'raw-history modes do not add compressed summaries');
 state.summaryKnowledge={...approved,active:false};assert.match(JSON.stringify(await ctx.Chat.context(config)),/排除事項9911/,'explicit disable restores ordinary summary');
 delete state.summaryKnowledge;assert.match(JSON.stringify(await ctx.Chat.context(config)),/排除事項9911/,'legacy stories unchanged');
 // Long, local source proof remains read-only and does not introduce any model call.
 const large=Array.from({length:6000},(_,i)=>({id:'long'+i,role:i%2?'assistant':'user',content:'原文。'.repeat(200)}));
 const t=Date.now();const d=core.draft({summary:'長篇摘要。',cursor:6000,messages:large});const r=core.approve(d,[{...d.entries[0],knowledge_scope:'shared',known_by:[]}],large,'長篇摘要。',6000);
 assert.equal(core.view({state:{summaryKnowledge:r},summary:'長篇摘要。',cursor:6000,messages:large,config,primary:'艾琳'}).coveredUntil,6000);
 console.log('PASS summary review: default/assigned scopes, aliases/mixed/world cast, signatures, rewind/reload, pending raw retention, actual prompt/preview, module fallback, rollback ownership; 6000-message proof '+(Date.now()-t)+'ms');
})().catch(e=>{console.error(e);process.exitCode=1;});
