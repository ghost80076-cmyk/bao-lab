'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {loadWorkerTestSource} = require('./helpers/worker-test-source.cjs');
const engine = vm.runInNewContext(fs.readFileSync('js/character.js', 'utf8') + ';CharacterEngine', {structuredClone});
const plain = value => JSON.parse(JSON.stringify(value));
const studioSource = fs.readFileSync('js/character-studio.js', 'utf8');
const exportBody = studioSource.slice(studioSource.indexOf('  function toExport('), studioSource.indexOf('  async function builtinIds('));
const studioExport = new Function('engine', 'clone', exportBody + ';return toExport;')(engine, structuredClone);
const adminSource = fs.readFileSync('js/admin-character-publish.js', 'utf8');
const adminBody = adminSource.slice(adminSource.indexOf('  function safeImportMetadata('), adminSource.indexOf('  function renderAudit('));
const {prepareCharacterPublication} = new Function(loadWorkerTestSource().replace(/export\s+default\s+\{/, 'const worker = {') + ';return {prepareCharacterPublication};')();

const card = JSON.parse(fs.readFileSync('data/characters/community/c4/kept-in-frame-lin-youzhen.json', 'utf8'));
card.meta.discovery = {category: 'female', rating: 'general'};
card.content.greeting_context = '開場前已確認的背景';
card.gameplay.actor_mode = {enabled: true, role_active: false, default_role: {label: '攝影師'}};
card.gameplay.timeline_policy = {mode: 'continuous'};
card.presentation.reading_background = 'https://example.com/background.png';
card.presentation.play_info_surface = 'game-ui';
card.presentation.phone_ui = {enabled: true, userName: '玩家', contacts: [{id: 'friend', name: '朋友'}], threads: [{id: 'group', name: '群組', participants: ['friend'], messages: []}], notes: [{id: 'note', title: '便條', text: '待辦'}]};
card.presentation.dialogue = {version: 1, mode: 'avatar_chat', cast: []};
card.presentation.opening = {type: 'basic', label: '開場', posts: [{kind: 'character', content: '雨聲。'}], choices: ['進門'], note: ''};
card.asset_manifest = {version: 1, assets: []};
card.import_metadata = {preserved_source: {private: 'not-for-publication'}};
const original = JSON.stringify(card);
const expected = plain(engine.normalize(card));
const capabilities = ['author', 'author_id', 'creator', 'creator_id', 'story_startup', 'timeline_policy', 'actor_mode', 'gameplay_ui', 'phone_ui', 'dialogue', 'reading_background', 'opening', 'play_info_surface', 'greeting_context', 'asset_manifest', 'discovery', 'initial_state'];
function sameCapabilities(result, label, worker = false) {
  const normalized = plain(engine.normalize(result));
  for (const key of capabilities.filter(key => !worker || key !== "asset_manifest")) assert.deepEqual(normalized[key], expected[key], label + ': ' + key);
}
function adminExport(input) {
  const c = engine.normalize(input);
  const values = {'publish-id': c.id, 'publish-name': c.name, 'publish-title': c.title, 'publish-category': c.category, 'publish-rating': c.rating};
  return new Function('engine', 'state', '$', 'tagsFromInput', adminBody + ';return buildCard();')(
    engine, {sourceCard: input, character: c}, id => ({value: values[id] || ''}), () => c.tags);
}
for (const [format, input] of [['native', card], ['flat', engine.normalize(card)]]) {
  const exported = studioExport(input);
  sameCapabilities(exported, format + ' studio export');
  for (const key of ['author', 'author_id', 'creator', 'creator_id']) {
    assert.equal(exported.meta[key], expected[key], format + ' studio meta attribution: ' + key);
  }
  sameCapabilities(studioExport(exported), format + ' second studio export');
  assert.equal(exported.import_metadata, undefined, 'normal JSON export does not include private provenance');
  const published = adminExport(input);
  sameCapabilities(published, format + ' admin payload');
  for (const key of ['author', 'author_id', 'creator', 'creator_id']) {
    assert.equal(published.meta[key], expected[key], format + ' admin meta attribution: ' + key);
  }
  assert.ok(!JSON.stringify(published).includes('not-for-publication'));
  const prepared = prepareCharacterPublication({rights_confirmed: true, card: published});
  sameCapabilities(prepared.card, format + ' worker publication', true);
  assert.equal(prepared.card.asset_manifest, undefined, 'an empty asset manifest is omitted by the publication Worker');
}
// The admin form must show exactly the credit already present on flat and
// native cards; otherwise the independent author-license actions use blanks.
const fillBody = adminSource.slice(adminSource.indexOf('  function fillForm('), adminSource.indexOf('  async function parseSelectedFile('));
function formFor(input) {
  const fields = Object.create(null);
  const elements = name => fields[name] ||= { value: '', textContent: '' };
  const state = {};
  const fill = new Function('engine', 'state', '
const empty = studioExport({id: 'empty', name: 'Empty', greeting: 'Hi', system_prompt: 'Setting'});
for (const key of ['story_startup', 'actor_mode', 'timeline_policy']) assert.equal(empty.gameplay[key], undefined);
assert.equal(empty.presentation.phone_ui, undefined, 'basic cards must not gain a phone');
console.log('Native/flat studio → JSON → admin → Worker capability preservation passed');

const minimal = studioExport({id: 'no-author', name: '未署名', greeting: '開始', system_prompt: '世界'});
for (const key of ['author', 'author_id', 'creator', 'creator_id']) assert.equal(Object.hasOwn(minimal.meta, key), false, 'no invented author: ' + key);
, fillBody + ';return fillForm;')(engine, state, elements);
  fill(input, 'JSON');
  return fields;
}
const flatCredit = formFor({id: 'flat-credit', name: '測試', author: '作者甲', author_id: 'credit-one'});
assert.equal(flatCredit['publish-author'].value, '作者甲');
assert.equal(flatCredit['publish-author-id'].value, 'credit-one');
const nativeCredit = formFor({meta: {id: 'native-credit', name: '測試', author: '作者乙', author_id: 'credit-two'}});
assert.equal(nativeCredit['publish-author'].value, '作者乙');
assert.equal(nativeCredit['publish-author-id'].value, 'credit-two');
const noCredit = formFor({id: 'unsigned', name: '測試'});
assert.equal(noCredit['publish-author'].value, '');
assert.equal(noCredit['publish-author-id'].value, '');

assert.equal(JSON.stringify(card), original, 'roundtrip must not mutate the source');
const empty = studioExport({id: 'empty', name: 'Empty', greeting: 'Hi', system_prompt: 'Setting'});
for (const key of ['story_startup', 'actor_mode', 'timeline_policy']) assert.equal(empty.gameplay[key], undefined);
assert.equal(empty.presentation.phone_ui, undefined, 'basic cards must not gain a phone');
console.log('Native/flat studio → JSON → admin → Worker capability preservation passed');

const minimal = studioExport({id: 'no-author', name: '未署名', greeting: '開始', system_prompt: '世界'});
for (const key of ['author', 'author_id', 'creator', 'creator_id']) assert.equal(Object.hasOwn(minimal.meta, key), false, 'no invented author: ' + key);
