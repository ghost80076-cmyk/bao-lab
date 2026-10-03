'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/64/reborn-di-daughter-regent.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'reborn-di-daughter-regent');
assert.equal(card.meta.category,'female');
assert.equal(card.meta.rating,'general');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/J30iqUS.jpg');
assert.equal(card.presentation.reading_background,'https://i.meee.com.tw/J30iqUS.jpg');
assert.match(card.content.system_prompt,/永安十二年三月初八/);
assert.match(card.content.system_prompt,/永安十五年九月初八/);
assert.match(card.content.system_prompt,/舊歷史預測/);
assert.match(card.content.system_prompt,/不是世界硬規則/);
assert.match(card.content.system_prompt,/一般分級/);
assert.doesNotMatch(card.content.system_prompt,/成人模式已啟用/);
assert.doesNotMatch(card.content.greeting,/傷痕還在/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['rebirth-memory','timeline-divergence','household-intrigue','engagement-xiao','regent-encounter','court-power','evidence-investigation','optional-gift','multi-npc-info']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','foreknowledge','household','regent','chessboard']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.ok(ui.builder);
assert.deepEqual(ui.panels.map(x=>x.id),['now','past','house','regent','chessboard']);
assert.ok(card.presentation.opening.choices.some(x=>x.includes('春杏')));
console.log('PASS reborn-di-daughter-regent native general female intrigue card');
