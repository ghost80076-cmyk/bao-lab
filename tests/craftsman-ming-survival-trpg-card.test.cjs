'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/a8/craftsman-ming-survival-trpg.json');
const regex=require('../data/characters/community/a8/craftsman-ming-survival-trpg.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'craftsman-ming-survival-trpg');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/b7ijyZF.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/TRPG/);
assert.match(card.content.system_prompt,/1d100/);
assert.match(card.content.system_prompt,/【匠業情報】/);
assert.match(card.content.system_prompt,/現代知識/);
assert.match(card.content.system_prompt,/不要顯示經驗值/);
assert.match(card.content.system_prompt,/【市井與行會人物】/);
assert.doesNotMatch(card.content.system_prompt,/1歲即成年|一歲即成年/);
assert.doesNotMatch(card.content.greeting,/hc-btn|<input|<details|onclick/);

for(const marker of ['YB:MING:OPENING','YB:MING:ACTIONS']) assert.match(card.content.greeting,new RegExp(marker));

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['skill-check','craft-growth','modern-knowledge','survival-pressure','economy-trade','business-ledger','class-identity','yaoshou','time-offscreen','npc-lifecycle']){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','player','attributes','survival','economy','modern_knowledge','check','crafts','scene_participants','known_people','inventory','business_summary','quests','rumours','event_log']){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.builder.point_pool,18);
assert.equal(ui.builder.attributes.length,6);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min>=18));
assert.ok(ui.builder.fields.some(x=>x.key==='modern_background'));
assert.ok(ui.builder.fields.some(x=>x.key==='start_region'));
assert.deepEqual(ui.panels.map(x=>x.id),['now','traveler','survival','crafts','money','people','work','actions']);
assert.equal(card.gameplay.initial_state.world_clock.version,1);
assert.equal(card.gameplay.initial_state.world_clock.tick_minutes,0);
assert.deepEqual(card.gameplay.initial_state.world_clock.scheduled_events,[]);
assert.match(card.content.system_prompt,/夜灣的【世界時鐘】只負責故事內部的相對時間累積/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='survival-pressure').text,/不要按對話輪數機械扣點/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='business-ledger').text,/不要硬造精確期限/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='time-offscreen').text,/不代表自動完工、付款或失敗/);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,4);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,4);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MING:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MING:CHECK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MING:CRAFT')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:MING:ACTIONS')&&rule.rich));

console.log('PASS craftsman ming survival TRPG with builder, native UI, dynamic prompts and author Regex');
