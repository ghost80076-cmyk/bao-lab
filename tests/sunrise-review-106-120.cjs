const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = require('node:path').join(__dirname, '..');
const load = f => JSON.parse(fs.readFileSync(require('node:path').join(root, f), 'utf8'));
const map = load('data/sunrise-geography-source-map.json');
const ledger = load('data/sunrise-review-batch-106-120.json');
const catalog = load('data/sunrise-worldbook-library.json');
assert.deepEqual(ledger.sources.map(x => x.source_index), Array.from({length: 15}, (_, i) => i + 106));
for (const row of ledger.sources) {
  const mapped = map.sources.find(x => x.source_index === row.source_index);
  assert(mapped);
  assert.equal(row.source_sha256, mapped.source_sha256);
  assert.deepEqual(row.chapters.map(x => [x.start, x.end, x.sha256]), mapped.chapters.map(x => [x.start, x.end, x.sha256]));
}
for (const i of [106,108,109,111,112,114,116,118]) {
  assert.equal(ledger.sources.find(x => x.source_index === i).chapters.filter(x => x.disposition === 'published-reference').length, 0);
}
const entries = catalog.packs.flatMap(p => p.entries);
const text = entries.filter(e => /^sunrise-source-(110|113|115)-/.test(e.id)).map(e => e.content).join('\n');
assert.match(text, /三合會|狼幫|鐵鏈組織/);
assert.doesNotMatch(text, /刑訊|人口販賣|器官買賣|毒品製造|暗殺部門|走私路線/);
assert.doesNotMatch(JSON.stringify(catalog), /源點計畫/);
console.log('Sources 106–120: public faction identities only; police corruption, criminal operations, prison economy and Origin Project withheld.');
