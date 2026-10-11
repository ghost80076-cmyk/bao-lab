const assert = require('node:assert/strict');
const fs = require('node:fs');
const load = name => JSON.parse(fs.readFileSync(`data/${name}.json`, 'utf8'));
const inventory = load('sunrise-migration-coverage');
const map = load('sunrise-geography-source-map');
const catalog = load('sunrise-worldbook-library');
assert.equal(inventory.source_worldbook_id, map.source_worldbook_id);
assert.equal(inventory.entries.length, 183);
assert.equal(inventory.summary.source_entries, 183);
const reviewed = new Map(map.sources.map(s => [s.source_index, s]));
const counts = {};
for (const [i, item] of inventory.entries.entries()) {
  assert.equal(item.source_index, i);
  assert.match(item.source_sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(item).sort(), ['category','deferred_chapters','published_chapters','source_index','source_sha256','status'].sort());
  const source = reviewed.get(i);
  if (source) {
    assert.equal(item.source_sha256, source.source_sha256);
    const published = source.chapters.filter(c => c.status === 'published').length;
    const deferred = source.chapters.filter(c => c.status === 'deferred').length;
    assert.equal(item.published_chapters, published);
    assert.equal(item.deferred_chapters, deferred);
    assert.equal(item.status, deferred ? 'partial' : 'complete');
  } else {
    assert.equal(item.status, 'unreviewed');
    assert.equal(item.published_chapters, 0);
    assert.equal(item.deferred_chapters, 0);
  }
  counts[item.status] = (counts[item.status] || 0) + 1;
}
assert.deepEqual(inventory.summary.coverage, counts);
assert.equal(inventory.summary.packs, catalog.packs.length);
assert.equal(inventory.summary.published_chapters, catalog.packs.flatMap(p => p.entries).length);
assert.equal(inventory.entries.reduce((n,e)=>n+e.published_chapters,0), inventory.summary.published_chapters);
console.log('Sunrise coverage: every source indexed, partial/unreviewed distinguished, catalog and provenance aligned.');
