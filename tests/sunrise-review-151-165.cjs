const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const batch = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-review-batch-151-165.json')));
const map = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-geography-source-map.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-worldbook-library.json')));
if (batch.sources.length !== 15) throw new Error('expected 15 reviewed sources');
for (let i = 0; i < 15; i++) {
  const index = 151 + i;
  const record = batch.sources[i];
  if (record.source_index !== index || record.review_status !== 'examined') throw new Error(`source ${index} missing`);
  if (record.chapters.some(c => c.disposition !== 'withheld-author-source')) throw new Error(`source ${index} leaked publication`);
  const mapped = map.sources.find(s => s.source_index === index);
  if (!mapped || mapped.chapters.length !== record.chapters.length) throw new Error(`source ${index} span mismatch`);
  if (mapped.chapters.some(c => c.status !== 'deferred')) throw new Error(`source ${index} not deferred`);
}
const ids = catalog.packs.flatMap(p => p.entries.map(e => e.id));
if (ids.some(id => /^sunrise-source-(15[1-9]|16[0-5])-/.test(id))) throw new Error('withheld source entered public catalog');
const publicText = JSON.stringify(catalog);
for (const marker of ['審訊系統', '越獄系統', '武器系統', '奇遇系統', '秘境系統']) {
  if (publicText.includes(marker)) throw new Error(`procedural marker leaked: ${marker}`);
}
console.log('Sources 151–165: procedural crime, enforcement and encounter systems inventoried and fully withheld.');
