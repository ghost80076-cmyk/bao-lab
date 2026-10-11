const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/sunrise-worldbook-library.json'));
const map = JSON.parse(fs.readFileSync('data/sunrise-geography-source-map.json'));
const packs = catalog.packs.map(core.normalizePack);
assert.equal(packs.length, 16);
assert.equal(packs.flatMap(p=>p.entries).length, 52);
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
for (const query of ['北山住宅區','東區平民區','南區貧民窟','天璇異能學院','曙光市警局','凱旋企業集團','曙光市第一監獄']) assert.ok(select(query).text.length > 0);
assert.equal(select('學校').text,'');
assert.equal(select('天道宗').text,'');
assert.equal(core.select(packs,ids,{latestUser:'中央商業區',world:'three-realms'}).text,'');
assert.equal(core.select(packs,[],{latestUser:'中央商業區',world:'sunrise-city'}).text,'');
for(const q of ['中央商業區','港口工業區','天際商場','北山住宅區','東區平民區','南區貧民窟'])assert.ok(select(q).text.length<=2200);
const full=JSON.stringify(catalog);
for(const secret of ['碼頭大火','縱火滅證','血色七月','走私運作流程','源點計畫','桃華事件','用異能操控股市','張猛','蘇逸辰','走私管道']) assert.ok(!full.includes(secret),secret);
console.log('Sunrise geography: 16 opt-in packs, 52 original chapters, source coverage, narrow recall, realm isolation and deferred secrets passed.');

const scenarioPacks = packs.filter(p=>p.meta.classification==='scenario');
assert.equal(scenarioPacks.length,2);
for (const [id,query] of [['sunrise-dock-scenario','9號碼頭'],['sunrise-academy-scenario','天璇異能學院']]) {
 const result=core.select(packs,[id],{latestUser:query,world:'sunrise-city'});
 assert.match(result.text,/劇情方向參考｜可能方向，尚未發生/);
 assert.ok(result.text.length<=2200);
 assert.equal(core.select(packs,[],{latestUser:query,world:'sunrise-city'}).text,'');
 assert.equal(core.select(packs,[id],{latestUser:query,world:'three-realms'}).text,'');
}

const people=packs.filter(p=>p.meta.id.endsWith('-people'));
assert.equal(people.length,2);
assert.equal(people.flatMap(p=>p.entries).length,16);
for (const name of ['林雨萱','陳大海','Victor','林正義','李明哲','老張','瘦猴','啞巴阿文']) {
 const result=core.select(people,people.map(p=>p.meta.id),{latestUser:name,world:'sunrise-city'});
 assert.match(result.text,/不代表在場/);
 assert.ok(result.text.includes(name));
 assert.ok(result.text.length<=2200);
}
assert.equal(core.select(people,people.map(p=>p.meta.id),{latestUser:'港口工業區',world:'sunrise-city'}).text,'');
for(const p of people) assert.equal(p.meta.classification,'reference');

const overview = core.select(packs,['sunrise-city-overview'],{latestUser:'曙光市',world:'sunrise-city'});
assert.match(overview.text,/人口 800 萬/);
assert.doesNotMatch(overview.text,/12,000|血色七月/);
const institutional = core.select(packs,['sunrise-prison-institution'],{latestUser:'第一監獄探視',world:'sunrise-city'});
assert.match(institutional.text,/虛構世界制度/);
assert.match(institutional.text,/每月2次/);
assert.doesNotMatch(institutional.text,/潛規則|作息時間表|沈妤筠|苏逸辰/);
assert.equal(core.select(packs,['sunrise-prison-institution'],{latestUser:'你好',world:'sunrise-city'}).text,'');
