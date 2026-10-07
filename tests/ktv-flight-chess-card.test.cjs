'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const GameplayUI = require('../js/gameplay-ui-core.js');

const root = path.join(__dirname, '..');
const card = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/eb/ktv-flight-chess.json'), 'utf8'));
const regex = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/eb/ktv-flight-chess.regex.json'), 'utf8'));

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'ktv-flight-chess');
assert.equal(card.meta.name, '🔥 KTV飛行棋');
assert.equal(card.meta.creator, '班長');
assert.equal(card.meta.creator_id, 'banzhang');
assert.equal(card.meta.rating, 'adult');

assert.match(card.content.system_prompt, /四人局/);
assert.match(card.content.system_prompt, /高級版（40格）/);
assert.match(card.content.system_prompt, /SM版（49格）/);
assert.match(card.content.system_prompt, /狀態連續/);
assert.doesNotMatch(card.content.system_prompt, /所有參與者都必須是 18\+|逐次同意|Traffic-light|Aftercare/);

const moduleIds = new Set(card.gameplay.world_modules.map(x => x.id));
for (const id of ['game_progress','player_state','npc_1_state','npc_2_state','npc_3_state','party_relations','scene_traces','props','game_log']) {
  assert.ok(moduleIds.has(id), 'missing module ' + id);
}

const ui = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(ui);
const builderKeys = new Set(ui.builder.fields.map(x => x.key));
for (const key of ['game_variant','npc_combo','party_origin','pace','tone','sm_role','custom_note']) assert.ok(builderKeys.has(key));
assert.equal(builderKeys.has('player_age'), false);
assert.equal(builderKeys.has('media_default'), false);
assert.deepEqual(ui.panels.map(x => x.id), ['game','party','relations','scene','actions']);

assert.equal(regex.type, 'yorubay-author-regex-mod');
assert.equal(regex.characterId, card.meta.id);
assert.equal(regex.regex_scripts.length, 5);
for (const item of regex.regex_scripts) assert.doesNotThrow(() => new RegExp(item.findRegex, item.flags || 'g'));
const opening = regex.regex_scripts.find(x => x.findRegex.includes('YB:KTV:OPENING'));
assert.ok(opening);
assert.equal(new RegExp(opening.findRegex, opening.flags || 'g').test(card.content.greeting), true, 'opening regex must match actual greeting');

console.log('PASS KTV flight chess v3');
