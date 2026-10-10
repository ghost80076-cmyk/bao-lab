const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-middle-lore-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-midlore-'));
const enabled = packs.map(p => p.meta.id);
const query = latestUser => core.select(packs, enabled, { latestUser, world: 'three-realms' });
assert.equal(packs.length, 7);
assert.equal(packs.flatMap(p => p.entries).length, 76);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(query('休息 修煉 中界 勢力 資源 仙藥 仙礦 仙獸 仙石 基本概念 等級').text, '');
assert.equal(core.select(packs, [], { latestUser: '仙靈草' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '仙靈草', world: 'sunrise-city' }).text, '');
for (const [input, heading] of [['仙靈草', '仙靈草'], ['星辰鐵', '星辰鐵'], ['真龍鱗', '真龍鱗'], ['仙石等級', '仙石等級'], ['仙帝宮', '仙帝宮'], ['劍仙宗', '劍仙宗'], ['東南仙域藥王谷', '藥王谷'], ['中界殺手聯盟', '殺手聯盟']]) {
  const found = query(input);
  assert.equal(found.entries.length, 1, input + ' recalls its own chapter');
  assert.ok(found.entries[0].title.endsWith('｜' + heading));
  assert.ok(found.text.length <= 2200);
}
assert.doesNotMatch(query('仙靈草').text, /### 千年仙參|### 輪迴花/);
assert.doesNotMatch(query('星辰鐵').text, /### 仙鐵|### 鴻蒙石/);
assert.doesNotMatch(query('仙盟介紹').text, /中界勢力/);
assert.equal(query('藥王谷 天庭 佛門 散修聯盟 魔道聯盟 商盟 殺手聯盟').text, '');
assert.doesNotMatch(query('中界仙盟').text, /東方仙域|條目類型|## 劍仙宗/);
assert.match(query('劍仙宗').text, /中界勢力-東方仙域/);
assert.match(query('飛升中界').text, /修為被壓制到人仙初期/);
// Scope the collision check to published original packs, excluding foundation demos.
const allEnabled = all.filter(p => p.meta.id.startsWith('three-realms-') && !p.meta.id.endsWith('-demo')).map(p => p.meta.id);
const combined = input => core.select(all, allEnabled, { latestUser: input, world: 'three-realms' });
assert.equal(combined('藥王谷').text, '', 'ambiguous location requires a realm-qualified name');
assert.equal(combined('中界藥王谷').entries.length, 1);
assert.match(combined('中界藥王谷').text, /東南仙域東南部/);
assert.doesNotMatch(combined('中界藥王谷').text, /西方大陸/);
assert.match(combined('下界藥王谷').text, /西方大陸/);
assert.doesNotMatch(combined('下界藥王谷').text, /東南仙域東南部/);
const overload = combined('天道宗 烏坦城 九霄神殿 築基丹 須彌戒 鬼市任務 仙帝宮 仙靈草 星辰鐵 真龍鱗 仙石等級 中界仙盟');
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 14);
assert.deepEqual(map.records.map(r => r.source_index), [141, 143, 144, 145, 146, 152, 153, 154, 155, 156, 157, 158, 159, 160]);
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json', 'data/three-realms-lower-atlas-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const priorIndices = new Set(priorMaps.flatMap(m => m.records.map(r => r.source_index)));
assert.ok(map.records.every(r => !priorIndices.has(r.source_index)), 'no source is republished across stages');
const byId = new Map(packs.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));
const seen = new Set();
for (const source of map.records) {
  assert.match(source.source_sha256, /^[a-f0-9]{64}$/);
  let cursor = 0;
  for (const target of source.destinations) {
    assert.equal(target.start, cursor, 'every source span must be covered once');
    assert.ok(target.end > target.start);
    const id = target.pack_id + ':' + target.entry_id;
    assert.ok(!seen.has(id)); seen.add(id);
    const entry = byId.get(id);
    assert.ok(entry);
    assert.equal(crypto.createHash('sha256').update(entry.content).digest('hex'), target.content_sha256);
    cursor = target.end;
  }
  assert.equal(cursor, source.source_chars);
}
assert.equal(seen.size, map.generated_entries);
assert.equal(seen.size, byId.size);
console.log('Middle lore: 14 sources / 76 chapters, exact hashes, coverage, mixed factions, realm-qualified collisions and shared budget passed.');
