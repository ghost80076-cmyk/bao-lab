'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../js/gameplay-ui-core.js');

const card = JSON.parse(fs.readFileSync('data/characters/community/d0/awakened-silver-dawn.json', 'utf8'));

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'awakened-silver-dawn');
assert.equal(card.meta.category, 'general');
assert.equal(card.meta.rating, 'general');
assert.equal(card.meta.gender, 'all');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/BH3KBth.jpg');
assert.ok(card.meta.tags.includes('都市異能'));
assert.ok(card.meta.tags.includes('資訊隔離'));
assert.ok(card.meta.tags.includes('身體負荷'));

assert.equal(card.presentation.play_info_surface, 'game-ui');
assert.equal(card.presentation.reading_background, 'https://i.meee.com.tw/BH3KBth.jpg');
assert.equal(card.presentation.opening.choices.length, 4);
assert.doesNotMatch(card.content.greeting, /<script|onclick=|document\.execCommand/i);
assert.doesNotMatch(JSON.stringify(card), /<親密場景>|性喚起時的能量光芒|呻吟聲/);

assert.match(card.content.system_prompt, /AI 知道的事情 ≠ NPC 知道的事情 ≠ 玩家知道的事情/);
assert.match(card.content.system_prompt, /負荷是連續狀態，不是固定百分比公式/);
assert.match(card.content.system_prompt, /D→C→B→A→S→SS/);
assert.match(card.content.system_prompt, /玩家開局通常不知道/);
assert.match(card.content.system_prompt, /不要替玩家說話/);

const prompts = new Map(card.content.dynamic_prompts.map(item => [item.id, item]));
for (const id of ['opening-route', 'silver-power', 'container-load', 'combat', 'cleaners', 'free-alliance', 'abyss-cult', 'time-fragment', 'snow-fox', 'council', 'status-help']) {
  assert.ok(prompts.has(id), `missing dynamic prompt: ${id}`);
}
assert.match(prompts.get('opening-route').text, /不要讓四條路線一兩輪後全部收束成同一安全屋/);
assert.match(prompts.get('container-load').text, /load_estimate 只是 UI 可讀估計/);

const modules = new Map(card.gameplay.world_modules.map(module => [module.id, module]));
for (const id of ['player_profile', 'awakened', 'scene', 'factions', 'abilities', 'inventory', 'intel', 'threads']) {
  assert.ok(modules.has(id), `missing module: ${id}`);
}
assert.equal(modules.get('awakened').fields.find(field => field.key === 'load_estimate').type, 'meter');
assert.match(modules.get('awakened').fields.find(field => field.key === 'load_estimate').description, /不是硬判定公式/);

const statusFields = new Map(card.gameplay.character_status.fields.map(field => [field.key, field]));
for (const id of ['mood', 'condition', 'stance', 'known_about_player', 'current_goal', 'whereabouts']) {
  assert.ok(statusFields.has(id), `missing NPC status field: ${id}`);
}
assert.match(statusFields.get('known_about_player').description, /合理資訊路徑/);
assert.match(statusFields.get('whereabouts').description, /不作全知追蹤器/);

const ui = Core.normalize(card.gameplay.gameplay_ui);
assert.ok(ui, 'Gameplay UI should normalize');
assert.deepEqual(ui.panels.map(panel => panel.id), ['now', 'vessel', 'forces', 'abilities', 'intel', 'actions']);

const opening = ui.builder.fields.find(field => field.key === 'opening_route');
assert.deepEqual(opening.options, ['逃亡開局', '庇護開局', '意外開局', '自訂開局']);
const bias = ui.builder.fields.find(field => field.key === 'silver_bias');
assert.ok(bias.options.includes('短暫模仿'));
assert.ok(bias.options.includes('能量重構'));

const state = JSON.parse(JSON.stringify(card.gameplay.initial_state));
assert.equal(Core.applyBuilderValues(card.gameplay.gameplay_ui, {
  player_name: '黎央',
  player_gender: '不指定',
  age_identity: '26 歲研究助理',
  civilian_identity: '在城市大學研究室工作',
  opening_route: '逃亡開局',
  story_focus: '冷峻懸疑',
  silver_bias: '能量重構'
}, state), true);
assert.equal(state.modules.player_profile.name, '黎央');
assert.equal(state.modules.player_profile.opening_route, '逃亡開局');
assert.equal(state.modules.player_profile.story_focus, '冷峻懸疑');
assert.equal(state.modules.player_profile.silver_bias, '能量重構');

console.log('PASS Awakened Silver Dawn general world engine, native builder, continuous load model and information isolation');
