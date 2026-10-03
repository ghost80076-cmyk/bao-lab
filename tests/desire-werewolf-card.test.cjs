'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const card = require('../data/characters/community/eb/desire-werewolf.json');
const catalog = require('../data/character-catalog/community/page-0001.json');
const manifest = require('../data/character-catalog/community/manifest.json');
const GameplayUI = require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'desire-werewolf');
assert.equal(card.meta.category, 'general');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'all');

const entry = catalog.find(item => item.id === card.meta.id);
assert.ok(entry, 'community catalog should include desire-werewolf');
assert.equal(entry.file, 'data/characters/community/eb/desire-werewolf.json');
assert.equal(entry.avatar, card.meta.avatar);
assert.equal(entry.rating, 'adult');
assert.equal(manifest.total, catalog.length);
assert.equal(manifest.pages[0].count, catalog.length);

const coverPath = path.join(__dirname, '..', card.meta.avatar);
assert.ok(fs.existsSync(coverPath), 'cover should exist');
const cover = fs.readFileSync(coverPath);
assert.equal(cover.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(cover.subarray(8, 12).toString('ascii'), 'WEBP');

assert.match(card.content.system_prompt, /21 歲以上成年人/);
assert.match(card.content.system_prompt, /黑手黨×2/);
assert.match(card.content.system_prompt, /偵探×1/);
assert.match(card.content.system_prompt, /女巫×1/);
assert.match(card.content.system_prompt, /玩家固定為 8 號/);
assert.match(card.content.system_prompt, /資訊隔離/);
assert.match(card.content.system_prompt, /成人內容屬可選演出層/);

const promptIds = new Set(card.content.dynamic_prompts.map(item => item.id));
for (const id of ['role-assignment', 'night-actions', 'day-discussion', 'voting', 'adult-layer', 'victory']) {
  assert.ok(promptIds.has(id), `missing dynamic prompt ${id}`);
}

const moduleIds = new Set(card.gameplay.world_modules.map(item => item.id));
for (const id of ['player_setup', 'match', 'alive_roster', 'eliminated', 'vote_tally', 'private_info', 'resources', 'history']) {
  assert.ok(moduleIds.has(id), `missing world module ${id}`);
}

const normalized = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(normalized, 'Gameplay UI schema should normalize');
assert.deepEqual(normalized.panels.map(panel => panel.id), ['match', 'roster', 'ability', 'history']);
assert.equal(normalized.theme.preset, 'arcane-night');

const opening = JSON.stringify(card.presentation.opening);
assert.doesNotMatch(opening, /<script\b/i);
assert.ok(card.presentation.opening.choices.includes('我準備好了，讓遊戲開始吧。'));

console.log('PASS desire-werewolf adult gate, deduction rules, catalog, cover and Gameplay UI');
