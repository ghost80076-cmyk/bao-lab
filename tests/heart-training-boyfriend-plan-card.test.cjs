'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/b8/heart-training-boyfriend-plan.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'heart-training-boyfriend-plan');
assert.equal(card.meta.category,'female');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.gender,'male');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/wm0SKmQ.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/角色不是玩家完成任務後得到的獎品/);
assert.match(card.content.system_prompt,/自主演化/);
assert.match(card.content.system_prompt,/不記得 APP 內的養成過程/);
assert.doesNotMatch(card.content.system_prompt,/0.?20 陌生人/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|<p class=|<div class=/i);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['creation-phase','autonomous-evolution','materialization','app-assist','first-real-contact','secret-risk','relationship-shift','real-life-pressure','time-skip','truth-discovery']){
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','app','blueprint','him','relationship','deviations','messages','known_clues','event_log']){
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.accent,'#9b8bd6');
assert.deepEqual(ui.panels.map(x=>x.id),['now','app','blueprint','him','relationship','clues','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='creation_mode'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_style'));
assert.ok(card.presentation.opening.choices.length>=4);

console.log('PASS heart training boyfriend plan card');
