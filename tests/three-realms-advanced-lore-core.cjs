const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-advanced-lore-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-advanced-'));
const enabled = packs.map(p => p.meta.id);
const query = latestUser => core.select(packs, enabled, { latestUser, world: 'three-realms' });
assert.equal(packs.length, 6);
assert.equal(packs.flatMap(p => p.entries).length, 153);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(query('休息 修煉 血脈 法則 仙器 神通 靈根 基本概念 等級').text, '');
assert.equal(core.select(packs, [], { latestUser: '青霜仙劍' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '青霜仙劍', world: 'sunrise-city' }).text, '');
for (const [input, heading] of [['火靈血脈', '火靈血脈'], ['中界空間法則', '空間法則'], ['青霜仙劍', '青霜仙劍'], ['真龍仙血', '真龍仙血'], ['劍道神通', '劍道神通'], ['混沌靈根', '混沌靈根']]) {
  const found = query(input);
  assert.equal(found.entries.length, 1, input + ' recalls its own chapter');
  assert.ok(found.entries[0].title.endsWith('｜' + heading));
  assert.ok(found.text.length <= 2200);
}
assert.doesNotMatch(query('火靈血脈').text, /### 冰魄血脈|### 雷霆血脈/);
assert.doesNotMatch(query('真龍仙血').text, /【鳳凰仙血】|【麒麟仙血】/);
assert.doesNotMatch(query('劍道神通').text, /【拳道神通】|【掌道神通】/);
assert.doesNotMatch(query('混沌靈根').text, /【陰陽靈根】|【時空靈根】/);
assert.equal(query('饕餮血脈 窮奇血脈 天工仙爐').text, '');
const migrated = all.filter(p => p.meta.id.startsWith('three-realms-') && !p.meta.id.endsWith('-demo'));
const combined = latestUser => core.select(migrated, migrated.map(p => p.meta.id), { latestUser, world: 'three-realms' });
const identityPacks = new Set(['three-realms-encyclopedia-artifacts', 'three-realms-advanced-artifacts', 'three-realms-advanced-lower-bloodlines', 'three-realms-advanced-middle-bloodlines']);
// Existing substring recall may also bring in the material 不滅金, not either armor.
assert.equal(combined('不滅金身甲 器靈').entries.filter(e => identityPacks.has(e.pack)).length, 0);
const cases = [
  ['下界不滅金身甲', 'three-realms-encyclopedia-artifacts', /大羅金仙期/],
  ['中界不滅金身甲', 'three-realms-advanced-artifacts', /【防禦】提高防禦/],
  ['法寶器靈', 'three-realms-encyclopedia-artifacts', /四品以上仙器/],
  ['仙器器靈', 'three-realms-advanced-artifacts', /高階法寶的靈性/],
  ['下界饕餮血脈', 'three-realms-advanced-lower-bloodlines', /吞噬能力天下第一/],
  ['中界饕餮血脈', 'three-realms-advanced-middle-bloodlines', /修煉速度提升 300%/],
  ['下界血脈覺醒', 'three-realms-advanced-lower-bloodlines', /仙藥覺醒/],
  ['中界血脈覺醒', 'three-realms-advanced-middle-bloodlines', /藥物覺醒/]
];
for (const [input, pack, excluded] of cases) {
  const result = combined(input);
  assert.equal(result.entries.filter(e => identityPacks.has(e.pack)).length, 1, input);
  assert.equal(result.entries[0].pack, pack);
  assert.doesNotMatch(result.text, excluded);
}
const alchemy = combined('煉丹天工仙爐');
assert.equal(alchemy.entries.length, 1);
assert.match(alchemy.text, /天工仙爐（煉丹）/);
assert.match(alchemy.text, /【等級】七品/);
assert.doesNotMatch(alchemy.text, /【等級】五品/);
const smithing = combined('煉器天工仙爐');
assert.equal(smithing.entries.length, 1);
assert.match(smithing.text, /天工仙爐（煉器）/);
assert.match(smithing.text, /【等級】五品/);
assert.doesNotMatch(smithing.text, /【等級】七品/);
const before = JSON.stringify(migrated);
const overload = combined('天道宗 烏坦城 九霄神殿 築基丹 須彌戒 鬼市任務 仙帝宮 仙靈草 中界空間法則 青霜仙劍 真龍仙血 混沌靈根');
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(JSON.stringify(migrated), before, 'recall cannot mutate world data');
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 11);
assert.deepEqual(map.records.map(r => r.source_index), [139, 140, 147, 148, 149, 150, 151, 168, 169, 170, 171]);
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json', 'data/three-realms-lower-atlas-source-map.json', 'data/three-realms-middle-lore-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const priorIndices = new Set(priorMaps.flatMap(m => m.records.map(r => r.source_index)));
assert.ok(map.records.every(r => !priorIndices.has(r.source_index)));
const byId = new Map(packs.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));
const seen = new Set();
for (const source of map.records) {
  assert.match(source.source_sha256, /^[a-f0-9]{64}$/);
  let cursor = 0;
  for (const target of source.destinations) {
    assert.equal(target.start, cursor);
    assert.ok(target.end > target.start);
    const id = target.pack_id + ':' + target.entry_id;
    assert.ok(!seen.has(id)); seen.add(id);
    const entry = byId.get(id);
    assert.ok(entry);
    assert.equal(crypto.createHash('sha256').update(entry.content).digest('hex'), target.content_sha256);
    cursor = target.end;
  }
  assert.equal(cursor, source.source_chars);
}
assert.equal(seen.size, map.generated_entries);
assert.equal(seen.size, byId.size);
console.log('Advanced lore: 11 sources / 153 chapters, exact hashes, nested coverage, realm and craft collisions, opt-in and shared budget passed.');
