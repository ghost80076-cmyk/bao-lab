const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const map = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-geography-source-map.json')));
const ledger = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-review-batch-76-90.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-worldbook-library.json')));
const rows = ledger.sources;
assert.deepEqual(rows.map(x=>x.source_index), Array.from({length:15},(_,i)=>i+76));
assert(rows.every(x=>x.review_status==='examined' && x.source_sha256));
for (const row of rows) {
  const mapped = map.sources.find(x=>x.source_index===row.source_index);
  assert(mapped);
  assert.equal(row.source_sha256, mapped.source_sha256);
  assert.deepEqual(row.chapters.map(x=>[x.start,x.end,x.sha256]), mapped.chapters.map(x=>[x.start,x.end,x.sha256]));
}
for (const i of [78,79,80,81,82,83,90]) {
  assert.equal(rows.find(x=>x.source_index===i).chapters.filter(x=>x.disposition==='published-reference').length, 0);
}
const text = catalog.packs.flatMap(p=>p.entries).filter(e=>/^sunrise-source-(7[6-9]|8[0-9]|90)-/.test(e.id)).map(e=>e.content).join('\n');
assert(!/做愛時|懷孕線|性奴|強制高潮|被丈夫控制|偷拍|人口販賣/.test(text));
assert(!/演員參考:/.test(text));
assert.match(text,/炎月夜異能|烈焰之拳/);
assert.match(text,/影月璃|璃夜/);
assert.match(text,/伊甸園科技體驗館|NS3/);
assert.match(text,/技術風險|神經損傷/);
console.log('Sources 76–90: public ability, prison and Eden projections with minor/private material withheld passed.');
