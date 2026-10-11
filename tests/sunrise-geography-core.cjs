const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/sunrise-worldbook-library.json'));
const map = JSON.parse(fs.readFileSync('data/sunrise-geography-source-map.json'));
const packs = catalog.packs.map(core.normalizePack);
assert.equal(packs.length, 2);
assert.equal(packs.flatMap(p=>p.entries).length, 10);
for (const source of map.sources) {
  assert.equal(source.chapters[0].start,0);
  assert.equal(source.chapters.at(-1).end,source.source_chars);
  source.chapters.forEach((chapter,i)=>{
    if(i) assert.equal(chapter.start,source.chapters[i-1].end);
    if(chapter.status==='published') {
      const entry=catalog.packs.flatMap(p=>p.entries).find(e=>e.id===chapter.entry_id);
      assert.ok(entry);
      assert.equal(crypto.createHash('sha256').update(entry.content).digest('hex'),chapter.sha256);
    } else assert.equal(chapter.entry_id,undefined);
  });
}
const ids=packs.map(p=>p.meta.id);
const select=query=>core.select(packs,ids,{latestUser:query,world:'sunrise-city'},{maxEntries:4,maxChars:2200});
assert.ok(select('天際商場').text.includes('天際商場'));
assert.equal(select('天道宗').text,'');
assert.equal(core.select(packs,ids,{latestUser:'中央商業區',world:'three-realms'}).text,'');
assert.equal(core.select(packs,[],{latestUser:'中央商業區',world:'sunrise-city'}).text,'');
for(const q of ['中央商業區','港口工業區','天際商場'])assert.ok(select(q).text.length<=2200);
const full=JSON.stringify(catalog);
for(const secret of ['碼頭大火','縱火滅證','血色七月','走私運作流程','源點計畫']) assert.ok(!full.includes(secret),secret);
console.log('Sunrise geography: 2 opt-in packs, 10 original chapters, source coverage, narrow recall, realm isolation and deferred secrets passed.');
