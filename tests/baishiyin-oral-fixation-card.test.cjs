'use strict';

const assert = require('node:assert/strict');
const card = require('../data/characters/general/baishiyin-oral-fixation.json');
const gameplayUI = require('../js/gameplay-ui-core.js');
const regexCore = require('../js/author-regex-core.js');
const fs = require('node:fs');
const path = require('node:path');

assert.equal(card.meta.id, 'baishiyin-oral-fixation');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.category, 'male');
assert.equal(card.presentation.play_info_surface, 'game-ui');
assert.equal(card.meta.avatar, 'assets/baishiyin-cover.webp');
const coverPath = path.join(__dirname, '..', card.meta.avatar);
assert.ok(fs.existsSync(coverPath), 'baishiyin cover should exist');
const cover = fs.readFileSync(coverPath);
assert.equal(cover.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(cover.subarray(8, 12).toString('ascii'), 'WEBP');

const source = JSON.stringify(card);
assert.doesNotMatch(source, /17\s*歲/, 'adult card must not retain underage character ages');
for (const stale of ['白妍晞', '陳宇軒', '鏡月']) {
  assert.ok(!source.includes(stale), `legacy name should be removed: ${stale}`);
}
for (const legacyExplicitUI of ['含入深度', '深喉', '普通口交', 'hardThrust']) {
  assert.ok(!source.includes(legacyExplicitUI), `single-act legacy UI should be removed: ${legacyExplicitUI}`);
}

assert.match(card.content.system_prompt, /所有可進入親密／成人互動的角色均明確為 18 歲以上成年人/);
assert.match(card.content.world, /明德私立大學/);
assert.match(card.content.world, /所有本作學生角色均為成年大學生/);

const npcs = card.gameplay.initial_state.npcs;
assert.ok(npcs.length >= 6);
for (const npc of npcs) {
  const match = String(npc.role || '').match(/(\d+)\s*歲/);
  assert.ok(match, `NPC age should be explicit: ${npc.name}`);
  assert.ok(Number(match[1]) >= 18, `NPC must be adult: ${npc.name}`);
}

const builder = card.gameplay.ui_schema.builder;
const age = builder.fields.find(field => field.key === 'player_age');
assert.ok(age, 'player age builder field is required');
assert.ok(age.min >= 18);
assert.ok(age.default >= 18);

const mode = builder.fields.find(field => field.key === 'story_mode');
assert.deepEqual(mode.options, ['淫慾模式', '戀愛模式', '支配模式', '劇情模式', '日常慢熱模式']);

const modules = new Map(card.gameplay.world_modules.map(module => [module.id, module]));
for (const id of ['player_profile', 'story_mode', 'scene', 'shiyin_state', 'risk', 'threads']) {
  assert.ok(modules.has(id), `missing module: ${id}`);
}
for (const key of ['oral_soothing', 'facade_stability', 'rebellion_impulse']) {
  const field = modules.get('shiyin_state').fields.find(item => item.key === key);
  assert.ok(field, `missing shiyin state field: ${key}`);
  assert.equal(field.type, 'meter');
}
assert.equal(modules.get('risk').fields.find(item => item.key === 'discovery_risk').type, 'meter');

const normalizedUI = gameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(normalizedUI, 'Gameplay UI schema should normalize');
assert.deepEqual(normalizedUI.panels.map(panel => panel.id), ['now', 'shiyin', 'risk', 'tools']);

const statusPrompt = card.gameplay.dynamic_prompts.find(item => item.id === 'status-panel-request');
assert.ok(statusPrompt);
for (const trigger of ['狀態面板', '狀態欄', '顯示狀態']) assert.ok(statusPrompt.triggers.includes(trigger));
assert.match(statusPrompt.text, /<YORUBAY_STATUS>/);
assert.match(statusPrompt.text, /(?:只|僅)使用目前世界狀態與玩家已知／可觀察資訊/);

const preserved = card.import_metadata?.preserved_source;
const sidecar = require('../data/characters/general/baishiyin-oral-fixation.regex.json');
assert.equal(sidecar.characterId, card.meta.id);
const rules = regexCore.normalize(sidecar);
assert.equal(rules.length, 1);
assert.equal(rules[0].reason, '');
assert.equal(rules[0].rich, true);
assert.equal(rules[0].script, false, 'status Regex UI must remain static/sandbox-friendly');

const sample = [
  '<YORUBAY_STATUS>',
  '場景：一年級 A 班・第八排靠窗',
  '時間：週三下午・第五節',
  '模式：日常慢熱模式',
  '白詩音：表面平靜',
  '口腔依賴：34',
  '外殼穩定：91',
  '越界衝動：18',
  '被發現風險：12',
  '觀察者：鏡淺',
  '進展：試探期',
  '親密張力：低',
  '</YORUBAY_STATUS>'
].join('\n');
const rendered = regexCore.render(sample, rules, false);
assert.equal(rendered.matched, true);
assert.equal(rendered.rich, true);
assert.match(rendered.html, /YORUBAY · STATUS/);
assert.match(rendered.html, /日常慢熱模式/);
assert.match(rendered.html, /只顯示玩家已知／可觀察資訊/);

// The formal sidecar must consume multiline and empty values without eating prose.
for (const fixture of [sample, sample.replaceAll('：', '： ').replaceAll('\n', '\r\n'), sample.replace('白詩音：表面平靜', '白詩音：').replace('觀察者：鏡淺', '觀察者：')]) {
  const surrounding = '正文前段。\n' + fixture + '\n正文後段。';
  const output = regexCore.render(surrounding, rules, false);
  assert.equal(output.matched, true);
  assert.match(output.html, /正文前段。/);
  assert.match(output.html, /正文後段。/);
  assert.doesNotMatch(output.html, /<YORUBAY_STATUS>/);
}
assert.equal(regexCore.render('正文中的場景：教室，時間：午後。', rules, false).matched, false);
assert.doesNotMatch(sidecar.regex_scripts[0].replaceString, /body\s*\{/);

const statusFields = new Map(card.gameplay.character_status.fields.map(field => [field.key, field]));
for (const key of ['trust', 'attraction', 'boundary', 'known_information']) assert.ok(statusFields.has(key));
assert.match(statusFields.get('attraction').description, /不等於同意/);
assert.match(statusFields.get('trust').description, /不代表同意/);

console.log('PASS Baishiyin adultization, five-mode builder, native status UI and static Regex panel');
