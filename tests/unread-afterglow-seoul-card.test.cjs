'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UI = require('../js/gameplay-ui-core.js');
const root = path.join(__dirname, '..');
const card = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/9c/unread-afterglow-seoul.json'), 'utf8'));
const regex = JSON.parse(fs.readFileSync(path.join(root, 'data/characters/community/9c/unread-afterglow-seoul.regex.json'), 'utf8'));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/page-0001.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'data/character-catalog/community/manifest.json'), 'utf8'));

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'unread-afterglow-seoul');
assert.equal(card.meta.name, '未讀餘溫｜首爾關係觀察誌');
assert.equal(card.meta.creator, '班長');
assert.equal(card.meta.creator_id, 'banzhang');
assert.equal(card.meta.rating, 'general');
assert.ok(card.content.greeting.length > 130);
assert.doesNotMatch(card.content.greeting, /<style|<div|<script|【YB:/i);
assert.match(card.content.system_prompt, /現場觀察/);
assert.match(card.content.system_prompt, /聯絡回音/);
assert.match(card.content.system_prompt, /關係求證/);

const platformJargon = /Builder|Gameplay UI|Dynamic Prompts|Author Regex|作者 Regex|\bRegex\b|Persona|原生 Gameplay UI|原生狀態 UI|夜灣原生 UI|不得替玩家|不能替玩家|不替玩家/;
const modelText = [card.content.system_prompt, card.content.npc_rules, card.content.author_instructions, ...card.content.dynamic_prompts.map(x => x.text)].join('\n');
assert.doesNotMatch(modelText, platformJargon);

const moduleIds = new Set(card.gameplay.world_modules.map(x => x.id));
for (const id of ['session_setup', 'scene', 'focus_person', 'public_bond', 'people', 'signal_ledger', 'contact_log', 'planned_events', 'recent_events', 'relationship_edges', 'offscreen_facts'])
  assert.ok(moduleIds.has(id), 'missing world module: ' + id);
const promptIds = new Set(card.content.dynamic_prompts.map(x => x.id));
for (const id of ['afterglow-kkt', 'afterglow-social', 'afterglow-group', 'afterglow-evidence', 'afterglow-third', 'afterglow-distance', 'afterglow-time', 'afterglow-commitment'])
  assert.ok(promptIds.has(id), 'missing dynamic prompt: ' + id);

const normalized = UI.normalize(card.gameplay.ui_schema);
assert.ok(normalized, 'UI schema normalization failed');
assert.equal(normalized.theme.preset, 'noir');
assert.deepEqual(normalized.panels.map(p => p.id), ['now', 'people', 'signals', 'messages', 'events', 'actions']);
const uiById = Object.fromEntries(normalized.panels.map(panel => [panel.id, panel]));
assert.equal(uiById.signals.sections[1].type, 'cards');
assert.equal(uiById.signals.sections[1].variant, 'quest');
assert.equal(uiById.messages.sections[0].type, 'cards');
assert.equal(uiById.messages.sections[1].type, 'cards');
assert.ok(card.gameplay.initial_state.modules.signal_ledger[0].summary.includes('兩人關係未確認'));
assert.ok(card.gameplay.initial_state.modules.people.every(item => typeof item === 'string'));
const paths = [];
for (const panel of normalized.panels) for (const section of panel.sections) {
  if (section.path) paths.push(section.path);
  for (const item of section.items || []) if (item.path) paths.push(item.path);
}
for (const field of normalized.builder.fields) assert.ok(UI.isTargetPath(field.target_path), 'invalid builder target: ' + field.target_path);
for (const display of paths) {
  assert.ok(UI.isDisplayPath(display), 'invalid display path: ' + display);
  assert.notEqual(UI.getPath(card.gameplay.initial_state, display), undefined, 'unbound display path: ' + display);
  assert.doesNotMatch(display, /^modules\.(?:relationship_edges|offscreen_facts)/, 'private relationship data leaked to UI');
}
const keys = new Set(normalized.builder.fields.map(f => f.key));
for (const key of ['social_overlap', 'contact_rhythm', 'social_circle', 'tempo', 'address_style', 'extra_note']) assert.ok(keys.has(key), 'builder missing ' + key);
const alternate = structuredClone(card.gameplay.initial_state);
assert.equal(UI.applyBuilderValues(card.gameplay.ui_schema, {
  social_overlap: '高度重疊',
  contact_rhythm: '社群互動較頻繁',
  social_circle: '城市夜生活',
  address_style: '較熟時用暱稱',
  tempo: '一般都市節奏',
  extra_note: '彼此兩週沒聯絡'
}, alternate), true, 'builder state was not written');
assert.equal(alternate.modules.session_setup.social_overlap, '高度重疊');
assert.equal(alternate.modules.session_setup.contact_rhythm, '社群互動較頻繁');
assert.equal(alternate.modules.session_setup.social_circle, '城市夜生活');
assert.equal(alternate.modules.session_setup.address_style, '較熟時用暱稱');
assert.equal(alternate.modules.session_setup.extra_note, '彼此兩週沒聯絡');

assert.equal(regex.characterId, card.meta.id);
assert.equal(regex.type, 'yorubay-author-regex-mod');
assert.equal(regex.regex_scripts.length, 2);
const sample = '【週六 00:17｜住處】\n雨還在下。\n\nKKT｜00:17\n姜允載：還沒睡？\n\nInstagram Story｜00:18\n姜允載看過你的 Story。\n\n手機重新暗下去。';
let html = sample;
for (const rule of regex.regex_scripts) {
  const compiled = new RegExp(rule.findRegex, rule.flags || 'g');
  assert.match(sample, compiled, 'regex did not match real multiline output: ' + rule.scriptName);
  assert.doesNotMatch(rule.replaceString, /font-size\s*:\s*\d|!important|<script|javascript:|onerror=/i);
  html = html.replace(compiled, rule.replaceString);
}
assert.match(html, /yb-afterglow-notice/);
assert.match(html, /姜允載：還沒睡？/);
assert.match(html, /姜允載看過你的 Story/);
assert.match(html, /雨還在下/);
assert.match(html, /手機重新暗下去/);
assert.equal('沒有通知的普通敘事。'.replace(new RegExp(regex.regex_scripts[0].findRegex, 'gm'), regex.regex_scripts[0].replaceString), '沒有通知的普通敘事。');
assert.ok(!html.includes('【YB:'), 'raw semantic marker leaked');
assert.ok(!sample.includes('<aside'), 'text mode should remain readable plain text');

const published = catalog.find(x => x.id === card.meta.id);
assert.ok(published, 'catalog entry missing');
assert.equal(published.file, 'data/characters/community/9c/unread-afterglow-seoul.json');
assert.equal(published.author, '班長');
assert.equal(published.author_id, 'banzhang');
assert.equal(manifest.total, catalog.length);
assert.equal(manifest.pages[0].count, catalog.length);
console.log('PASS unread afterglow native card, builder state, UI, regex, text fallback, catalog');
