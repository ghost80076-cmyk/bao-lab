const assert = require('node:assert/strict');
const fs = require('node:fs');
const Core = require('../js/gameplay-ui-core.js');

const card = JSON.parse(fs.readFileSync('data/characters/community/8f/heart-contract-custom-lover.json', 'utf8'));

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'heart-contract-custom-lover');
assert.equal(card.meta.category, 'female');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'all');
assert.ok(card.meta.tags.includes('金錢系統'));
assert.ok(card.meta.tags.includes('國籍文化'));
assert.match(card.content.system_prompt, /成人內容只在玩家主動啟用成人模式後進入/);
assert.match(card.content.system_prompt, /真心可以發生，也可以沒有發生/);
assert.ok(Array.isArray(card.content.dynamic_prompts));
assert.ok(card.content.dynamic_prompts.some(item => item.id === 'money-contract'));
assert.ok(card.content.dynamic_prompts.some(item => item.id === 'culture'));
assert.ok(card.content.dynamic_prompts.some(item => item.id === 'adult-intimacy'));

const ui = Core.normalize(card.gameplay.gameplay_ui);
assert.ok(ui, 'Gameplay UI should normalize');
assert.ok(ui.builder.fields.length >= 12);
assert.ok(ui.panels.some(panel => panel.id === 'contract'));
assert.ok(ui.panels.some(panel => panel.id === 'relationship'));

const state = JSON.parse(JSON.stringify(card.gameplay.initial_state));
assert.equal(Core.applyBuilderValues(card.gameplay.gameplay_ui, {
  client_name: '林悅',
  client_age: 26,
  budget: 'NT$20,000',
  lover_gender: '男性',
  lover_nationality: '韓國',
  lover_age: 30,
  lover_personality: '冷淡疏離'
}, state), true);
assert.equal(state.modules.client.name, '林悅');
assert.equal(state.modules.client.age, 26);
assert.equal(state.modules.client.budget, 'NT$20,000');
assert.equal(state.modules.lover_request.nationality, '韓國');
assert.equal(state.modules.lover_request.age, 30);

console.log('Heart Contract custom lover card PASS');
