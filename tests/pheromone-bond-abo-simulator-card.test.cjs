'use strict';
const assert=require('node:assert/strict');
const card=require('../data/characters/community/94/pheromone-bond-abo-simulator.json');
const GameplayUI=require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version,'1.5');
assert.equal(card.meta.id,'pheromone-bond-abo-simulator');
assert.equal(card.meta.category,'female');
assert.equal(card.meta.rating,'adult');
assert.equal(card.meta.gender,'all');
assert.equal(card.meta.avatar,'https://i.meee.com.tw/nyIts73.jpg');
assert.equal(card.presentation.reading_background,card.meta.avatar);
assert.equal(card.presentation.play_info_surface,'game-ui');

assert.match(card.content.system_prompt,/ABO 是世界規則，不是人格模板/);
assert.match(card.content.system_prompt,/高相性只表示身體／信息素層面的反應更強，不能自動等於命定愛情/);
assert.match(card.content.system_prompt,/Beta 不是背景板/);
assert.doesNotMatch([card.content.system_prompt,card.content.author_instructions,...card.content.dynamic_prompts.map(x=>x.text)].join('\n'),/Builder|Gameplay UI|Dynamic Prompts|Regex|Persona/);
assert.doesNotMatch(card.content.greeting,/<hc-collapse|<hc-btn|<div class=|<style|<script/i);
assert.doesNotMatch(card.content.system_prompt,/Alpha天生強勢|Omega生而敏感|一見鍾情、難以抗拒吸引/);

const promptIds=new Set(card.content.dynamic_prompts.map(x=>x.id));
for(const id of ['pheromone-contact','compatibility-thread','cycle-onset','suppressant-use','marking-boundary','relationship-shift','multi-angle','social-pressure','political-conspiracy','offscreen-life','time-skip']) assert.ok(promptIds.has(id),'missing '+id);

const moduleIds=new Set(card.gameplay.world_modules.map(x=>x.id));
for(const id of ['player','scene','world_rules','focus_npc','relationship','cycle','medicine','cast','threads','messages','event_log']) assert.ok(moduleIds.has(id),'missing '+id);

const ui=GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset,'noir');
assert.equal(ui.theme.accent,'#b66b8f');
assert.deepEqual(ui.panels.map(x=>x.id),['now','you','focus','relationship','biology','world','actions']);
assert.ok(ui.builder);
for(const key of ['player_secondary_gender','pheromone_scent','pairing_type','world_style','relationship_tone','compatibility_rule','cast_mode','cycle_intensity','inner_thoughts']) assert.ok(ui.builder.fields.some(x=>x.key===key),'missing builder '+key);
assert.ok(card.presentation.opening.choices.length>=4);

console.log('PASS pheromone bond ABO simulator card');
