const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../js/worldbook-library-core.js');
const load = path => JSON.parse(fs.readFileSync(path,'utf8'));
const catalog=load('data/sunrise-worldbook-library.json');
const map=load('data/sunrise-geography-source-map.json');
const groups=['sunrise-family-people','sunrise-institution-people','sunrise-dock-youth-people'];
const packs=catalog.packs.filter(p=>groups.includes(p.meta.id)).map(core.normalizePack);
assert.equal(packs.length,3);
assert.equal(packs.flatMap(p=>p.entries).length,46);
const select=q=>core.select(packs,groups,{latestUser:q,world:'sunrise-city'},{maxEntries:4,maxChars:2200});
for(const name of ['林宇軒','雷辰','桃華','星野美月','蘇晴','蕭凜','蕭夜','蕭辰','蕭星','陳天行','李雪梅','王剛','趙明遠','張烈','龍哥','狼王','阿桃']) {
 const result=select(name);
 assert.ok(result.entries.length,name);
 assert.match(result.text,/不代表在場/);
 assert.ok(result.text.length<=2200);
}
for(const word of ['蕭','學院','學生','教官','蕭家','流浪漢','流浪少女','港口工業區']) assert.equal(select(word).text,'',word);
assert.equal(core.select(packs,groups,{latestUser:'阿桃',world:'three-realms'}).text,'');
assert.equal(core.select(packs,[],{latestUser:'阿桃',world:'sunrise-city'}).text,'');
const published=packs.flatMap(p=>p.entries);const text=JSON.stringify(published);
for(const forbidden of ['轉世','前世','隱藏實力','暗中支持反登記法','秘密交易','非法異能實驗','和蕭盟友','可能是蕭盟友','結局:','性癖','處女','未發育']) assert.ok(!text.includes(forbidden),forbidden);
assert.match(select('蕭辰').text,/C級已登記/);
assert.doesNotMatch(select('蕭辰').text,/B級|SSS級|暗中對同學/);
const dead=published.find(e=>e.id==='sunrise-source-19-6');
assert.match(dead.content,/已故人物的生前能力資料/);
const wolf=select('狼王').text;
assert.match(wolf,/版本待核/);assert.doesNotMatch(wolf,/35歲|38歲|S級|SS級/);
for(const [id,age] of [[22,16],[23,15],[24,15],[25,14],[27,14]]) {
 const base=published.find(e=>e.id===`sunrise-source-${id}-0`);
 assert.match(base.content,new RegExp(`${age}歲`));
 assert.ok(!published.some(e=>e.id===`sunrise-source-${id}-3`));
}
for(const source of map.sources) for(const chapter of source.chapters) if(chapter.status==='deferred') assert.equal(chapter.title,undefined,'deferred titles must not leak identities through public provenance');
const batch=map.sources.filter(s=>s.source_index>=16&&s.source_index<=28);
assert.equal(batch.length,13);
assert.ok(batch.every(s=>s.chapters.some(c=>c.status==='deferred')),'partial work stays partial');
const card=load('data/characters/community/73/sunrise-city-disorder.json');
const pinned=card.gameplay.initial_state.worldbookLibrary.pinned;
for(const pack of packs) assert.deepEqual(pinned[pack.meta.id].entries,catalog.packs.find(p=>p.meta.id===pack.meta.id).entries);
console.log('PASS Sunrise character review: 13 partial sources, 46 public projections, private identities withheld, ages preserved, narrow recall, story snapshots aligned.');
