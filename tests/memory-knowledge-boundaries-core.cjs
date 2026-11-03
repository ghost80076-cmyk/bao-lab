'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console,structuredClone,setTimeout(){},clearTimeout(){},addEventListener(){},
 document:{getElementById(){return null;},querySelector(){return null;},querySelectorAll(){return[];},createElement(){return{};},head:{appendChild(){}},addEventListener(){}},
 Storage:{clone:structuredClone},GameState:{current:{npcs:[]}},API:{isOpenRouter(){return false;},async send(){throw Error('test must not invoke provider');}}};
ctx.window=ctx;vm.createContext(ctx);
const load=name=>vm.runInContext(fs.readFileSync(name==='canon-workbench'&&process.env.CANON_SOURCE?process.env.CANON_SOURCE:'js/'+name+'.js','utf8'),ctx,{filename:name});
load('helper-data');load('chat');load('app');
vm.runInContext('window.Chat=Chat;window.App=App;',ctx);
ctx.App.config={narrativeMode:'immersive',memory:{mode:'smart',maxRounds:4,maxContext:64000},api:{model:'test'}};
ctx.App.activeCharacter={id:'test',name:'艾琳'};
ctx.App.buildSystemPrompt=()=> 'BASE RULES';ctx.App.saveStory=()=>true;
load('episodic-memory-core');load('memory-core');load('story-tools');load('canon-workbench');load('prompt-cache');
const core=ctx.BAOCanonWorkbench,guard=ctx.BAOHelperData.narrativeMemoryRules;
assert.match(guard,/自身已知線索合理推理/);assert.match(guard,/日常演繹仍依本故事明示授權/);
const rawBook={title:'戒指消息',category:'current',tier:'core',certainty:'confirmed',content:'只有艾琳聽說戒指被偷。',evidence:'m1'};
const parse=book=>core.parseJSON(JSON.stringify({notebooks:[{...rawBook,...book}]})).notebooks[0];
// Newly generated data must not silently inherit the legacy shared default.
for(const fields of [{},{knowledge_scope:'unknown',known_by:['艾琳']},{knowledge_scope:'actors',known_by:'艾琳'},
 {knowledge_scope:'shared',known_by:[null]},{knowledge_scope:'shared'}]){
 const book=parse(fields);assert.equal(book.knowledge_scope,'actors');assert.equal(book.known_by.length,0);
}
assert.equal(parse({knowledge_scope:'shared',known_by:[]}).knowledge_scope,'shared');
assert.equal(parse({knowledge_scope:'shared',known_by:['艾琳']}).knowledge_scope,'actors','explicit actor list cannot widen to shared');
const privateBook=parse({knowledge_scope:'actors',known_by:['艾琳']});
assert.equal(privateBook.known_by[0],'艾琳');
assert.equal(core.normalizeCanon({notebooks:[rawBook]}).notebooks[0].knowledge_scope,'shared','reading old confirmed Canon preserves its compatibility contract');
const publicBook=parse({title:'城門',content:'城門開啟。',knowledge_scope:'shared',known_by:[]});
ctx.GameState.current.canon=core.normalizeCanon({notebooks:[privateBook,publicBook]});
ctx.Chat.messages=[{id:'u1',role:'user',content:'城門與戒指呢？'}];
ctx.Chat.summary='人物已知資訊：\n- 艾琳私下聽說戒指被偷，尚未證實。';
ctx.Chat.summarizedUntil=0;
const pack={playerConfirmed:true,summary:'包內前情：艾琳在私談中得知暗號。',importantEvents:['目擊者與傳聞者不同。'],relationships:['艾琳信任守衛。']};
(async()=>{
 const before=ctx.Chat.summary;
 let messages=await ctx.App.buildMessages();
 assert.ok(messages.some(m=>m.role==='system'&&m.content.includes(guard)),'actual request has narrative knowledge boundary');
 assert.ok(messages.some(m=>m.content.includes(before)),'legacy summary is not silently rewritten or deleted');
 assert.equal(ctx.Chat.summary,before);assert.equal(ctx.Chat.summarizedUntil,0);
 assert.match(JSON.stringify(messages),/城門開啟/);
 assert.match(JSON.stringify(messages),/只有艾琳聽說戒指被偷/);
 ctx.GameState.current.npcs=[{name:'守衛',presence:'present'}];
 messages=await ctx.App.buildMessages();
 assert.doesNotMatch(JSON.stringify(messages),/只有艾琳聽說戒指被偷/,'private Canon excluded from actual mixed-cast request');
 const denied=core.normalizeCanon({notebooks:[parse({})]});
 ctx.GameState.current.canon=denied;ctx.GameState.current.npcs=[];
 assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages()),/只有艾琳聽說戒指被偷/,'missing AI permission stays unreadable even by a named actor');
 ctx.GameState.current.canon=core.normalizeCanon({notebooks:[publicBook]});
 ctx.GameState.current.contextPack=pack;
 messages=await ctx.App.buildMessages();
 const serialized=JSON.stringify(messages);
 assert.match(serialized,/包內前情/);assert.match(serialized,/玩家確認前情也不授予角色資訊/);
 assert.doesNotMatch(messages[0].content,/包內前情|艾琳信任守衛/,'new boundary header must not move pack contents into stable prefix');
 assert.equal(messages[0].content.split('【記憶與知情邊界】').length-1,1,'pack and Canon reuse one stable boundary');
 const stable=messages[0].content;pack.summary='改變後的包內前情。';
 assert.equal((await ctx.App.buildMessages())[0].content,stable,'changing memory keeps stable prefix unchanged');
 pack.playerConfirmed=false;ctx.GameState.current.canon={notebooks:[]};
 assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages()),/改變後的包內前情/,'draft still cannot enter actual request');
 ctx.App.config.memory.mode='full';
 assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages()),/人物已知資訊/,'full-history mode does not inject compressed summary');
 const reloaded=JSON.parse(JSON.stringify(core.normalizeCanon({notebooks:[privateBook]})));
 ctx.GameState.current.canon=reloaded;ctx.App.activeCharacter.name='陌生人';
 assert.doesNotMatch(JSON.stringify(await ctx.App.buildMessages()),/只有艾琳聽說戒指被偷/,'JSON reload preserves private scope');
 // Exercise real extraction + final merge. The provider fixture may omit the
 // final metadata, but only the fail-closed candidate can reach confirmation.
 ctx.App.config.api.key='mock-key';ctx.App.activeCharacter.name='艾琳';
 for(const omitFinal of [false,true]){
  ctx.GameState.current={npcs:[]};ctx.Chat.messages=[{id:'u-run',role:'user',content:'整理這段對話。'},{id:'a-run',role:'assistant',content:'角色確認了原文。'}];
  const calls=[],versions=[];
  ctx.App.saveStory=()=>{if(ctx.GameState.current.canonJob)versions.push(ctx.GameState.current.canonJob.version);return true;};
  ctx.API.send=async(config,messages)=>{
   calls.push({config,messages});
   return{text:JSON.stringify({notebooks:[calls.length===2&&omitFinal?rawBook:{...rawBook,knowledge_scope:'actors',known_by:['艾琳']}]})};
  };
  const progress=[];await core.run('full',message=>progress.push(message));
  if(omitFinal)assert.match(progress.at(-1),/尚未指定知情角色/);
  assert.equal(calls.length,2,'retain existing extraction + merge call count');
  assert.ok(versions.length&&versions.every(v=>v===2),'new scope protocol checkpoints use version 2');
  for(const call of calls){
   const schema=call.config.__responseSchema.properties.notebooks.items;
   assert.ok(schema.required.includes('knowledge_scope')&&schema.required.includes('known_by'));
   assert.match(call.messages[1].content,/knowledge_scope.*known_by/);
  }
  assert.match(calls[1].messages[1].content,/只有艾琳聽說戒指被偷/,'merge sees extracted scope and content');
  assert.match(calls[1].messages[1].content,/不可.*知情角色的聯集/);
  assert.equal(ctx.GameState.current.canon,undefined,'generation still creates only a draft');
  ctx.GameState.current.canon=JSON.parse(JSON.stringify(ctx.GameState.current.canonDraft));
  const received=JSON.stringify(await ctx.App.buildMessages());
  if(omitFinal)assert.doesNotMatch(received,/只有艾琳聽說戒指被偷/,'missing final scope cannot become shared after confirmation');
  else assert.match(received,/只有艾琳聽說戒指被偷/);
 }
 // An old protocol must not bypass the new parser using a saved candidate.
 ctx.GameState.current={npcs:[]};let sends=0;
 ctx.API.send=async()=>{sends++;return{text:JSON.stringify({notebooks:[{...rawBook,knowledge_scope:'actors',known_by:['艾琳']}]})};};
 ctx.App.saveStory=()=>!ctx.GameState.current.canonDraft;
 await assert.rejects(()=>core.run('full'),/儲存|保存|寫入/);
 assert.ok(ctx.GameState.current.canonJob.candidate);
 ctx.GameState.current.canonJob.version=1;
 delete ctx.GameState.current.canonJob.candidate.notebooks[0].knowledge_scope;
 delete ctx.GameState.current.canonJob.candidate.notebooks[0].known_by;
 ctx.App.saveStory=()=>true;sends=0;
 await core.run('full');
 assert.equal(sends,2,'old protocol candidate is regenerated under the new permission contract');
 assert.equal(ctx.GameState.current.canonDraft.notebooks[0].knowledge_scope,'actors');
 console.log('PASS AI scope fail-closed, legacy compatibility, actual summary/pack/Canon payload, cast denial, draft/full/reload and stable prefix');
})().catch(e=>{console.error(e);process.exitCode=1;});
