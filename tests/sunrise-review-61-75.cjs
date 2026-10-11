const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../js/worldbook-library-core.js');
const load=n=>JSON.parse(fs.readFileSync(`data/${n}.json`,'utf8'));
const packs=load('sunrise-worldbook-library').packs.map(core.normalizePack);
const entries=new Map(packs.flatMap(p=>p.entries).map(e=>[e.id,e]));
const ledger=load('sunrise-review-batch-61-75').sources;
const coverage=load('sunrise-migration-coverage').entries;
const map=new Map(load('sunrise-geography-source-map').sources.map(s=>[s.source_index,s]));
assert.deepEqual(ledger.map(s=>s.source_index),Array.from({length:15},(_,i)=>i+61));
for(const s of ledger){
  assert.equal(s.source_sha256,coverage[s.source_index].source_sha256);
  assert.equal(s.publication_status,coverage[s.source_index].status);
  let end=0;
  for(const c of s.chapters){
    assert.equal(c.start,end);assert.ok(c.end>c.start);end=c.end;
    assert.equal(c.disposition==='published-reference',entries.has(`sunrise-source-${s.source_index}-${c.chapter}`));
    assert.equal(c.title,undefined);assert.equal(c.content,undefined);
    if(map.has(s.source_index)){
      const m=map.get(s.source_index).chapters[c.chapter];
      assert.deepEqual([c.start,c.end,c.sha256],[m.start,m.end,m.sha256]);
    }
  }
  assert.equal(end,s.source_chars);
}
for(const i of [65,69,71,74])assert.equal(ledger.find(s=>s.source_index===i).publication_status,'unreviewed');
const text=id=>entries.get(id).content;
const body68=[...entries].filter(([id])=>id.startsWith('sunrise-source-68-')).map(([,e])=>e.content).join('\n');
assert.doesNotMatch(body68,/攝影師|白天|丈夫|親密時|喘息|孤獨|真實:|動機:/);
assert.match(body68,/24歲|夜間工作/);
for(const i of [61,70,72,75])assert.doesNotMatch(text(`sunrise-source-${i}-2`),/真實:|動機:|真實變態|其實在關心/);
assert.doesNotMatch(text('sunrise-source-70-0'),/控制狂|丈夫/);
assert.doesNotMatch(text('sunrise-source-70-1'),/陰險冷酷/);
for(const i of [72,75])for(const p of [0,1])assert.doesNotMatch(text(`sunrise-source-${i}-${p}`),/橋本環奈|北川景子|演員參考/);
assert.match(text('sunrise-source-72-6'),/B級已登記/);
assert.doesNotMatch(text('sunrise-source-72-6'),/成長潛力|S級|100公尺|覺醒:/);
assert.doesNotMatch(text('sunrise-source-73-0'),/S級|★★★★★/);
assert.match(text('sunrise-source-61-6'),/必須直視眼睛.*自己不知真相/s);
assert.match(text('sunrise-source-63-0'),/14年9個月前/);
assert.doesNotMatch(text('sunrise-source-63-0'),/10年前|成立原因|數千人死亡/);
assert.match(text('sunrise-source-63-7'),/案例示例.*不代表本輪已裁定/s);
assert.doesNotMatch(text('sunrise-source-64-2'),/蕭一直想控制/);
assert.doesNotMatch(text('sunrise-source-64-3'),/只有主動申請|政治干預/);
assert.match(text('sunrise-source-64-3'),/無法直接逮捕或處決/);
assert.equal(entries.has('sunrise-source-66-7'),false,'unresolved venue comparison withheld');
assert.doesNotMatch(text('sunrise-source-66-0'),/幕後投資者|灰色產業/);
assert.doesNotMatch(text('sunrise-source-66-4'),/保護費/);
assert.match(text('sunrise-source-67-5'),/公開流傳.*不是本輪新發生/s);
const ids=packs.map(p=>p.meta.id);
const select=(q,world='sunrise-city',enabled=ids)=>core.select(packs,enabled,{latestUser:q,world});
assert.ok(select('Veritas').text.includes('14年9個月前'));
assert.ok(select('阿蕾西亞').text.includes('直視眼睛'));
assert.doesNotMatch(select('璃夜').text,/攝影師|丈夫|喘息/);
assert.ok(select('清水純').text.includes('B級已登記'));
assert.ok(select('天鵝絨月蝕會員').text.includes('需要現有會員推薦'));
assert.equal(select('Veritas','three-realms').text,'');
assert.equal(select('璃夜','sunrise-city',[]).text,'');
assert.equal(select('你好').text,'');
assert.ok(select('煉律審查室').text.length<=2200);
console.log('Sources 61–75: institutional references, current grades, night identity and private motives withheld passed.');
