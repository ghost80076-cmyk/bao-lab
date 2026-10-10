const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-fire-artifact-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-fire-artifact-'));
const enabled = packs.map(p => p.meta.id);
const migrated = all.filter(p => p.meta.id.startsWith('three-realms-') && !p.meta.id.endsWith('-demo'));
const combined = latestUser => core.select(migrated, migrated.map(p => p.meta.id), { latestUser, world: 'three-realms' });
assert.equal(packs.length, 2);
assert.equal(packs.flatMap(p => p.entries).length, 55);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(core.select(packs, enabled, { latestUser: '法寶 神火 靈火 器靈 異火 等級 基本概念', world: 'three-realms' }).text, '');
assert.equal(core.select(packs, [], { latestUser: '三界異火概念' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '三界異火概念', world: 'sunrise-city' }).text, '');
for (const pack of packs) for (const entry of pack.entries) {
  const result = combined(entry.keywords[0]);
  assert.equal(result.entries.length, 1, entry.keywords[0]);
  assert.equal(result.entries[0].identity, pack.meta.id + ':' + entry.id);
  assert.ok(result.text.length <= 2200);
}
assert.match(combined('異火榜虛無吞炎').text, /最強異火/);
assert.doesNotMatch(combined('異火榜虛無吞炎').text, /第二：淨蓮妖火/);
assert.match(combined('天地靈火體系混沌聖火').text, /可以焚燒法則/);
assert.match(combined('神官神火體系天帝神火').text, /包括神格/);
assert.match(combined('神官體系器靈').text, /圓滿器靈/);
assert.match(combined('上界神官體系神器').text, /小神-大神使用/);
assert.match(combined('下界煉器異火').text, /異火/);
for (const keyword of ['下界法寶等級', '下界法寶類型', '下界煉器師等級', '下界煉器材料']) {
  const r = combined(keyword);
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0].pack, 'three-realms-encyclopedia-artifacts');
}
assert.equal(all.find(p => p.meta.id === 'three-realms-encyclopedia-artifacts').meta.release, '1.0.2');
assert.ok(packs.every(p => p.entries.every(e => !e.content.includes('AI 可以根據劇情需要創造'))));
const before = JSON.stringify(migrated);
const overload = combined('異火榜虛無吞炎 異火榜淨蓮妖火 神官體系器靈 上界神官體系神器 天地靈火體系混沌聖火 三界業力表現 中界九重天劫');
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(JSON.stringify(migrated), before);
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 9);
assert.deepEqual(map.records.map(r => r.source_index), Array.from({ length: 9 }, (_, i) => i + 62));
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json', 'data/three-realms-lower-atlas-source-map.json', 'data/three-realms-middle-lore-source-map.json', 'data/three-realms-advanced-lore-source-map.json', 'data/three-realms-cosmic-lore-source-map.json', 'data/three-realms-secret-lore-source-map.json', 'data/three-realms-systems-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const priorIndices = new Set(priorMaps.flatMap(m => m.records.map(r => r.source_index)));
assert.ok(map.records.every(r => !priorIndices.has(r.source_index)));
const byId = new Map(packs.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));
const seen = new Set();
for (const source of map.records) {
  assert.match(source.source_sha256, /^[a-f0-9]{64}$/);
  let cursor = 0;
  const segments = [];
  for (const target of source.destinations) {
    assert.equal(target.start, cursor);
    assert.ok(target.end > target.start);
    const id = target.pack_id + ':' + target.entry_id;
    assert.ok(!seen.has(id)); seen.add(id);
    const entry = byId.get(id);
    assert.ok(entry);
    assert.equal(crypto.createHash('sha256').update(entry.content).digest('hex'), target.content_sha256);
    assert.ok(target.source_segments.length >= 1 && target.source_segments.length <= 2);
    for (const segment of target.source_segments) {
      assert.ok(segment.start >= target.start && segment.end <= target.end && segment.end > segment.start);
      segments.push(segment);
    }
    cursor = target.end;
  }
  assert.equal(cursor, source.source_chars);
  for (const omission of source.omissions) {
    assert.equal(omission.reason, 'native-story-instruction-not-world-fact');
    assert.match(omission.source_sha256, /^[a-f0-9]{64}$/);
    segments.push(omission);
  }
  segments.sort((a,b) => a.start-b.start);
  let covered = 0;
  for (const segment of segments) { assert.equal(segment.start, covered); covered = segment.end; }
  assert.equal(covered, source.source_chars, 'published segments and explicit omissions cover all original text');
}
assert.equal(seen.size, map.generated_entries);
assert.equal(seen.size, byId.size);
assert.deepEqual(map.records.filter(r => r.omissions.length).map(r => r.source_index), [63,64,65]);
console.log('Fire/artifact lore: 9 sources / 55 chapters, exact segment coverage, 3 explicit omitted instructions, isolated recalls and shared budget passed.');
