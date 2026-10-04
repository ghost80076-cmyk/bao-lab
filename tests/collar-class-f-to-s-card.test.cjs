'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/d6/collar-class-f-to-s.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'collar-class-f-to-s');
assert.equal(card.meta.category,'male');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/EdbPQnS.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/階級不是人格/);
assert.match(card.content.system_prompt,/六軸養成/);
assert.match(card.content.system_prompt,/升階不是經驗值滿自動升級/);
assert.match(card.content.system_prompt,/所有可進入成人市場.*21 歲以上/);
assert.match(card.content.system_prompt,/男性向鏡頭/);
assert.match(card.content.system_prompt,/付款.*不等於.*同意|階級.*不等於.*同意/);
assert.match(card.content.system_prompt,/NPC 不會在玩家離開後凍結/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|<hc-btn|世界引擎私語/i);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['browse-market','f-to-s-growth','rank-review','finance-pressure','relationship-shift','adult-intimacy','class-contrast','offscreen-life','contract-sponsor','public-review']) {
  assert.ok(promptIds.has(id),'missing '+id);
}

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player_finance','scene','market','focus_npc','growth','relationship','contracts','people','event_log','private_world']) {
  assert.ok(moduleIds.has(id),'missing '+id);
}

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#b86a78');
assert.deepEqual(ui.panels.map(x=>x.id),['now','wallet','market','focus','growth','relationship','contracts','people','events']);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x=>x.key==='start_route'));
assert.ok(ui.builder.fields.some(x=>x.key==='story_focus'));
assert.ok(ui.builder.fields.some(x=>x.key==='class_intensity'));
assert.ok(!ui.panels.some(panel=>JSON.stringify(panel).includes('private_world')),'private world state must not be player-visible');

const growth=card.gameplay.initial_state.modules.growth;
for(const key of ['presentation','social','market_skill','intimacy_openness','autonomy']) assert.ok(Object.hasOwn(growth,key),'missing growth '+key);
const rel=card.gameplay.initial_state.modules.relationship;
for(const key of ['trust','affection','dependency','fear','boundary']) assert.ok(Object.hasOwn(rel,key),'missing relationship '+key);

assert.ok(card.presentation.opening.choices.length>=5);
assert.match(card.presentation.opening.posts.map(x=>x.content).join('\n'),/S 級/);
assert.match(card.presentation.opening.posts.map(x=>x.content).join('\n'),/F 級/);

console.log('PASS Collar Class F-to-S world card');
