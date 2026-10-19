'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={console,structuredClone,Date,document:{readyState:'loading',addEventListener(){},querySelectorAll(){return[];}},
  GameState:{current:{location:'港口'}},Chat:{messages:[{id:'u1',role:'user',content:'港口'}],reset(){this.messages=[];}},
  App:{config:{narrativeMode:'immersive'},activeCharacter:{name:'艾琳'},
    wrapBuildMessages(id,fn){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>fn.call(this,next,...args);},
    async buildMessages(){return[{role:'system',content:this.buildSystemPrompt()}];},
    buildSystemPrompt(){return ctx.CharacterEngine.composeSystemPrompt(this.activeCharacter,{recentMessages:ctx.Chat.messages});}}};
ctx.window=ctx;
ctx.CharacterEngine={normalize:c=>c,composeSystemPrompt:c=>'BASE\n'+(c.prompt_options?.include_lore===false?'':c.lore||'')};
vm.createContext(ctx);
const load=file=>vm.runInContext(fs.readFileSync(file,'utf8'),ctx,{filename:file});
load('js/api.js');vm.runInContext('window.API=API',ctx);
let calls=0;ctx.API.send=async()=>{calls++;return{text:'reply'};};
load('js/episodic-memory-core.js');load('js/lorebook.js');load('js/canon-workbench.js');load('js/context-inspector.js');
const book=(id,extra={})=>({id,title:id,category:'world',tier:'relevant',content:'正文-'+id,...extra});
ctx.GameState.current.canon={notebooks:[
  book('核心',{tier:'core'}),book('停用',{enabled:false}),book('只看',{tier:'ui'}),
  book('知情表',{category:'knowledge'}),book('私有',{tier:'core',knowledge_scope:'actors',known_by:['守衛']}),book('未中'),
  ...Array.from({length:5},(_,i)=>book('命中'+i,{entities:['港口']}))
]};
ctx.GameState.current.canonDraft={notebooks:[book('未確認草稿',{tier:'core'})]};
const inline=(label,trigger,text)=>`【世界書：${label}｜${trigger}】${text}【/世界書】`;
ctx.App.activeCharacter.lore='舊版固定背景\n'+Array.from({length:4},(_,i)=>inline('港口'+i,'港口','設定-'+i)).join('\n')+'\n'+inline('未中','山頂','不應加入');
(async()=>{
  const messages=await ctx.App.buildMessages();await ctx.API.send({},messages);
  let snap=ctx.BAOContextInspector.snapshot(), canon=snap.layers.Canon, lore=snap.layers['角色卡內嵌世界書'];
  assert.deepEqual(canon.map(d=>d.reason),['included','disabled','display','matrix','knowledge','irrelevant','included','included','included','included','budget']);
  assert.deepEqual(lore.map(d=>d.reason),['included','included','included','budget','irrelevant']);
  assert.match(messages[0].content,/舊版固定背景/);
  assert.doesNotMatch(messages[0].content,/正文-(停用|只看|知情表|私有|未中|命中4)|設定-3|不應加入|未確認草稿/);
  assert.ok(canon.every(d=>!('content'in d)&&!('known_by'in d)));
  assert.ok(!JSON.stringify(snap.layers).includes('正文-'),'excluded content is not copied into decisions');
  assert.equal(canon.find(d=>d.id==='命中0').score,4);
  assert.equal(lore[0].score,182);
  assert.equal(canon.some(d=>d.id==='未確認草稿'),false);
  // Actual permission filter changes with the cast; observation does not bypass it.
  ctx.App.activeCharacter.name='守衛';
  await ctx.API.send({},await ctx.App.buildMessages());
  assert.equal(ctx.BAOContextInspector.snapshot().layers.Canon.find(d=>d.id==='私有').reason,'included');
  ctx.GameState.current.npcs=[{name:'訪客',presence:'present'}];
  await ctx.API.send({},await ctx.App.buildMessages());
  assert.equal(ctx.BAOContextInspector.snapshot().layers.Canon.find(d=>d.id==='私有').reason,'knowledge');
  ctx.GameState.current.worldbookLibrary={recallMode:'off'};
  await ctx.API.send({},await ctx.App.buildMessages());
  assert.ok(ctx.BAOContextInspector.snapshot().layers['角色卡內嵌世界書'].every(d=>d.reason==='disabled'));
  ctx.GameState.current.worldbookLibrary.recallMode='scene';ctx.GameState.current.location='街角';
  await ctx.API.send({},await ctx.App.buildMessages());
  assert.ok(ctx.BAOContextInspector.snapshot().layers['角色卡內嵌世界書'].every(d=>d.reason==='irrelevant'));
  ctx.App.activeCharacter.prompt_options={include_lore:false};
  await ctx.API.send({},await ctx.App.buildMessages());
  assert.ok(ctx.BAOContextInspector.snapshot().layers['角色卡內嵌世界書'].every(d=>d.reason==='disabled'));
  // Existing budget semantics allow one oversized entry, then skip subsequent entries.
  const decisions=[];
  const picked=ctx.BAOLorebook.select([{label:'大筆',triggers:['港口'],text:'文'.repeat(10001)},{label:'小筆',triggers:['港口'],text:'短'}],{latestUserText:'港口'},d=>decisions.push(d));
  ctx.GameState.current.worldbookLibrary.recallMode='auto';
  const decisions2=[];
  const picked2=ctx.BAOLorebook.select([{label:'大筆',triggers:['港口'],text:'文'.repeat(10001)},{label:'小筆',triggers:['港口'],text:'短'}],{latestUserText:'港口'},d=>decisions2.push(d));
  assert.equal(picked.length,0);assert.equal(picked2.length,1);assert.deepEqual(decisions2.map(d=>d.reason),['included','budget']);
  assert.equal(calls,6,'observation adds no model calls');
  ctx.Chat.reset();assert.equal(ctx.BAOContextInspector.snapshot(),null);
  console.log('PASS actual Canon/inline selection -> captured request; scope, draft, mode, score, budget, no extra calls');
})().catch(e=>{console.error(e);process.exitCode=1;});
