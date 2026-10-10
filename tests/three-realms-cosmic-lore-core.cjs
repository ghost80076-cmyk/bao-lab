const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-cosmic-lore-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-cosmic-'));
const enabled = packs.map(p => p.meta.id);
const query = latestUser => core.select(packs, enabled, { latestUser, world: 'three-realms' });
assert.equal(packs.length, 7);
for (const pack of catalog.packs.filter(p => p.meta.id.startsWith('three-realms-cosmic-'))) {
  assert.deepEqual(core.normalizePack(pack).entries.map(e => e.keywords), pack.entries.map(e => e.keywords), 'normalization must preserve all reviewed keywords');
  assert.ok(pack.entries.every(e => e.keywords.every(k => !/[\r\n]/.test(k))));
}
assert.equal(packs.flatMap(p => p.entries).length, 100);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(query('休息 修煉 上界 天劫 氣運 因果 血脈 法則 神器 基本概念 等級').text, '');
assert.equal(core.select(packs, [], { latestUser: '祖龍神血' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '祖龍神血', world: 'sunrise-city' }).text, '');
for (const [input, heading] of [['九九天劫', '突破天劫'], ['金色氣運', '金色氣運'], ['血債因果', '血債因果'], ['神王期', '神王期'], ['神人丹', '神藥系統'], ['金之神法則', '金之神法則'], ['祖龍神血', '祖龍神血']]) {
  const result = query(input);
  assert.equal(result.entries.length, 1, input);
  assert.ok(result.entries[0].title.endsWith('｜' + heading));
  assert.ok(result.text.length <= 2200);
}
assert.doesNotMatch(query('金色氣運').text, /【七彩氣運】|【紫色氣運】/);
assert.doesNotMatch(query('祖龍神血').text, /【始鳳神血】|【元麒神血】/);
assert.doesNotMatch(query('金之神法則').text, /【木之神法則】|【火之神法則】/);
assert.doesNotMatch(query('神王期').text, /【神皇期】|【神君期】/);
assert.match(query('神石兌換比例').text, /1 中品 = 10000 下品/);
assert.equal(query('混沌神石 混沌神血脈 器靈 因果法則').text, '');
const migrated = all.filter(p => p.meta.id.startsWith('three-realms-') && !p.meta.id.endsWith('-demo'));
const combined = latestUser => core.select(migrated, migrated.map(p => p.meta.id), { latestUser, world: 'three-realms' });
for (const [input, pack, excluded] of [
  ['中界金之法則', 'three-realms-advanced-laws', /金之神法則/],
  ['金之神法則', 'three-realms-cosmic-upper-laws', /### 金之法則/],
  ['神器器靈', 'three-realms-cosmic-upper-resources', /四品以上仙器|高階法寶的靈性/],
  ['法寶器靈', 'three-realms-encyclopedia-artifacts', /所有神器都有器靈/],
  ['因果基本法則', 'three-realms-cosmic-karma', /### 因果法則修煉/],
  ['因果法則修煉', 'three-realms-cosmic-karma', /## 因果法則\n/],
  ['混沌神血類型', 'three-realms-cosmic-upper-bloodlines', /【混沌神血脈】/],
  ['煉器混沌神石', 'three-realms-cosmic-upper-resources', /兌換比例/],
  ['貨幣混沌神石', 'three-realms-cosmic-upper-resources', /煉製混沌神器/],
]) {
  const result = combined(input);
  assert.equal(result.entries.length, 1, input);
  assert.equal(result.entries[0].pack, pack);
  assert.doesNotMatch(result.text, excluded);
}
const before = JSON.stringify(migrated);
const overload = combined('天道宗 烏坦城 九霄神殿 築基丹 鬼市任務 仙帝宮 仙靈草 中界空間法則 青霜仙劍 真龍仙血 混沌靈根 五行天劫 金色氣運 血債因果 祖龍神血 金之神法則 神人丹 上界飛升');
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(JSON.stringify(migrated), before, 'lore recall cannot mutate world state');
// The exported upper bloodline source stops at 吞噬提純; do not invent missing methods.
const partial = query('上界血脈提純').text;
assert.match(partial, /吞噬提純/);
assert.doesNotMatch(partial, /煉化提純|返祖提純|天劫提純/);
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 9);
assert.deepEqual(map.records.map(r => r.source_index), [163, 164, 165, 166, 167, 186, 188, 189, 190]);
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json', 'data/three-realms-lower-atlas-source-map.json', 'data/three-realms-middle-lore-source-map.json', 'data/three-realms-advanced-lore-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
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
console.log('Cosmic lore: 9 sources / 100 chapters, exact coverage, precise recall, realm and resource collisions, opt-in and shared budget passed.');
