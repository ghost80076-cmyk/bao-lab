'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/fb/taiwan-food-hunter.json');
const regex=require('../data/characters/community/fb/taiwan-food-hunter.regex.json');
const GameplayUI=require('../js/gameplay-ui-core.js');
const AuthorRegex=require('../js/author-regex-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'taiwan-food-hunter');
assert.equal(card.meta.title,'臺灣美食獵人｜環島獵味錄');
assert.equal(card.meta.category,'general');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/0OsGEXZ.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/四層探索/);
assert.match(card.content.system_prompt,/22 個縣市/);
assert.match(card.content.system_prompt,/新竹市／新竹縣/);
assert.match(card.content.system_prompt,/嘉義市／嘉義縣/);
assert.match(card.content.system_prompt,/食材偏好/);
assert.match(card.content.system_prompt,/有些 NPC 可能體型歧視/);
assert.match(card.content.system_prompt,/1d100/);
assert.doesNotMatch(card.content.system_prompt,/原生狀態 UI|Gameplay UI|Builder/);
assert.doesNotMatch(card.content.greeting,/<details|<pre|hc-collapse|onclick/);
assert.doesNotMatch(card.content.greeting,/Character Builder|地方認證改採|這次地圖不只/);
assert.match(card.content.greeting,/成為美食獵人後的第一天/);
assert.match(card.content.system_prompt,/birthplace 決定第一幕所在縣市/);
const openingPrompt=card.content.dynamic_prompts.find(x=>x.id==='opening-build');
assert.ok(openingPrompt);
assert.match(openingPrompt.text,/不得再次詢問、重設或要求玩家重填/);
assert.match(openingPrompt.text,/以 birthplace 作為第一幕所在縣市/);
assert.doesNotMatch(card.presentation.opening.posts.map(x=>x.content).join('\n'),/22 縣市|食材偏好|Builder|性別不再綁定/);

for(const marker of ['YB:FOODHUNT:OPENING','YB:FOODHUNT:BULLETIN']){
  assert.match(card.content.greeting,new RegExp(marker));
}

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of [
  'opening-build','regional-worldbook','map-node-generation','travel-route',
  'food-affinity','body-weight','combat','wild-food-generation','license-progress',
  'npc-offscreen','social-pressure','mount-system','failure-transformation',
  'weather-mutation','economy-equipment','adult-relationship','time-skip','day-end'
]){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of [
  'scene','hunter','body','combat','preferences','license','route',
  'map_progress','map_nodes','wild_foods','check','economy','inventory',
  'mount','party','scene_participants','known_people','quests','rumours',
  'world_events','daily_log'
]){
  assert.ok(moduleIds.has(id),'missing '+id);
}

assert.equal(card.gameplay.initial_state.modules.map_progress.length,22);
const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent.toLowerCase(),'#e1a94f');
assert.deepEqual(ui.panels.map(x=>x.id),['now','hunter','body','map','hunt','people','gear','actions']);
assert.ok(ui.builder.fields.some(x=>x.key==='age'&&x.min===18));
assert.ok(ui.builder.fields.some(x=>x.key==='constitution'));
assert.ok(ui.builder.fields.some(x=>x.key==='taste_1'));
assert.ok(ui.builder.fields.some(x=>x.key==='ingredient_1'));
assert.ok(ui.builder.fields.some(x=>x.key==='ingredient_2'));
assert.ok(ui.builder.fields.some(x=>x.key==='birthplace'&&x.options.length===22));

assert.equal(regex.type,'yorubay-author-regex-mod');
assert.equal(regex.characterId,card.meta.id);
assert.equal(regex.regex_scripts.length,4);
assert.deepEqual(card.import_metadata.preserved_source,regex);
const normalizedRegex=AuthorRegex.normalize(regex);
assert.equal(normalizedRegex.length,4);
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:FOODHUNT:OPENING')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:FOODHUNT:BULLETIN')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:FOODHUNT:CHECK')&&rule.rich));
assert.ok(normalizedRegex.some(rule=>rule.pattern.includes('YB:FOODHUNT:DAY_END')&&rule.rich));

console.log('PASS Taiwan Food Hunter with 22-county layered map, ingredient preferences, body system, native Gameplay UI, Dynamic Prompts and author Regex');
