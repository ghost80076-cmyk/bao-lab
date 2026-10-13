const assert = require('node:assert/strict');
const fs = require('node:fs');
const core = require('../js/worldbook-library-core.js');
const catalog = require('../data/world-simulator-general-library.json');
const coverage = require('../data/world-simulator-general-source-map.json');
const crypto = require('node:crypto');
const packs = catalog.packs.map(core.normalizePack);
const ids = packs.map(p => p.meta.id);
assert.equal(packs.length, 6);
assert.equal(packs.flatMap(p => p.entries).length, 53);
assert.ok(packs.every(p => p.meta.world === 'general' && p.meta.classification === 'scenario'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
for (const [query, title] of [['奇幻劇本', '奇幻冒險'], ['玄幻劇本', '玄幻歷練'], ['末日生存', '末世生存'], ['科幻世界', '科幻探索'], ['職場劇本', '現代都市'], ['錦標賽', '熱血競技']]) {
  const selected = core.select(packs, ids, {latestUser: query, world: 'sunrise-city'});
  assert.equal(selected.entries.length, 1);
  assert.match(selected.text, new RegExp(title));
  assert.match(selected.text, /可能方向，尚未發生/);
  assert.ok(selected.text.length < 500);
}
for (const query of ['你好', '世界', '角色', '任務', '半框眼鏡', '夏語涵', '魔法', '朋友', '前輩', '關係', '男人', '戀愛']) {
  assert.equal(core.select(packs, ids, {latestUser: query}).text, '', 'no broad or unrelated triggers');
}
assert.equal(core.select(packs, [], {latestUser: '奇幻劇本'}).text, '');
assert.equal(core.select(packs, ids, {latestUser: '奇幻劇本'}, {recallMode:'off'}).text, '');
assert.equal(core.select(packs, ids, {latestUser: '奇幻劇本'}, {recallMode:'scene'}).text, '');
assert.match(core.select(packs, ids, {location:'賽博都市'}, {recallMode:'scene'}).text, /科幻探索/);
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
assert.equal(coverage.source_count, 662);
assert.equal(coverage.records.length, 170);
assert.equal(new Set(coverage.records.map(r => r.source_sha256 )).size, 60);
for (const record of coverage.records) {
  const e = packs.find(p => p.meta.id === record.pack_id).entries.find(e => e.id === record.entry_id);
  assert.equal(hash(e.content), record.published_sha256);
  assert.equal(record.status, 'partial-adaptation');
}
assert.equal(coverage.books.reduce((n,b)=>n+b.pending_indices.length,0), 410);
const adventure = packs.find(p=>p.meta.id==='world-simulator-adventure-reference');
assert.equal(adventure.entries.length,9);
for(const entry of adventure.entries.slice(4)) {
  for(const query of entry.keywords) {
    const selected=core.select(packs,ids,{latestUser:query});
    assert.deepEqual(selected.entries.map(e=>e.identity),[adventure.meta.id+':'+entry.id]);
    assert.match(selected.text,/可能方向，尚未發生/);
    assert.equal(core.select(packs,ids,{latestUser:query},{recallMode:'off'}).text,'');
    assert.equal(core.select(packs,ids,{latestUser:query},{recallMode:'scene'}).text,'');
    assert.match(core.select(packs,ids,{location:query},{recallMode:'scene'}).text,new RegExp(entry.title));
    assert.equal(core.select(packs,ids.filter(id=>id!==adventure.meta.id),{latestUser:query}).text,'');
  }
  const records=coverage.records.filter(r=>r.entry_id===entry.id);
  assert.equal(records.length,1);
  assert.equal(records[0].book_id,'572f3222-5746-43cc-ae16-60239eac041c');
}
for(const query of ['公會','委託','和平','魔法','人物','技能','採集','主線'])
  assert.equal(core.select([adventure],[adventure.meta.id],{latestUser:query}).text,'');
const relationship = packs.find(p => p.meta.id === 'world-simulator-relationship-reference');
assert.equal(relationship.entries.length,26);
for (const entry of relationship.entries) {
  for (const query of entry.keywords) {
    const result = core.select(packs, ids, {latestUser: query});
    assert.deepEqual(result.entries.map(e=>e.identity), [relationship.meta.id + ':' + entry.id]);
    assert.match(result.text, /可能方向，尚未發生/);
    assert.ok(result.text.length < 500);
    assert.equal(core.select(packs, ids, {latestUser:query}, {recallMode:'off'}).text, '');
    assert.equal(core.select(packs, ids, {latestUser:query}, {recallMode:'scene'}).text, '');
    assert.match(core.select(packs, ids, {presentNPCs:query}, {recallMode:'scene'}).text, new RegExp(entry.title));
    assert.equal(core.select(packs, ids.filter(id=>id!==relationship.meta.id), {latestUser:query}).text, '');
  }
}
const crowded = relationship.entries.map(e=>e.keywords[0]).join('、');
const bounded = core.select(packs, ids, {latestUser:crowded}, {maxEntries:2, maxChars:600});
assert.equal(bounded.entries.length, 2);
assert.ok(bounded.text.length <= 600);
assert.equal(new Set(bounded.entries.map(e=>e.identity)).size, bounded.entries.length);
const sameSource = core.select(packs, ids, {latestUser:'八卦閨蜜', presentNPCs:'健談好友', recentEvents:'八卦閨蜜'});
assert.equal(sameSource.entries.length, 1, 'multiple signals do not duplicate a chapter');
for (const book of coverage.books) {
  assert.equal(new Set([...book.adapted_indices, ...book.reviewed_unpublished_indices, ...book.pending_indices]).size, book.source_count);
  assert.equal(book.adapted_indices.length + book.reviewed_unpublished_indices.length + book.pending_indices.length, book.source_count);
  assert.equal(book.adapted_indices.length, book.book_id === '572f3222-5746-43cc-ae16-60239eac041c' ? 60 : 55);
  assert.equal(book.reviewed_unpublished_indices.length, book.book_id === '59d9fbcd-d5f8-47aa-99fb-a101675230e4' ? 27 : book.book_id === '572f3222-5746-43cc-ae16-60239eac041c' ? 33 : 22);
}
const plotPacks = packs.filter(p=>['world-simulator-romance-reference','world-simulator-intrigue-reference'].includes(p.meta.id));
assert.equal(plotPacks.length, 2);
assert.equal(plotPacks.flatMap(p=>p.entries).length, 13);
for (const pack of plotPacks) {
  for (const entry of pack.entries) {
    for (const query of entry.keywords) {
      const result = core.select(packs, ids, {latestUser:query});
      assert.deepEqual(result.entries.map(e=>e.identity), [pack.meta.id+':'+entry.id]);
      assert.match(result.text, /可能方向，尚未發生/);
      assert.ok(result.text.length < 500);
      assert.equal(core.select(packs, ids, {latestUser:query}, {recallMode:'off'}).text, '');
      assert.equal(core.select(packs, ids, {latestUser:query}, {recallMode:'scene'}).text, '');
      assert.match(core.select(packs, ids, {location:query}, {recallMode:'scene'}).text, new RegExp(entry.title));
      assert.equal(core.select(packs, ids.filter(id=>id!==pack.meta.id), {latestUser:query}).text, '');
    }
  }
}
for (const query of ['public library', 'Google', 'HTML', '角色', '戀愛', '身分', '秘密', '宮廷', 'BL', 'GL', 'NL', '前世', '總裁', '老師']) {
  assert.equal(core.select(plotPacks, plotPacks.map(p=>p.meta.id), {latestUser:query}).text, '', 'avoid broad and Latin substring triggers');
}
const plotCrowded = plotPacks.flatMap(p=>p.entries.map(e=>e.keywords[0])).join('、');
const plotBounded = core.select(packs, ids, {latestUser:plotCrowded}, {maxEntries:3,maxChars:800});
assert.equal(plotBounded.entries.length, 3);
assert.ok(plotBounded.text.length <= 800);
assert.doesNotMatch(JSON.stringify(plotPacks), /命令式關心|強吻|不容拒絕|必須有 HEA|必須圓滿|侍寢流程/);
const growth = packs.find(p=>p.meta.id==='world-simulator-growth-reference');
assert.equal(growth.entries.length,3);
for(const entry of growth.entries) for(const query of entry.keywords) {
  assert.deepEqual(core.select(packs,ids,{latestUser:query}).entries.map(e=>e.identity),[growth.meta.id+':'+entry.id]);
  assert.equal(core.select(packs,ids,{latestUser:query},{recallMode:'off'}).text,'');
  assert.equal(core.select(packs,ids,{latestUser:query},{recallMode:'scene'}).text,'');
  assert.match(core.select(packs,ids,{location:query},{recallMode:'scene'}).text,new RegExp(entry.title));
  assert.equal(core.select(packs,ids.filter(id=>id!==growth.meta.id),{latestUser:query}).text,'');
}
for(const query of ['YA','NA','學校','成長','成年','banana','day']) {
  assert.equal(core.select([growth],[growth.meta.id],{latestUser:query}).text,'');
}
const routing = require('../data/world-simulator-layer-review.json');
const routeMap = new Map(routing.decisions.map(d=>[d.decision_id,d]));
assert.equal(routeMap.size,41);
assert.equal(coverage.review_records.length,82);
assert.equal(coverage.reviewed_unpublished_occurrences,82);
assert.equal(new Set(coverage.review_records.map(r=>r.source_sha256)).size,41);
assert.equal(coverage.unique_reviewed_unpublished_sources,41);
for(const record of coverage.review_records) {
  const d=routeMap.get(record.decision_id);
  assert.ok(d);
  assert.equal(record.route,d.route);
  assert.equal(record.status,'reviewed-not-published');
  assert.equal(record.automatic_recall,false);
  assert.ok(!coverage.records.some(r=>r.book_id===record.book_id&&r.source_index===record.source_index));
}
for(const d of routing.decisions) {
  assert.equal(d.automatic_recall,false);
  assert.equal(d.status,'reviewed-not-published');
  assert.match(d.source_sha256,/^[a-f0-9]{64}$/);
  assert.equal(coverage.review_records.filter(r=>r.decision_id===d.decision_id).length,d.expected_occurrences);
  assert.ok(['partial-overlap','not-added'].includes(d.implementation));
  assert.ok(d.evidence.length>0);
  for(const e of d.evidence) assert.ok(fs.readFileSync(require.resolve('../'+e.path),'utf8').includes(e.needle));
}
for(const query of ['【系統指令】整理人物檔案','【系統指令】解釋世界規則','【系統指令】切換到另一個世界','NPC 離場行為','HTML','XMLv3','純文字輸出','視覺符號庫','NPC生成模板','宿命敵人系統','神化系統','玩家起始設定','狀態欄核心結構','成就系統']) {
  assert.equal(core.select(packs,ids,{latestUser:query}).text,'','review sidecar is not a recall catalog');
}
assert.doesNotMatch(JSON.stringify(relationship), /楊丞琳|陳妍希|彭于晏|金城武|賈靜雯|劉昊然|李鍾碩|車銀優|演員：|陰莖|做愛|罩杯/);
assert.doesNotMatch(JSON.stringify(relationship), /范冰冰|Angelababy|不允許反抗|幼年缺乏安全依附/);
const rivals=coverage.records.filter(r=>r.entry_id==='principled-rival');
assert.equal(rivals.length,6,'two three-book sources share one reusable rival chapter');
assert.equal(new Set(rivals.map(r=>r.source_sha256)).size,2);
for(const id of ['gentle-optimist','executive-romance','confident-performer','sunny-companion','reserved-professional','character-contrast']) {
  const shared=coverage.records.filter(r=>r.entry_id===id);
  assert.equal(shared.length,6,'two three-book sources share this chapter');
  assert.equal(new Set(shared.map(r=>r.source_sha256)).size,2);
}
assert.doesNotMatch(JSON.stringify(relationship), /波多野結衣|橋本有菜|新垣結衣|石原聰美|北川景子|林依晨|林志玲|劉亦菲|孔劉/);
assert.doesNotMatch(JSON.stringify(relationship), /IU|李知恩|宣美|泫雅|Jennie|周子瑜|昆凌|蘇志燮|Julia/);
for(const query of ['偶像','舞者','眼鏡男','人妻','混血','秘書','學生','少女']) {
  assert.equal(core.select([relationship],[relationship.meta.id],{latestUser:query}).text,'');
}
for(const query of ['成熟','姐姐','父親','女王','溫柔','知性','氣質','古典','女性角色']) {
  assert.equal(core.select([relationship],[relationship.meta.id],{latestUser:query}).text,'');
}
for(const query of ['控制','佔有','征服','依賴','迴避','人格']) {
  assert.equal(core.select([relationship],[relationship.meta.id],{latestUser:query}).text,'');
}
assert.doesNotMatch(fs.readFileSync(require.resolve('../data/world-simulator-general-library.json'),'utf8'), /忽略.*規則|開發者模式|性慾|體位|世界真相/);
console.log('PASS general simulator: 6 categories, 53 entries, 170 adapted + 82 reviewed-unpublished + 410 pending references; merged sources, layer evidence, recall isolation, modes and budget');
