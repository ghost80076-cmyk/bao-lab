const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const core = require('../js/worldbook-library-core.js');
const catalog = require('../data/astral-worldbook-library.json');
const map = require('../data/astral-worldbook-source-map.json');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
const packs = catalog.packs.map(core.normalizePack);
const enabled = packs.map(p => p.meta.id);
const entries = new Map(packs.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));

assert.equal(packs.length, 4);
assert.ok(packs.every(p => p.meta.world === 'astral-continent' && p.meta.classification === 'world'));
assert.ok(packs.every(p => p.meta.name.startsWith('世界模擬器－AV異世界（部分搬入）｜')));
assert.equal(entries.size, 33);
assert.equal(map.complete_sources, 26);
assert.equal(map.partial_sources, 1);
assert.equal(map.records.length + map.not_published.length, 42);
assert.equal(new Set([...map.records, ...map.not_published].map(r => r.source_index)).size, 42);

for (const record of map.records) {
  const chunks = record.segments.map(segment => {
    const entry = entries.get(segment.pack_id + ':' + segment.entry_id);
    assert.ok(entry, 'source segment must resolve to a real public entry');
    assert.equal(sha(entry.content), segment.content_sha256);
    assert.deepEqual(entry.requires, segment.requires);
    return entry.content;
  });
  if (record.coverage === 'complete-original-text') {
    assert.equal(record.joins.length, chunks.length - 1);
    assert.ok(record.joins.every(s => !s.trim()), 'splits may only omit joining whitespace');
    const restored = chunks.reduce((result, chunk, index) => result + (index ? record.joins[index - 1] : '') + chunk, '');
    assert.equal(restored.length, record.source_chars);
    assert.equal(sha(restored), record.source_sha256, 'published sections must reconstruct the exact original text');
  } else {
    assert.equal(record.source_index, 209);
    assert.ok(record.omitted_scope);
  }
}
for (const index of [222, 223, 224, 225, 226, 227, 228, 229, 232, 234]) {
  assert.ok(map.not_published.some(r => r.source_index === index));
  assert.ok(!map.records.some(r => r.source_index === index));
}
assert.doesNotMatch([...entries.values()].map(e => e.content).join('\n'), /(?:^|\D)(?:12|15|16|17)\s*歲/);

const select = (context, options) => core.select(packs, enabled, { world: 'astral-continent', ...context }, options);
assert.equal(core.select(packs, [], { latestUser: '永夜領' }).text, '');
assert.equal(select({ latestUser: '永夜領', world: 'sunrise' }).text, '');
const geography = select({ latestUser: '永夜領' });
assert.match(geography.text, /北方冰原邊境/);
assert.ok(geography.text.length <= 2200 && geography.entries.length <= 4);
const character = select({ latestUser: '艾絲特·凜冬' });
assert.ok(character.entries.some(e => e.identity === 'astral-world-characters:source-215'));
assert.doesNotMatch(character.text, /可能方向，尚未發生/);
assert.match(select({ latestUser: '加雷斯' }).text, /聖裁勇者/);
assert.doesNotMatch(select({ latestUser: '加雷斯' }).text, /活祭品|神化容器/);
assert.match(select({ latestUser: '加雷斯', flags: ['已確認加雷斯的內情'] }, { maxChars: 10000, maxEntries: 12 }).text, /神化容器/);
assert.doesNotMatch(select({ latestUser: '造園者 後花園 世界真相' }).text, /更高維度|三種最終路線/);
assert.match(select({ latestUser: '造園者', flags: ['已得知世界真相'] }, { maxChars: 10000, maxEntries: 12 }).text, /更高維度/);
assert.doesNotMatch(select({ latestUser: '艾絲特' }, { recallMode: 'off' }).text, /外表35歲/);
assert.match(select({ latestUser: '艾絲特' }, { recallMode: 'off' }).text, /阿斯特拉大陸/);
console.log('PASS Astral dedicated worldbook: exact original text, independent scope, opt-in, bounded recall and gated secrets');
