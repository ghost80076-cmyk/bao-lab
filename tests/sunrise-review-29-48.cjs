const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../js/worldbook-library-core.js');
const load=n=>JSON.parse(fs.readFileSync(`data/${n}.json`,'utf8'));
const packs=load('sunrise-worldbook-library').packs.map(core.normalizePack);
const entries=new Map(packs.flatMap(p=>p.entries).map(e=>[e.id,e]));
const ledger=load('sunrise-review-batch-29-48').sources;
const coverage=load('sunrise-migration-coverage').entries;
assert.deepEqual(ledger.map(s=>s.source_index),Array.from({length:20},(_,i)=>i+29));
for(const s of ledger){
  assert.equal(s.source_sha256,coverage[s.source_index].source_sha256);
  assert.equal(s.publication_status,coverage[s.source_index].status);
  let end=0;
  for(const c of s.chapters){
    assert.equal(c.start,end);assert.ok(c.end>c.start);end=c.end;
    assert.equal(c.disposition==='published-reference',entries.has(`sunrise-source-${s.source_index}-${c.chapter}`));
    assert.equal(c.title,undefined);assert.equal(c.content,undefined);
  }
  assert.equal(end,s.source_chars);
}
for(const i of [30,31,32]) assert.equal(ledger.find(s=>s.source_index===i).publication_status,'unreviewed');
for(const i of [43,44,45,46,47,48]){
  const voice=entries.get(`sunrise-source-${i}-2`).content;
  assert.match(voice,/表面.*口頭禪/s);assert.doesNotMatch(voice,/\*\*真實\*\*|\*\*動機\*\*/);
  for(const part of [3,4,5,8,9,10]) assert.equal(entries.has(`sunrise-source-${i}-${part}`),false);
}
assert.equal(entries.has('sunrise-source-43-6'),false);
assert.doesNotMatch(entries.get('sunrise-source-33-1').content,/代表：|阿桃/);
assert.match(entries.get('sunrise-source-29-0').content,/不代表事件真相已確認/);
assert.doesNotMatch(entries.get('sunrise-source-29-0').content,/林宇軒從一開始就不相信/);
const enabled=packs.map(p=>p.meta.id);
const recall=(query,world='sunrise-city')=>core.select(packs,enabled,{latestUser:query,world});
assert.ok(recall('桃華官方死因').text.includes('不代表事件真相已確認'));
assert.doesNotMatch(recall('桃華死亡真相版本A').text,/官方死因|真相版本A|他殺真相/);
assert.equal(recall('桃華官方死因','three-realms').text,'');
assert.equal(recall('你好').text,'');
assert.ok(recall('液化型').text.includes('液化'));
console.log('Source 29–48 review: spans, publication separation, public voices and narrow recall passed.');
