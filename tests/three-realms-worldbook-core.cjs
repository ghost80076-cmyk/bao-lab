const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const sourceMap = JSON.parse(fs.readFileSync('data/three-realms-worldbook-source-map.json', 'utf8'));
const packs = catalog.packs.map(core.normalizePack);
const migrated = packs.filter(p => /^three-realms-(lower-|middle-|upper-)/.test(p.meta.id));
assert.equal(migrated.length, 6);
const enabled = migrated.map(p => p.meta.id);
assert.equal(migrated.flatMap(p => p.entries).length, 48);
assert.ok(migrated.every(p => p.meta.world === 'three-realms' && p.meta.visibility === 'public'));
assert.ok(migrated.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(core.select(migrated, enabled, { latestUser: '我坐著休息' }).text, '');
assert.equal(core.select(migrated, enabled, { latestUser: '角色任務劇本狀態欄下界宗門' }).text, '');
assert.equal(core.select(migrated, [], { latestUser: '天道宗' }).text, '');
assert.equal(core.select(migrated, enabled, { latestUser: '天道宗', world: 'sunrise-city' }).text, '');

const sect = core.select(migrated, enabled, { latestUser: '我去天道宗' });
assert.match(sect.text, /中央大陸第一宗門/);
assert.doesNotMatch(sect.text, /## 玄天劍宗|## 丹霞宗|九霄神殿/);
const city = core.select(migrated, enabled, { location: '天心城' });
assert.match(city.text, /人口：500 萬/);
assert.doesNotMatch(city.text, /## 青木城|## 石城/);
const middle = core.select(migrated, enabled, { latestUser: '進入東南仙域' });
assert.match(middle.text, /丹仙閣/);
assert.doesNotMatch(middle.text, /冰雪宮|天道宗|九霄神殿/);
const upper = core.select(migrated, enabled, { latestUser: '九霄神殿' });
assert.match(upper.text, /通往中層的守門人/);
assert.doesNotMatch(upper.text, /## 天道宗|玄黃神宮/);
const precise = core.select(migrated, enabled, { latestUser: '玄天劍宗' });
assert.match(precise.text, /中央大陸第二宗門/);
assert.doesNotMatch(precise.text, /玄天神殿/);
const leaders = core.select(migrated, enabled, { presentNPCs: '蕭天元' });
assert.match(leaders.text, /天心城/);
assert.ok(leaders.text.length <= 2200 && leaders.entries.length <= 4);
const overload = core.select(migrated, enabled, { latestUser: '下界地圖 中央大陸 東方大陸 下界家族 下界城市 天道宗' });
assert.ok(overload.text.length <= 2200 && overload.entries.length <= 4);

const indices = sourceMap.records.map(r => r.source_index);
assert.equal(indices.length, 18);
assert.equal(sourceMap.source_visibility, '公開');
assert.equal(new Set([...indices, ...sourceMap.deferred_source_indices]).size, 191);
assert.ok(sourceMap.deferred_source_indices.every(i => !indices.includes(i)));
const byId = new Map(migrated.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));
let total = 0;
for (const source of sourceMap.records) {
  let cursor = 0;
  for (const target of source.destinations) {
    assert.equal(target.start, cursor, 'source spans must be contiguous, with no dropped section');
    assert.ok(target.end > target.start);
    const e = byId.get(target.pack_id + ':' + target.entry_id);
    assert.ok(e);
    assert.equal(crypto.createHash('sha256').update(e.content).digest('hex'), target.content_sha256);
    cursor = target.end;
    total++;
  }
  assert.equal(cursor, source.source_chars);
}
assert.equal(total, sourceMap.generated_entries);
assert.equal(total, byId.size);
console.log('Three realms: 18 source entries / 48 chapters, exact hashes, narrow recall, realm separation and shared budget passed.');
