'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const lm = require('../js/lm-studio-core.js');
const archive = require('../js/yume-relationship-archive.js');
const card = require('../data/characters/general/kurobane-yume-kabukicho.json');
const run = (ctx, file) => vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, {filename:file});
const document = {querySelector:()=>null, querySelectorAll:()=>[], getElementById:()=>null,
  addEventListener(){}, head:{appendChild(){}}, createElement:()=>({})};
const captured = [];
const ctx = vm.createContext({console, document, setTimeout, clearTimeout, structuredClone,
  API:{isOpenRouter:()=>false, async send(config,messages){captured.push(messages);return {text:'{}'};}},
  App:{config:{narrativeMode:'world', displayMode:'ui', persona:{}, api:{key:'test',model:'local'}},
    escapeHTML:String, buildSystemPrompt:()=> '固定人物設定', renderUIPanel(){}, renderChatShell(){},
    openBuilder(){}, sendMessage(){}, saveStory(){}},
  Chat:{messages:[], async context(){return this.messages.map(m=>({...m}));}},
  BAOYumeArchiveCore:archive});
ctx.window=ctx;
run(ctx,'js/character.js');
run(ctx,'js/state.js');
run(ctx,'js/world-state.js');
run(ctx,'js/character-status.js');
run(ctx,'js/helper-data.js');
run(ctx,'js/world-modules.js');
// Deliberately restore the problematic OLD story snapshot and field schema.
const legacy=structuredClone(card);
legacy.gameplay.character_status.fields.forEach(f=>{if(['action','location'].includes(f.key))f.context='core';});
legacy.gameplay.initial_state.character_statuses['黑羽ゆめ'].known_information='玩家在店門外；未確認彼此關係';
ctx.App.activeCharacter=vm.runInContext('CharacterEngine.normalize',ctx)(legacy);
vm.runInContext('GameState.create(App.activeCharacter,App.config); window.GameState=GameState; window.WorldStateEngine=WorldStateEngine;',ctx);
ctx.BAOCharacterStatus.toggleContextCharacter('黑羽ゆめ');
run(ctx,'js/world-relevance.js');
run(ctx,'js/character-status-ui.js');
run(ctx,'js/global-bridge.js');
run(ctx,'js/prompt-cache.js');
run(ctx,'js/prompt-orchestrator.js');

(async()=>{
  const oldReply='[CHAR:yume]\n「要進來嗎？」';
  ctx.Chat.messages=[{role:'user',content:'我走進便利店。'},
    {role:'assistant',content:oldReply}, {role:'user',content:'我已經在店裡，走到熱飲櫃。'}];
  const before=JSON.stringify(ctx.GameState.current.characterStatuses);
  const messages=await ctx.App.buildMessages(ctx.App.config);
  assert.match(messages[0].content,/【黑羽ゆめ｜語言與場景】/);
  assert.match(messages[0].content,/玩家選定的回覆語言/,'Yume-specific rules must respect the player choice');
  assert.match(messages[0].content,/本輪新生成的旁白、敘事與台詞使用繁體中文/,'default reply language remains Traditional Chinese');
  assert.doesNotMatch(messages[0].content,/緊接繁中譯文/,'Yume-specific rule must not force Traditional Chinese translations');
  assert.match(messages[0].content,/玩家已進便利店且未離開時/);
  assert.doesNotMatch(messages[0].content,/\[CHAR:yume\]/);
  assert.match(card.content.author_instructions,/全程繁體中文敘事/);
  assert.match(messages[0].content,/【狀態時序】/);
  assert.match(messages[0].content,/較新的已確認事件優先/);
  assert.match(messages[0].content,/尚待判定的嘗試不算完成/);
  assert.match(messages[0].content,/不自動移動 NPC/);
  assert.doesNotMatch(messages[0].content,/玩家在店門外/,'old snapshot must stay out of cached prefix');
  assert.match(messages.at(-1).content,/上次整理的人物快照/);
  assert.match(messages.at(-1).content,/我已經在店裡，走到熱飲櫃/);
  assert.doesNotMatch(messages.at(-1).content,/只把這些狀態視為目前事實/);
  assert.equal(messages.find(m=>m.role==='assistant').content,'「要進來嗎？」');
  assert.equal(ctx.Chat.messages[1].content,oldReply,'raw save/backup must stay unchanged');
  assert.equal(JSON.stringify(ctx.GameState.current.characterStatuses),before,'prompt must not guess or mutate state');

  // Capture the actual LM transport JSON, using no running model or paid API.
  let payload;
  await lm.send({model:'local',baseUrl:'http://localhost:1234/v1'},messages,
    {readJSON:r=>r.json(),contentToText:String,normalizeUsage:()=>({})},
    async (_url,request)=>{payload=JSON.parse(request.body);return {ok:true,json:async()=>({choices:[{message:{content:'mock'}}]})};});
  assert.equal(JSON.stringify(payload.messages),JSON.stringify(messages));
  assert.ok(payload.messages.some(m=>m.content==='我走進便利店。'),'LM receives prior player action');
  ctx.GameState.current.characterStatuses['黑羽ゆめ'].location='便利店內';
  ctx.Chat.messages.at(-1).content='我沒有出店；如果下雨，我才考慮離開。';
  const next=await ctx.App.buildMessages(ctx.App.config);
  assert.equal(next[0].content,messages[0].content,'scene changes must preserve stable prefix');
  assert.match(next.at(-1).content,/我沒有出店；如果下雨/,'negative/conditional input must remain verbatim');

  await ctx.WorldStateEngine.update(ctx.App.config,'我已走進便利店。','她仍問：要進來嗎？');
  assert.match(captured.at(-1).at(-1).content,/目前狀態是上次整理的快照/);
  assert.match(captured.at(-1).at(-1).content,/不得因故事仍重問舊邀請就退回開場/);
  // The same-model appendix replaces the separate tracker in the default route.
  // It must carry the same conflict rule without a second request.
  run(ctx,'js/same-model-state-merge.js');
  ctx.App.config.cost={stateInterval:1};
  const sendsBefore=captured.length;
  await ctx.API.send(ctx.App.config.api,next);
  assert.equal(captured.length,sendsBefore+1);
  assert.match(captured.at(-1).at(-1).content,/BAO_STATE_V1/);
  assert.match(captured.at(-1).at(-1).content,/目前狀態是上次整理的快照/);
  console.log('PASS snapshot continuity: old save, final LM payload, cache stability, raw-history preservation and tracker contract');
})().catch(error=>{console.error(error);process.exitCode=1;});
