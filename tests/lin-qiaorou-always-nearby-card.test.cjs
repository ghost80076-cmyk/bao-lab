'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/c4/lin-qiaorou-always-nearby.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'lin-qiaorou-always-nearby');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'female');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/uF0mMWA.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/暴露深度｜事件驅動/);
assert.match(card.content.system_prompt,/監控不是超能力/);
assert.match(card.content.system_prompt,/如果玩家快進十三年/);
assert.match(card.content.system_prompt,/自傷.*不是戀愛勳章|不是戀愛勳章/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|<hc-btn|<div class=|世界引擎私語/i);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['third-party-pressure','coincidence-clue','direct-confrontation','distance-and-break','relationship-warmth','self-harm-crisis','offscreen-life','evidence-test','multi-npc-scene']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','qiaorou_visible','relationship','known_anomalies','people','messages','event_log','qiaorou_private']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'default');
assert.equal(ui.theme.accent,'#c9859b');
assert.deepEqual(ui.panels.map(x=>x.id),['now','qiaorou','relationship','clues','people','threads','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='reveal_pace'));
assert.ok(ui.builder.fields.some(x=>x.key==='reader_view'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));
assert.ok(!ui.panels.some(panel=>JSON.stringify(panel).includes('qiaorou_private')),'private state must not be player-visible');
assert.ok(card.presentation.opening.choices.length>=4);

console.log('PASS Lin Qiaorou slow-burn yandere card');
