'use strict';
const assert = require('node:assert/strict');
const card = require('../data/characters/community/1f/baitao-roommate-triangle.json');
const GameplayUI = require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'baitao-roommate-triangle');
assert.equal(card.meta.category, 'male');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'female');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/80Nq2T6.jpg');
assert.ok(card.meta.tags.includes('三角關係'));
assert.ok(card.meta.tags.includes('NTR分支'));
assert.ok(card.meta.tags.includes('原生狀態UI'));

assert.equal(card.gameplay.character_status.primary_character_name, '白桃奶昔');
assert.match(card.content.system_prompt, /【三人資訊落差】/);
assert.match(card.content.system_prompt, /林宇軒不是為了製造 NTR 而存在的工具人/);
assert.match(card.content.system_prompt, /三個人都是真正的角色/);
assert.match(card.content.system_prompt, /三人同居的第一天/);
assert.match(card.content.system_prompt, /慾望不等於行動/);

assert.ok(Array.isArray(card.content.dynamic_prompts));
for (const id of ['baitao-roommate-life','baitao-attention-needs','baitao-triangle-pressure','baitao-yuxuan-awareness','baitao-public-life','baitao-adult-intimacy','baitao-time-skip']) {
  assert.ok(card.content.dynamic_prompts.some(item => item.id === id), 'missing '+id);
}

const moduleIds = new Set(card.gameplay.world_modules.map(x => x.id));
for (const id of ['scene','player','baitao','yuxuan','triangle','evidence','scene_participants','known_people','open_threads','recent_events']) {
  assert.ok(moduleIds.has(id), 'missing '+id);
}

const npcNames = card.gameplay.initial_state.npcs.map(x => x.name);
assert.deepEqual(npcNames, ['白桃奶昔','林宇軒']);
assert.ok(!npcNames.includes(card.meta.name));
assert.ok(!card.gameplay.initial_state.modules.known_people.some(x => x.includes(card.meta.name)));
assert.ok(!card.gameplay.initial_state.modules.known_people.some(x => x.includes(card.meta.title)));

const ui = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui, 'Gameplay UI should normalize');
assert.deepEqual(ui.panels.map(x => x.id), ['now','people','triangle','threads','actions']);
const ageField = card.gameplay.ui_schema.builder.fields.find(x => x.key === 'age');
assert.equal(ageField.min, 23);
assert.equal(ageField.max, 27);

assert.equal(card.presentation.play_info_surface, 'game-ui');
assert.equal(card.presentation.reading_background, 'https://i.meee.com.tw/80Nq2T6.jpg');
assert.doesNotMatch(card.content.greeting, /<hc-card|<hc-collapse|<!--/i);
assert.ok(card.presentation.opening.choices.length >= 4);
console.log('PASS baitao roommate triangle card');
