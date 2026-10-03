'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const card=require('../data/characters/community/de/debt-cage-lu-shen.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'debt-cage-lu-shen');
assert.equal(card.meta.category,'female');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'male');
assert.equal(card.presentation.play_info_surface,'game-ui');
assert.ok(fs.existsSync(path.join(__dirname,'..',card.meta.avatar)));
assert.match(card.content.system_prompt,/陸深.*30 歲/);
assert.match(card.content.system_prompt,/玩家可以拒簽、談判、拖延/);
assert.match(card.content.system_prompt,/親密不能作為債務償還、懲罰、報復/);
assert.doesNotMatch(card.content.greeting,/📊 當前狀態/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['contract-negotiation','control-escalation','escape-counterplay','jealousy-third-party','vulnerability-crack','adult-intimacy','hidden-truth','multi-npc-pressure']) assert.ok(promptIds.has(id),'missing '+id);
const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','contract','lu_shen','relationship','pressure']) assert.ok(moduleIds.has(id),'missing '+id);
const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.deepEqual(ui.panels.map(x=>x.id),['now','contract','lushen','relationship']);
assert.ok(card.presentation.opening.choices.some(x=>x.includes('不簽')));
console.log('PASS debt-cage-lu-shen native adult female dark-romance card');
