const assert=require('node:assert/strict');
const fs=require('node:fs');
const core=require('../js/worldbook-library-core.js');
const load=n=>JSON.parse(fs.readFileSync(`data/${n}.json`,'utf8'));
const packs=load('sunrise-worldbook-library').packs.map(core.normalizePack);
const entries=new Map(packs.flatMap(p=>p.entries).map(e=>[e.id,e]));
const ledger=load('sunrise-review-batch-49-60').sources;
const coverage=load('sunrise-migration-coverage').entries;
const mapping=new Map(load('sunrise-geography-source-map').sources.map(s=>[s.source_index,s]));
assert.deepEqual(ledger.map(s=>s.source_index),Array.from({length:12},(_,i)=>i+49));
for(const s of ledger){
  assert.equal(s.source_sha256,coverage[s.source_index].source_sha256);
  assert.equal(s.publication_status,coverage[s.source_index].status);
  let end=0;
  for(const c of s.chapters){
    assert.equal(c.start,end);assert.ok(c.end>c.start);end=c.end;
    assert.equal(c.disposition==='published-reference',entries.has(`sunrise-source-${s.source_index}-${c.chapter}`));
    assert.equal(c.title,undefined);assert.equal(c.content,undefined);
    if(mapping.has(s.source_index)){
      const m=mapping.get(s.source_index).chapters[c.chapter];
      assert.deepEqual([c.start,c.end,c.sha256],[m.start,m.end,m.sha256]);
    }
  }
  assert.equal(end,s.source_chars);
}
for(const i of [52,58])assert.equal(ledger.find(s=>s.source_index===i).publication_status,'unreviewed');
const body=id=>entries.get(id).content;
assert.doesNotMatch(body('sunrise-source-49-2'),/非法異能實驗|反登記法組織|秘密組織/);
assert.doesNotMatch(body('sunrise-source-50-0'),/玩家|16歲/);
assert.doesNotMatch(body('sunrise-source-51-0'),/地下室|心靈操控相關設施/);
assert.match(body('sunrise-source-51-11'),/對外展示.*不代表實際關係/s);
assert.doesNotMatch(body('sunrise-source-53-0'),/三代|世代傳承/);
assert.doesNotMatch(body('sunrise-source-57-0'),/45歲|陳大海|幕後|性產業前線/);
assert.equal(entries.has('sunrise-source-55-2'),false,'unresolved light/healing classification withheld');
assert.match(body('sunrise-source-60-13'),/官方說法.*不代表失蹤原因/s);
assert.doesNotMatch(body('sunrise-source-60-13'),/滅口|沉海|ゆめ|知道陳大海/);
assert.doesNotMatch(body('sunrise-source-60-14'),/逃過一劫|有人護航|不留證據/);
assert.equal(entries.has('sunrise-source-59-0'),false,'unresolved sixth district not published');
const enabled=packs.map(p=>p.meta.id);
const select=(q,world='sunrise-city',ids=enabled)=>core.select(packs,ids,{latestUser:q,world});
assert.ok(select('雷鳴異能訓練館').text.includes('退役的異能者戰士'));
assert.ok(select('林氏集團').text.includes('500億'));
assert.ok(select('風聞').text.includes('中立立場'));
assert.ok(select('去紅燈區').text.includes('高級夜店街'));
assert.ok(select('小櫻失蹤案').text.includes('不代表失蹤原因已確認'));
assert.equal(select('雷鳴異能訓練館','three-realms').text,'');
assert.equal(select('小櫻失蹤案','sunrise-city',[]).text,'');
assert.equal(select('你好').text,'');
assert.ok(select('Rose Club').text.length<=2200);
console.log('Sources 49–60: public projections, withheld truth, family/player isolation and narrow recall passed.');
