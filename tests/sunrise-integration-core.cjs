const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('../js/worldbook-library-core.js');
const load = name => JSON.parse(fs.readFileSync(`data/${name}.json`, 'utf8'));
const plan = load('sunrise-integration-plan');
const pins = load('sunrise-migration-coverage');
const catalog = load('sunrise-worldbook-library');
const map = load('sunrise-geography-source-map');
const draft = load('sunrise-native-blueprint');
assert.equal(plan.entries.length, 183);
const counts = {};
plan.entries.forEach((item,i) => {
  assert.equal(item.source_index, i);
  assert.equal(item.source_sha256, pins.entries[i].source_sha256);
  assert.equal(item.publication_status, pins.entries[i].status);
  assert.equal(item.editorial_status, {complete:'reviewed-published',partial:'reviewed-published-sections',unreviewed:'needs-content-review'}[pins.entries[i].status]);
  assert.ok(item.targets.length);
  counts[item.route] = (counts[item.route] || 0) + 1;
});
assert.deepEqual(counts, plan.summary.routes);
assert.equal(plan.summary.native_or_template_sources, counts['native-mapping'] + counts['authoring-template']);
assert.deepEqual(plan.template_merge.sources, [7,178]);
assert.equal(plan.template_merge.shared_sections, 13);
assert.equal(plan.entries[175].route, 'authoring-template');
assert.equal(plan.entries[176].group, plan.entries[177].group);
assert.equal(plan.conflicts.filter(c => c.status === 'resolved').length, 30);
assert.equal(plan.conflicts.filter(c => c.status === 'unresolved').length, 25);
const decisions = new Map(plan.conflicts.map(c => [c.id,c]));
for (const source of map.sources) for (const chapter of source.chapters) {
  for (const id of chapter.reconciliation || []) assert.ok(decisions.has(id));
}
const packs = catalog.packs.map(core.normalizePack);
const ids = packs.map(p => p.meta.id);
const select = (query, enabled = ids) => core.select(packs, enabled, {latestUser:query,world:'sunrise-city'});
for (const query of ['曙光市警力','曙光市警局']) {
  const result = select(query);
  assert.match(result.text, /3,000|3000/);
  assert.doesNotMatch(result.text, /12,000/);
  assert.ok(result.text.length <= 2200);
}
const history = select('血色七月');
assert.match(history.text, /十五年前/);
assert.match(history.text, /故事開場/);
assert.doesNotMatch(history.text, /(?<!十)五年前「血色七月」|2017|源點計畫|學生失蹤|射殺/);
assert.equal(select('血色七月', []).text, '');
assert.equal(select('血色七月', ['sunrise-city-overview']).text, '');
assert.equal(select('你好').text, '');

// Exercise the actual native module adapter, not a copy of its validation.
const GameState = {
  current:null,
  create(character) { this.current = structuredClone(character.initial_state); return this.current; },
  applyUpdate() {}
};
const window = {};
vm.runInNewContext(fs.readFileSync('js/world-modules.js','utf8'), {
  window, GameState, WorldStateEngine:{}, structuredClone, console
});
const native = window.BAOWorldModules;
assert.equal(GameState.current, null, 'loading the draft must not create a story');
const c = draft.character_fragment;
window.App = {activeCharacter:c};
GameState.create(c);
assert.equal(native.definitions(c).length, 8);
for (const def of native.definitions(c)) {
  assert.ok(native.BUILT_INS[def.id], `reuse existing module ${def.id}`);
  const value = GameState.current.modules[def.id];
  assert.equal(Array.isArray(value), def.kind === 'collection');
  assert.equal(Object.keys(value).length, 0, 'do not invent resources or accepted quests');
}
GameState.applyUpdate({modules:{quests:[{name:'已確認委託'}], unrecognized:{value:99}}});
assert.equal(GameState.current.modules.quests[0].name, '已確認委託');
assert.equal(GameState.current.modules.unrecognized, undefined);
GameState.create({initial_state:{},world_modules:[]});
assert.equal(native.definitions({world_modules:[]}).length, 0, 'draft does not leak to other stories');
console.log('Sunrise integration: full routing, explicit conflicts, canonical recall and actual native module compatibility passed.');
