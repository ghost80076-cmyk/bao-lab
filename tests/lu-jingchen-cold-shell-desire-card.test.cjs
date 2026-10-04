'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/a9/lu-jingchen-cold-shell-desire.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'lu-jingchen-cold-shell-desire');
assert.equal(card.meta.category,'female');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'male');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/FMd6xqc.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/事件驅動，不按回合/);
assert.match(card.content.system_prompt,/不是因為玩家「服從」才愛上玩家/);
assert.match(card.content.system_prompt,/溫以行不是固定每三回合/);
assert.match(card.content.system_prompt,/陸景琛不是「雙重人格」/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|<p class=|<div class=/i);
assert.doesNotMatch(card.content.greeting,/YB:LUJINGCHEN/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['professional-challenge','control-crack','wen-yixing','trust-vulnerability','public-private-gap','workplace-consequence','offscreen-life','relationship-shift','scar-and-past','multi-npc-scene']){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','lu_jingchen','relationship','wen_yixing','work_threads','messages','known_clues','event_log']){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#8fa6b8');
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','jingchen','relationship','yixing','work','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='player_role'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));
assert.ok(card.presentation.opening.choices.length>=4);

console.log('PASS Lu Jingchen cold-shell desire card');
