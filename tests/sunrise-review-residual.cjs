const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const coverage = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-migration-coverage.json')));
const map = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-geography-source-map.json')));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/sunrise-worldbook-library.json')));
const indices = [7, 30, 31, 32, 52, 58, 65, 69, 71, 74];
if (coverage.entries.some(e => e.status === 'unreviewed')) throw new Error('unreviewed sources remain');
for (const index of indices) {
  const source = map.sources.find(s => s.source_index === index);
  if (!source || source.chapters.some(c => c.status !== 'deferred')) throw new Error(`residual source ${index} not withheld`);
}
const ids = catalog.packs.flatMap(p => p.entries.map(e => e.id));
if (ids.some(id => indices.some(i => id.startsWith(`sunrise-source-${i}-`)))) throw new Error('residual source entered public catalog');
console.log('Residual sources: all 10 classified and withheld; no public catalog leakage.');
