const assert = require('node:assert/strict');
const fs = require('node:fs');
const root = require('node:path').join(__dirname, '..');
const load = f => JSON.parse(fs.readFileSync(require('node:path').join(root, f), 'utf8'));
const map = load('data/sunrise-geography-source-map.json');
const ledger = load('data/sunrise-review-batch-91-105.json');
const catalog = load('data/sunrise-worldbook-library.json');
assert.deepEqual(ledger.sources.map(x => x.source_index), Array.from({length: 15}, (_, i) => i + 91));
for (const row of ledger.sources) {
  const mapped = map.sources.find(x => x.source_index === row.source_index);
  assert(mapped);
  assert.equal(row.source_sha256, mapped.source_sha256);
  assert.deepEqual(row.chapters.map(x => [x.start, x.end, x.sha256]), mapped.chapters.map(x => [x.start, x.end, x.sha256]));
}
for (const i of [93, 100, 103]) assert.equal(ledger.sources.find(x => x.source_index === i).chapters.filter(x => x.disposition === 'published-reference').length, 0);
const entries = catalog.packs.flatMap(p => p.entries);
const text = entries.filter(e => /^sunrise-source-(91|92|94|95|102|105)-/.test(e.id)).map(e => e.content).join('\n');
assert.doesNotMatch(text, /刑訊|人體實驗|強制催化|性虐待|性工作者|人口販賣|器官買賣|隱藏能力|源點計畫|侵入神經/);
assert.doesNotMatch(text, /演員參考:/);
assert.match(text, /林月影|張皓|陳國輝|艾莉絲·溫特/);
assert.match(text, /東區與 CBD 交界|南區與東區交界/);
console.log('Sources 91–105: public character projections and East/South transition geography passed; unsafe scenarios withheld.');
