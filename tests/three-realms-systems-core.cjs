const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-systems-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-systems-'));
const enabled = packs.map(p => p.meta.id);
const migrated = all.filter(p => p.meta.id.startsWith('three-realms-') && !p.meta.id.endsWith('-demo'));
const combined = latestUser => core.select(migrated, migrated.map(p => p.meta.id), { latestUser, world: 'three-realms' });
assert.equal(packs.length, 4);
assert.equal(packs.flatMap(p => p.entries).length, 73);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(core.select(packs, enabled, { latestUser: '信仰 業力 心魔 飛升 降臨 神職 基本概念', world: 'three-realms' }).text, '');
assert.equal(core.select(packs, [], { latestUser: '三界業力概念' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '三界業力概念', world: 'sunrise-city' }).text, '');
for (const pack of packs) for (const entry of pack.entries) {
  const result = combined(entry.keywords[0]);
  assert.equal(result.entries.length, 1, entry.keywords[0]);
  assert.equal(result.entries[0].identity, pack.meta.id + ':' + entry.id);
  assert.ok(result.text.length <= 2200);
}
assert.match(combined('下界鬥宗渡劫').text, /共九道雷劫/);
assert.doesNotMatch(combined('下界鬥宗渡劫').text, /九九飛升劫|81 道雷劫/);
assert.match(combined('中界九重天劫').text, /第九重：神格劫/);
assert.doesNotMatch(combined('中界九重天劫').text, /108 道雷劫/);
assert.match(combined('神官信仰等級').text, /【聖徒】/);
assert.match(combined('三界業力表現').text, /渡劫必定失敗/);
assert.match(combined('三界墮落類型').text, /成為鬼王或鬼帝/);
const before = JSON.stringify(migrated);
const overload = combined('神官信仰等級 三界業力表現 三界心魔來源 中界九重天劫 下界鬥宗渡劫 神官神職限制 三界降臨風險 三界墮落回歸可能');
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(JSON.stringify(migrated), before, 'worldbook recall cannot change cultivation, resources or characters');
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 14);
assert.deepEqual(map.records.map(r => r.source_index), Array.from({ length: 14 }, (_, i) => i + 71));
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json', 'data/three-realms-lower-atlas-source-map.json', 'data/three-realms-middle-lore-source-map.json', 'data/three-realms-advanced-lore-source-map.json', 'data/three-realms-cosmic-lore-source-map.json', 'data/three-realms-secret-lore-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
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
console.log('Systems lore: 14 sources / 73 chapters, exact coverage, 73 isolated recalls, opt-in and shared budget passed.');
