const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const batch = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-review-batch-136-150.json')));
const map = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-geography-source-map.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-worldbook-library.json')));
if (batch.sources.length !== 15) throw new Error('expected 15 reviewed sources');
for (let i = 0; i < 15; i++) {
  const index = 136 + i;
  const record = batch.sources[i];
  if (record.source_index !== index || record.review_status !== 'examined') throw new Error(`source ${index} missing`);
  const allowed = index === 138 ? new Set([4, 5]) : new Set();
  if (record.chapters.some(c => (allowed.has(c.chapter) ? c.disposition !== 'published-reference' : c.disposition !== 'withheld-author-source'))) throw new Error(`source ${index} leaked publication`);
  const mapped = map.sources.find(s => s.source_index === index);
  if (!mapped || mapped.chapters.length !== record.chapters.length) throw new Error(`source ${index} span mismatch`);
  if (mapped.chapters.some(c => (index === 138 && (c.chapter === 4 || c.chapter === 5) ? c.status !== 'published' : c.status !== 'deferred'))) throw new Error(`source ${index} not deferred`);
}
const ids = catalog.packs.flatMap(p => p.entries.map(e => e.id));
if (ids.some(id => {
  const m = id.match(/^sunrise-source-(\d+)-(\d+)$/);
  if (!m) return false;
  const source = Number(m[1]);
  const chapter = Number(m[2]);
  return source >= 136 && source <= 150 && !(source === 138 && (chapter === 4 || chapter === 5));
})) throw new Error('withheld source entered public catalog');
const publicText = JSON.stringify(catalog);
for (const marker of ['武器製作與銷售', '通緝與追殺系統', '班長（SSS級通緝犯）', '成癮與戒斷系統']) {
  if (publicText.includes(marker)) throw new Error(`sensitive marker leaked: ${marker}`);
}
console.log('Sources 136–150: prison/crime systems and exploitative character material inventoried and fully withheld.');
