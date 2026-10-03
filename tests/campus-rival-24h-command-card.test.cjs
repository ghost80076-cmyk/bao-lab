'use strict';
const assert = require('node:assert/strict');
const card = require('../data/characters/community/2a/campus-rival-24h-command.json');
const GameplayUI = require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'campus-rival-24h-command');
assert.equal(card.meta.category, 'male');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'female');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/NT68Wxx.jpg');
assert.ok(card.meta.tags.includes('24H倒數'));
assert.ok(card.meta.tags.includes('契約奇幻'));
assert.ok(card.meta.tags.includes('權力反轉'));
assert.ok(card.meta.tags.includes('慢熱淪陷'));
assert.match(card.content.system_prompt, /凌薇然 20 歲/);
assert.match(card.content.system_prompt, /親密命令可以成為這張卡的權力攻防與衝突來源/);
assert.match(card.content.system_prompt, /24 小時結束時契約沒有被解除/);
assert.match(card.content.system_prompt, /命令權交換到玩家手上/);
assert.equal(card.gameplay.character_status.primary_character_name, '凌薇然');
assert.ok(Array.isArray(card.content.dynamic_prompts));
for (const id of ['contract-rules','command-resolution','public-rivalry','deadline-pressure','npc-pressure','adult-boundary','power-reversal']) {
  assert.ok(card.content.dynamic_prompts.some(item => item.id === id), 'missing '+id);
}
const moduleIds = new Set(card.gameplay.world_modules.map(x => x.id));
for (const id of ['player','scene','contract','weiran','penalty','power_game','relationship','social']) assert.ok(moduleIds.has(id), 'missing '+id);
const ui = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui, 'Gameplay UI should normalize');
assert.deepEqual(ui.panels.map(x => x.id), ['now','contract','weiran','power','relationship']);
assert.equal(card.presentation.play_info_surface, 'game-ui');
assert.equal(card.presentation.reading_background, 'https://i.meee.com.tw/NT68Wxx.jpg');
assert.doesNotMatch(card.content.greeting, /<hc-collapse|<p class=|<div class=/i);
assert.ok(card.presentation.opening.choices.length >= 4);
console.log('PASS campus rival 24H command card');
