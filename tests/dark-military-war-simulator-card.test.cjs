'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/45/dark-military-war-simulator.json');
const regex=require('../data/characters/community/45/dark-military-war-simulator.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'dark-military-war-simulator');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/81WhE0w.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/TRPG/);
assert.match(card.content.system_prompt,/1d100/);
assert.match(card.content.system_prompt,/【軍事情報】/);
assert.match(card.content.system_prompt,/軍功.*責任/);
assert.match(card.content.system_prompt,/【軍中人物】/);
assert.match(card.content.system_prompt,/21\+|21 歲/);
assert.doesNotMatch(card.content.greeting,/hc-h1|hc-stat|hc-bar|hc-collapse|onclick/);

for(const marker of ['YB:WAR:OPENING','YB:WAR:ACTIONS']) assert.match(card.content.greeting,new RegExp(marker));

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['field-check','combat-pressure','rank-career','prisoners-occupation','faction-motion','trauma-conscience','evidence-liability','time-offscreen','npc-lifecycle']){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['scene','player','attributes','service','core_stats','condition','factions','check','scene_participants','known_people','missions','evidence','rumours','event_log']){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.builder.point_pool,18);
assert.equal(ui.builder.attributes.length,6);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===21));
assert.ok(ui.builder.fields.some(x=>x.key==='empire_type'));
assert.ok(ui.builder.fields.some(x=>x.key==='theater_choice'));
assert.deepEqual(ui.panels.map(x=>x.id),['now','soldier','stats','survival','power','people','orders','actions']);
assert.equal(card.gameplay.initial_state.world_clock.version,1);
assert.equal(card.gameplay.initial_state.world_clock.tick_minutes,0);
assert.deepEqual(card.gameplay.initial_state.world_clock.scheduled_events,[]);
assert.match(card.content.system_prompt,/夜灣的【世界時鐘】只負責故事內部的相對時間累積/);
assert.match(card.content.system_prompt,/不得硬造精確期限/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='rank-career').text,/只能隨真正經過的世界時間累積/);
assert.match(card.content.dynamic_prompts.find(x=>x.id==='time-offscreen').text,/不代表自動完成任務、自動升遷或自動失敗/);

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,3);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,3);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:WAR:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:WAR:CHECK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:WAR:ACTIONS')&&rule.rich));

console.log('PASS dark military war simulator with TRPG builder, native UI, dynamic prompts and author Regex');
