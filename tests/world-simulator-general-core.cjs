const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../js/worldbook-library-core.js');
const catalog = require('../data/world-simulator-general-library.json');
const coverage = require('../data/world-simulator-general-source-map.json');
const crypto = require('node:crypto');
const packs = catalog.packs.map(core.normalizePack);
const ids = packs.map(p => p.meta.id);
assert.equal(packs.length, 2);
assert.equal(packs.flatMap(p => p.entries).length, 6);
assert.ok(packs.every(p => p.meta.world === 'general' && p.meta.classification === 'scenario'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
for (const [query, title] of [['奇幻劇本', '奇幻冒險'], ['玄幻劇本', '玄幻歷練'], ['末日生存', '末世生存'], ['科幻世界', '科幻探索'], ['職場劇本', '現代都市'], ['錦標賽', '熱血競技']]) {
  const selected = core.select(packs, ids, {latestUser: query, world: 'sunrise-city'});
  assert.equal(selected.entries.length, 1);
  assert.match(selected.text, new RegExp(title));
  assert.match(selected.text, /可能方向，尚未發生/);
  assert.ok(selected.text.length < 500);
}
for (const query of ['你好', '世界', '角色', '任務', '半框眼鏡', '夏語涵', '魔法']) {
  assert.equal(core.select(packs, ids, {latestUser: query}).text, '', 'no broad or unrelated triggers');
}
assert.equal(core.select(packs, [], {latestUser: '奇幻劇本'}).text, '');
assert.equal(core.select(packs, ids, {latestUser: '奇幻劇本'}, {recallMode:'off'}).text, '');
assert.equal(core.select(packs, ids, {latestUser: '奇幻劇本'}, {recallMode:'scene'}).text, '');
assert.match(core.select(packs, ids, {location:'賽博都市'}, {recallMode:'scene'}).text, /科幻探索/);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
assert.equal(coverage.source_count, 662);
assert.equal(coverage.records.length, 18);
assert.equal(new Set(coverage.records.map(r => r.source_sha256)).size, 6);
for (const record of coverage.records) {
  const e = packs.find(p => p.meta.id === record.pack_id).entries.find(e => e.id === record.entry_id);
  assert.equal(hash(e.content), record.published_sha256);
  assert.equal(record.status, 'partial-adaptation');
}
assert.equal(coverage.books.reduce((n,b)=>n+b.pending_indices.length,0), 644);
assert.doesNotMatch(fs.readFileSync(require.resolve('../data/world-simulator-general-library.json'),'utf8'), /忽略.*規則|開發者模式|性慾|體位|世界真相/);
console.log('PASS general simulator: 2 opt-in packs, 6 narrow chapters, 18 source references, 644 pending occurrences, mode gates and budget');
