const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-lower-atlas-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-atlas-'));
const enabled = packs.map(p => p.meta.id);
const query = latestUser => core.select(packs, enabled, { latestUser, world: 'three-realms' });
assert.equal(packs.length, 6);
assert.equal(packs.flatMap(p => p.entries).length, 93);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(query('休息 修煉 散修 商會 秘境 妖獸 特殊勢力 基本概念 等級').text, '');
assert.equal(core.select(packs, [], { latestUser: '烏坦城' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '烏坦城', world: 'sunrise-city' }).text, '');
for (const name of ['烏坦城', '青雲城', '自由盟', '龍淵秘境', '天心拍賣行', '天狼族', '太虛古龍', '血魔宗', '合歡宗', '鬼市令牌']) {
  const found = query(name);
  assert.equal(found.entries.length, 1, name + ' recalls its own chapter');
  assert.ok(found.entries[0].title.endsWith('｜' + name));
  assert.ok(found.text.length <= 2200);
}
assert.match(query('烏坦城').text, /北方大陸重要城市/);
assert.doesNotMatch(query('烏坦城').text, /## 青雲城|## 古城/);
assert.doesNotMatch(query('青雲城').text, /北方大陸|烏坦城|條目類型/);
assert.doesNotMatch(query('天狼族').text, /### 金翅大鵬族|### 九尾天狐族/);
assert.match(query('藥塵').text, /煉丹術下界第一/);
assert.match(query('天狼王').text, /領地：萬妖森林北部/);
assert.match(query('鬼市位置').text, /天心城地下/);
assert.doesNotMatch(query('鬼市位置').text, /鬼市著名事件|鬼市任務/);
const overload = core.select(all, all.map(p => p.meta.id), {
  world: 'three-realms', latestUser: '天道宗 天心城 東南仙域 九霄神殿 築基丹 須彌戒 烏坦城 自由盟 龍淵秘境 天狼族 血魔宗 鬼市任務'
});
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 24);
assert.deepEqual(map.records.map(r => r.source_index), Array.from({length: 24}, (_, i) => i + 101));
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const priorIndices = new Set(priorMaps.flatMap(m => m.records.map(r => r.source_index)));
assert.ok(map.records.every(r => !priorIndices.has(r.source_index)), 'no source is republished across stages');
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
console.log('Lower atlas: 24 sources / 93 chapters, coverage, hashes, stage separation, mixed city boundaries, named recall and shared budget passed.');
