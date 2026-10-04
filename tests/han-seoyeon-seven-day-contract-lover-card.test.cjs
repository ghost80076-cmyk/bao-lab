'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/5d/han-seoyeon-seven-day-contract-lover.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'han-seoyeon-seven-day-contract-lover');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'female');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/SL3EaLL.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/七日是時間壓力，不是固定七章劇本/);
assert.match(card.content.system_prompt,/契約不自動包含任何親密接觸/);
assert.match(card.content.system_prompt,/作品名稱不是 NPC/);
assert.doesNotMatch(card.content.system_prompt,/Layer 3|時間循環|平行世界|靈魂互換|模擬現實/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|<hc-btn|<div class=|世界引擎私語/i);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['contract-negotiation','public-performance','seoyeon-control-crack','lin-yuqian-thread','wedding-countdown','father-and-debt','relationship-shift','intimacy-boundary','offscreen-life','multi-npc-scene']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','contract','han_seoyeon','relationship','lin_yuqian','debt_pressure','messages','known_clues','event_log']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#9a5c68');
assert.deepEqual(ui.panels.map(x=>x.id),['now','contract','seoyeon','relationship','people','threads','actions']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='debt_origin'));
assert.ok(ui.builder.fields.some(x=>x.key==='inner_thoughts'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));
assert.ok(card.presentation.opening.choices.length>=4);

console.log('PASS Han Seoyeon seven-day contract lover card');
