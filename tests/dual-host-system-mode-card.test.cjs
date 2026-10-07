'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const card = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/db/dual-host-system-mode.json'), 'utf8'));
const regex = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/db/dual-host-system-mode.regex.json'), 'utf8'));
const GameplayUI = require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'dual-host-system-mode');
assert.equal(card.meta.creator, '班長');
assert.equal(card.meta.creator_id, 'banzhang');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/eG5DzIZ.jpg');

assert.match(card.content.system_prompt, /玩家本身就是系統/);
assert.match(card.content.system_prompt, /直接介入/);
assert.match(card.content.system_prompt, /NTR／NTL/);
assert.match(card.content.system_prompt, /系統化身/);

const promptIds = new Set(card.content.dynamic_prompts.map(x => x.id));
for (const id of ['dual-host-binding','system-control','relationship-route','system-avatar','campus-seed','task-conflict','time-skip']) {
  assert.ok(promptIds.has(id), 'missing dynamic prompt ' + id);
}

const moduleIds = new Set(card.gameplay.world_modules.map(x => x.id));
for (const id of ['system_core','system_avatar','host_a','host_b','relationship_web','task_a','task_b','system_effects','task_ledger']) {
  assert.ok(moduleIds.has(id), 'missing world module ' + id);
}

const ui = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
assert.ok(ui.builder);
assert.ok(ui.builder.fields.some(x => x.key === 'control_level'));
assert.ok(ui.builder.fields.some(x => x.key === 'visibility_mode'));
assert.ok(ui.builder.fields.some(x => x.key === 'route_focus'));
assert.deepEqual(ui.panels.map(x => x.id), ['system','host-a','host-b','relations','tasks','world','actions']);

assert.equal(regex.type, 'yorubay-author-regex-mod');
assert.equal(regex.characterId, card.meta.id);
assert.equal(regex.regex_scripts.length, 6);
for (const item of regex.regex_scripts) {
  assert.doesNotThrow(() => new RegExp(item.findRegex, item.flags || 'g'));
}
const openingRule = regex.regex_scripts.find(x => x.findRegex.includes('YB:SYS:OPENING'));
assert.ok(openingRule, 'missing opening regex');
assert.equal(new RegExp(openingRule.findRegex, openingRule.flags || 'g').test(card.content.greeting), true, 'opening regex must match the real greeting');
assert.ok(regex.regex_scripts.some(x => x.findRegex.includes('YB:SYS:CONTROL')));
assert.ok(regex.regex_scripts.some(x => x.findRegex.includes('YB:SYS:TASK')));

console.log('PASS dual host system mode card');
