const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/sunrise-worldbook-library.json'));
const map = JSON.parse(fs.readFileSync('data/sunrise-geography-source-map.json'));
const packs = catalog.packs.map(core.normalizePack);
assert.equal(packs.length, 48);
assert.equal(packs.flatMap(p=>p.entries).length, 329);
for (const source of map.sources) {
  assert.equal(source.chapters[0].start,0);
  assert.equal(source.chapters.at(-1).end,source.source_chars);
  source.chapters.forEach((chapter,i)=>{
    if(i) assert.equal(chapter.start,source.chapters[i-1].end);
    if(chapter.status==='published') {
      const entry=catalog.packs.flatMap(p=>p.entries).find(e=>e.id===chapter.entry_id);
      assert.ok(entry);
      assert.equal(crypto.createHash('sha256').update(entry.content).digest('hex'),chapter.published_sha256 || chapter.sha256);
    } else assert.equal(chapter.entry_id,undefined);
  });
}
const ids=packs.map(p=>p.meta.id);
const select=query=>core.select(packs,ids,{latestUser:query,world:'sunrise-city'},{maxEntries:4,maxChars:2200});
assert.ok(select('天際商場').text.includes('天際商場'));
for (const query of ['北山住宅區','東區平民區','南區貧民窟','天璇異能學院','曙光市警局','凱旋企業集團','曙光市第一監獄','三合會','狼幫','鐵鏈組織']) assert.ok(select(query).text.length > 0);
assert.equal(select('學校').text,'');
assert.equal(select('天道宗').text,'');
assert.equal(core.select(packs,ids,{latestUser:'中央商業區',world:'three-realms'}).text,'');
assert.equal(core.select(packs,[],{latestUser:'中央商業區',world:'sunrise-city'}).text,'');
for(const q of ['中央商業區','港口工業區','天際商場','北山住宅區','東區平民區','南區貧民窟'])assert.ok(select(q).text.length<=2200);
const full=JSON.stringify(catalog);
for(const secret of ['碼頭大火','縱火滅證','走私運作流程','源點計畫','桃華事件','用異能操控股市','張猛','霸凌局幕後黑手','NS3灰色業務流程','走私管道']) assert.ok(!full.includes(secret),secret);
console.log('Sunrise geography: 48 companion packs, 329 chapters with explicit editorial provenance, source coverage, narrow recall, realm isolation and deferred secrets passed.');

const scenarioPacks = packs.filter(p=>p.meta.classification==='scenario');
assert.equal(scenarioPacks.length,2);
for (const [id,query] of [['sunrise-dock-scenario','9號碼頭'],['sunrise-academy-scenario','天璇異能學院']]) {
 const result=core.select(packs,[id],{latestUser:query,world:'sunrise-city'});
 assert.match(result.text,/劇情方向參考｜可能方向，尚未發生/);
 assert.ok(result.text.length<=2200);
 assert.equal(core.select(packs,[],{latestUser:query,world:'sunrise-city'}).text,'');
 assert.equal(core.select(packs,[id],{latestUser:query,world:'three-realms'}).text,'');
}

const people=packs.filter(p=>['sunrise-police-people','sunrise-port-people'].includes(p.meta.id));
assert.equal(people.length,2);
assert.equal(people.flatMap(p=>p.entries).length,24);
for (const name of ['林雨萱','陳大海','Victor','林正義','李明哲','老張','瘦猴','啞巴阿文']) {
 const result=core.select(people,people.map(p=>p.meta.id),{latestUser:name,world:'sunrise-city'});
 assert.match(result.text,/不代表在場/);
 assert.ok(result.text.includes(name));
 assert.ok(result.text.length<=2200);
}
assert.equal(core.select(people,people.map(p=>p.meta.id),{latestUser:'港口工業區',world:'sunrise-city'}).text,'');
for(const p of people) assert.equal(p.meta.classification,'reference');

const overview = core.select(packs,['sunrise-city-overview'],{latestUser:'曙光市',world:'sunrise-city'});
assert.match(overview.text,/人口 500 萬/);
assert.doesNotMatch(overview.text,/12,000|血色七月/);
const institutional = core.select(packs,['sunrise-prison-institution'],{latestUser:'第一監獄探視',world:'sunrise-city'});
assert.match(institutional.text,/虛構世界制度/);
assert.match(institutional.text,/每月2次/);
assert.doesNotMatch(institutional.text,/潛規則|作息時間表|沈妤筠|苏逸辰/);
assert.equal(core.select(packs,['sunrise-prison-institution'],{latestUser:'你好',world:'sunrise-city'}).text,'');

const abilityIds=['sunrise-ability-background','sunrise-ability-institution'];
for(const [query,title] of [['異能覺醒','【異能覺醒】'],['異能訓練','【異能訓練】'],['異能限制','【異能限制】'],['異能者登記法','【異能與社會】'],['異能分類','八大主類'],['異能監控等級','監控等級']]) {
 const result=core.select(packs,abilityIds,{latestUser:query,world:'sunrise-city'});
 assert.equal(result.entries.length,1);
 assert.ok(result.text.includes(title));
 assert.match(result.text,/虛構/);
 assert.ok(result.text.length<=2200);
}
assert.equal(core.select(packs,abilityIds,{latestUser:'異能',world:'sunrise-city'}).text,'');
const abilityText=JSON.stringify(catalog.packs.filter(p=>abilityIds.includes(p.meta.id)));
for(const secret of ['阿桃','蕭（','黑市異能應用','強迫異能者交配','血色七月']) assert.ok(!abilityText.includes(secret));

for (const [query,needle] of [['冰系異能','冰霜領域'],['火系異能','火焰製造'],['雷系異能','電磁干擾'],['水系異能','水流操控'],['土系異能','土石操控'],['風系異能','風刃切割'],['速度強化','反應速度提升'],['防禦強化','皮膚硬化'],['再生能力','斷肢再生'],['感官強化','追蹤能力'],['瞬移','長距離瞬移'],['次元口袋','儲存物品']]) {
 const result=select(query);
 assert.equal(result.entries.length,1,query);
 assert.ok(result.text.includes(needle),query);
 assert.ok(result.text.length <= 2200);
 assert.doesNotMatch(result.text,/桃華|源點計畫|空間切割|力量強化型/);
}
assert.match(select('貨櫃碼頭').text,/20 個深水泊位/);
assert.doesNotMatch(select('貨櫃碼頭').text,/走私運作流程|A-13|阿強/);
assert.match(select('3號碼頭').text,/危險與風險/);
assert.doesNotMatch(select('3號碼頭').text,/重大案件|線人滅口案|武器庫/);
assert.doesNotMatch(full,/人口 800 萬|最富裕的 5% 人口|治安等級\*\*：A 級|治安等級\*\*：D 級/);
assert.match(select('北山住宅區').text,/治安等級\*\*：S 級/);
assert.match(select('南區貧民窟').text,/治安等級\*\*：F 級/);
