'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/e9/sakura-gaslight-doll.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'sakura-gaslight-doll');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'female');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/A09MBlc.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');
assert.match(card.content.system_prompt,/玩家的反制可以成功/);
assert.match(card.content.system_prompt,/不要保證玩家一定被抓回/);
assert.match(card.content.system_prompt,/成人內容只在玩家已主動開啟成人顯示/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|📊 狀態欄/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['gaslight-contradiction','obedience-escalation','separation-panic','escape-counterplay','xiaoan-hidden-truth','third-party-jealousy','therapy-intervention','self-harm-crisis','adult-intimacy','multi-npc-information']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','relationship','clues','risk','recent_events']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.deepEqual(ui.panels.map(x=>x.id),['now','sakura','relationship','clues']);

const regex=card.import_metadata?.preserved_source?.extensions?.regex_scripts || [];
assert.equal(regex.length,1);
assert.equal(regex[0].findRegex,'【SAKURA_ENTRY】');
assert.match(regex[0].replaceString,/BAOAuthor\.draft/);
assert.match(regex[0].replaceString,/data-draft/);

console.log('PASS Sakura adult male-audience gaslight doll card, native Gameplay UI and author regex');
