const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const raw = JSON.parse(fs.readFileSync('data/characters/community/73/sunrise-city-disorder.json'));
const state = {time:'今晚',location:'街角',npcs:[],events:[],modules:{timeline:{current:'現在',present_time:'今晚'}}};
const ctx = {console,structuredClone,localStorage:{},document:{head:{appendChild(){}},body:{},createElement(){return {};},querySelector(){return null;},readyState:'loading',addEventListener(){},getElementById(){return null;}},API:{},GameState:{current:state,applyUpdate(){},addEvent(){}},Chat:{messages:[{role:'user',content:'我先等一下。'}],async context(){return this.messages;}}};
ctx.window = ctx;
ctx.MutationObserver=class {observe(){}};
ctx.fetch=async()=>{throw new Error('companion recall must use its snapshot without downloading catalogs');};
ctx.YoruWorldbookLibraryCore=require('../js/worldbook-library-core.js');
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('js/character.js','utf8')+'\nthis.Engine = CharacterEngine;',ctx);
ctx.App = {config:{api:{model:'test'},memory:{cache:true}},activeCharacter:ctx.Engine.normalize(raw),
  sendMessage(){},
  buildSystemPrompt(){return ctx.Engine.composeSystemPrompt(this.activeCharacter,{persona:{name:'測試玩家'},modePrompt:JSON.parse(fs.readFileSync('data/prompts/world.json')).prompt,displayMode:'ui',recentMessages:ctx.Chat.messages});},
  wrapBuildSystemPrompt(id,wrapper){const next=this.buildSystemPrompt.bind(this);this.buildSystemPrompt=(...args)=>wrapper.call(this,next,...args);},
  wrapSendMessage(id,wrapper){const next=this.sendMessage.bind(this);this.sendMessage=(...args)=>wrapper.call(this,next,...args);},
  wrapBuildMessages(id,wrapper){const next=this.buildMessages.bind(this);this.buildMessages=(...args)=>wrapper.call(this,next,...args);}
};
state.worldbookLibrary=structuredClone(ctx.App.activeCharacter.initial_state.worldbookLibrary);
for(const file of ['lorebook','prompt-cache','prompt-orchestrator','story-timeline','worldbook-library']) vm.runInContext(fs.readFileSync(`js/${file}.js`,'utf8'),ctx);
(async()=>{
  const work = [raw.content.system_prompt,raw.content.npc_rules,raw.content.author_instructions].join('\n');
  assert.doesNotMatch(work,/【玩家視角與自主】|【資訊與NPC】|不得代寫玩家的新台詞|模型知識不等於人物知識|不得再次列出完整創建表/,'generic platform instructions are no longer copied into the card');
  for(const feature of ['讀心','反噬','逮捕','定罪','【回憶】','【回到現在】','信任','恐懼','天璇','80%','YB:SUNRISE:SCENE']) assert.ok(work.includes(feature),`${feature} stays work-owned`);
  const lore = ctx.BAOLorebook.parse(raw.content.lore);
  assert.equal(lore.entries.length,0);
  assert.equal(state.worldbookLibrary.enabled.length,48);
  assert.equal(lore.fixed,'','all companion lore is keyword-triggered, not fixed rules');
  assert.doesNotMatch(raw.content.lore,/【平台硬規則】|【玩家自主權】|【場景參與】/);
  const base = await ctx.App.buildMessages();
  assert.match(base[0].content,/controlled_by=user|玩家自主權/);
  assert.match(base[0].content,/只依自身已知資訊反應/);
  assert.match(base[0].content,/NPC 擁有獨立動機、行程/,'world-mode autonomy remains supplied by the platform');
  assert.equal((base[0].content.match(/【場景參與】/g)||[]).length,1);
  assert.doesNotMatch(base[0].content,/常住人口|監獄設施|當前回憶框架/);
  state.location='曙光市第一監獄';
  ctx.Chat.messages=[{role:'user',content:'我查看監獄的作息。'}];
  const prison=await ctx.App.buildMessages();
  assert.equal(prison[0].content,base[0].content,'location, keyword lore and contextual rules do not alter stable prefix');
  assert.match(prison.at(-1).content,/07:00-12:00|21:00 就寢/,'actual companion lore is delivered in dynamic input');
  assert.doesNotMatch(prison[0].content,/07:00-12:00|21:00 就寢/);
  state.location='未設定';
  ctx.Chat.messages=[{role:'user',content:'我研究冰系異能。'}];
  // Multiple matching rules must remain together in the per-turn block.
  ctx.App.activeCharacter.dynamic_prompts.push({id:'cache-regression-one',label:'第一條測試規則',text:'僅供本輪使用一',triggers:['冰系'],always:false});
  const ice=await ctx.App.buildMessages();
  assert.equal(ice[0].content,base[0].content);
  assert.match(ice.at(-1).content,/僅供本輪使用一/);
  assert.match(ice.at(-1).content,/【異能代價】/);
  assert.match(ice.at(-1).content,/冰霜領域/);
  assert.doesNotMatch(ice.at(-1).content,/火焰製造|水流操控|斷肢再生/,'one ability does not recall its whole pack');
  assert.equal((ice.at(-1).content.match(/冰霜領域/g)||[]).length,1,'no inline-library duplication');
  ctx.BAOStoryTimeline.transition('【回憶】昨日詢問');
  const past=await ctx.App.buildMessages();
  assert.equal(past[0].content,base[0].content,'entering a flashback keeps the stable prefix unchanged');
  assert.match(past.at(-1).content,/當前回憶框架|昨日詢問/);
  state.modules.timeline.past_time='昨晚 20:30';state.modules.timeline.past_location='九號碼頭';
  const moved=await ctx.App.buildMessages();
  assert.equal(moved[0].content,base[0].content,'changes inside a flashback remain dynamic');
  assert.match(moved.at(-1).content,/昨晚 20:30|九號碼頭/);
  ctx.BAOStoryTimeline.transition('【回到現在】');
  const returned=await ctx.App.buildMessages();
  assert.equal(returned[0].content,base[0].content);
  assert.doesNotMatch(returned.at(-1).content,/當前回憶框架/);
  delete state.worldbookLibrary;
  ctx.App.activeCharacter=ctx.Engine.normalize({id:'legacy',name:'舊作品',system_prompt:'舊卡作者的自訂自主規則',lore:'舊卡完整背景'});
  const legacy=await ctx.App.buildMessages();
  assert.match(legacy[0].content,/舊卡作者的自訂自主規則|舊卡完整背景/,'no blanket semantic stripping of other authors\' cards');
  console.log('PASS Sunrise prompt layering: platform ownership, retained gameplay, 329 story-pinned lore chapters, stable prefix across current/past/return, legacy preservation');
})().catch(error=>{console.error(error);process.exitCode=1;});
