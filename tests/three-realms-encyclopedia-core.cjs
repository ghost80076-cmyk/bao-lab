const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-encyclopedia-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-encyclopedia-'));
const enabled = packs.map(p => p.meta.id);
const query = latestUser => core.select(packs, enabled, { latestUser, world: 'three-realms' });
assert.equal(packs.length, 5);
assert.equal(packs.flatMap(p => p.entries).length, 131);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(query('休息 修煉 法寶 靈獸 材料 丹藥 符籙 陣法 基本概念 等級').text, '');
assert.equal(core.select(packs, [], { latestUser: '築基丹' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '築基丹', world: 'sunrise-city' }).text, '');
for (const name of ['築基丹', '護山大陣', '火球符', '玄鐵重劍', '須彌戒', '靈獸進化']) {
  const found = query(name);
  assert.equal(found.entries.length, 1, name + ' recalls its own chapter');
  assert.ok(found.entries[0].title.endsWith('｜' + name));
  assert.ok(found.text.length <= 2200);
}
assert.doesNotMatch(query('築基丹').text, /### 聚氣丹|### 結金丹/);
assert.doesNotMatch(query('火球符').text, /### 雷擊符|### 萬劍符/);
assert.doesNotMatch(query('玄鐵重劍').text, /### 青鋒劍|### 飛虹劍/);
assert.match(query('平等契約').text, /可隨時解除/);
assert.match(query('靈獸契約步驟').text, /降服靈獸/);
// Existing substring matching can also recall the shorter generic item name.
// Longer names rank first; this does not bypass the shared budget.
const nested = query('定點傳送符');
assert.ok(nested.entries[0].title.endsWith('｜定點傳送符'));
assert.equal(nested.entries.length, 2);
const before = JSON.stringify(packs);
const overload = core.select(all, all.map(p => p.meta.id), {
  world: 'three-realms', latestUser: '天道宗 天心城 東南仙域 九霄神殿 築基丹 回春丹 神行符 法寶等級 靈獸血脈 靈獸進化'
});
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(JSON.stringify(packs), before, 'recall is read-only world data');
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 14);
assert.deepEqual(map.records.map(r => r.source_index), Array.from({length: 14}, (_, i) => i + 125));
const byId = new Map(packs.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));
const seen = new Set();
for (const source of map.records) {
  assert.match(source.source_sha256, /^[a-f0-9]{64}$/);
  let cursor = 0;
  for (const target of source.destinations) {
    assert.equal(target.start, cursor, 'every source span must be covered once');
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
console.log('Encyclopedia: 14 sources / 131 chapters, hashes, coverage, named recall, opt-in, world scope and shared budget passed.');
