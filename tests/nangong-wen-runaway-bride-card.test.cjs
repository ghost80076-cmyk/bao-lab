'use strict';

const assert = require('node:assert/strict');
const card = require('../data/characters/community/22/nangong-wen-runaway-bride.json');
const GameplayUI = require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'nangong-wen-runaway-bride');
assert.equal(card.meta.category, 'female');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'male');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/AUgowzF.jpg');
assert.equal(card.presentation.reading_background, card.meta.avatar);
assert.equal(card.presentation.play_info_surface, 'game-ui');

for (const pattern of [/青梅竹馬/, /豪門婚約/, /逃婚/, /病態獨佔/, /南宮玟/, /蘇晴/, /林燁/, /不是全知全能/, /真正有成功可能/]) {
  assert.match(card.content.system_prompt, pattern);
}

assert.doesNotMatch(card.content.greeting, /<p>|<hr>|hc-collapse|hc-btn|hc-stat/i);
assert.match(card.content.author_instructions, /榜一／榜二競爭/);
assert.match(card.content.author_instructions, /想逃？我等著/);
assert.match(card.content.system_prompt, /作品名稱不是 NPC/);

const promptIds = new Set(card.content.dynamic_prompts.map(x => x.id));
for (const id of ['escape-plan','nangong-pursuit','engagement-negotiation','suqing-thread','linye-thread','old-rivalry','boundary-breach','inner-thoughts','relationship-turn','time-skip','multi-npc']) {
  assert.ok(promptIds.has(id), 'missing dynamic prompt ' + id);
}

const moduleIds = new Set(card.gameplay.world_modules.map(x => x.id));
for (const id of ['player','scene','nangong','engagement','relationship','pursuit','supporting_cast','messages','open_threads','event_log']) {
  assert.ok(moduleIds.has(id), 'missing module ' + id);
}

const npcNames = card.gameplay.initial_state.npcs.map(x => x.name);
assert.deepEqual(npcNames, ['南宮玟','蘇晴','林燁']);
assert.ok(!npcNames.includes(card.meta.name));
assert.ok(!npcNames.includes(card.meta.title));

const ui = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.equal(ui.theme.preset, 'noir');
assert.deepEqual(ui.panels.map(x => x.id), ['now','nangong','engagement','relationship','pursuit','people','threads','actions']);

const builderKeys = new Set(ui.builder.fields.map(x => x.key));
for (const key of ['player_name','player_age','engagement_stance','inner_thoughts','tone']) {
  assert.ok(builderKeys.has(key), 'missing builder field ' + key);
}
assert.ok(ui.builder.fields.some(x => x.key === 'player_age' && x.min === 18));
assert.ok(ui.builder.fields.some(x => x.key === 'inner_thoughts' && x.options.includes('顯示') && x.options.includes('隱藏')));

assert.equal(card.gameplay.initial_state.modules.player.inner_thoughts, '隱藏');
assert.match(card.presentation.opening.posts.map(x => x.content).join('\n'), /不是全知/);
assert.match(card.presentation.opening.note, /Builder/);

console.log('PASS Nangong Wen runaway bride female dark romance card');
