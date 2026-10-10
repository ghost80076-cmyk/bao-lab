const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const core = require('../js/worldbook-library-core.js');
const catalog = JSON.parse(fs.readFileSync('data/worldbook-library.json', 'utf8'));
const map = JSON.parse(fs.readFileSync('data/three-realms-secret-lore-source-map.json', 'utf8'));
const all = catalog.packs.map(core.normalizePack);
const packs = all.filter(p => p.meta.id.startsWith('three-realms-secret-'));
const enabled = packs.map(p => p.meta.id);
const query = latestUser => core.select(packs, enabled, { latestUser, world: 'three-realms' });
assert.equal(packs.length, 2);
assert.equal(packs.flatMap(p => p.entries).length, 23);
assert.ok(packs.every(p => p.meta.visibility === 'public' && p.meta.world === 'three-realms'));
assert.ok(packs.every(p => p.entries.every(e => e.mode === 'keyword' && !e.review_required)));
assert.equal(query('休息 修煉 秘境 洞府 一級秘境 秘境等級 秘境規則 基本概念').text, '');
assert.equal(core.select(packs, [], { latestUser: '仙帝洞府' }).text, '');
assert.equal(core.select(packs, enabled, { latestUser: '仙帝洞府', world: 'sunrise-city' }).text, '');
for (const [input, heading] of [['三界一級秘境', '一級秘境'], ['三界洞府類秘境', '洞府類'], ['三界秘境規則', '秘境規則'], ['劍仙洞府', '劍仙洞府'], ['丹王遺跡', '丹王遺跡'], ['萬獸山谷', '萬獸山谷'], ['上古戰場', '上古戰場'], ['仙帝洞府', '仙帝洞府'], ['混沌之地', '混沌之地'], ['時空裂縫', '時空裂縫'], ['輪迴之地', '輪迴之地']]) {
  const found = query(input);
  assert.equal(found.entries.length, 1, input);
  assert.ok(found.entries[0].title.endsWith('｜' + heading));
  assert.ok(found.text.length <= 2200);
}
assert.match(query('三界一級秘境').text, /練氣期至築基期（下界）/);
assert.match(query('三界一級秘境').text, /人仙期至地仙期（中界）/);
assert.doesNotMatch(query('三界一級秘境').text, /【二級秘境】/);
assert.doesNotMatch(query('劍仙洞府').text, /### 丹王遺跡|### 萬獸山谷/);
assert.doesNotMatch(query('上古戰場').text, /中界著名秘境|仙帝洞府/);
assert.match(query('仙帝洞府').text, /中界著名秘境/);
assert.doesNotMatch(query('仙帝洞府').text, /下界著名秘境|### 上古戰場/);
// Keep the author's original malformed bracket; do not silently rewrite source text.
assert.match(query('上古戰場').text, /【位置：中央大陸邊緣/);
const migrated = all.filter(p => p.meta.id.startsWith('three-realms-') && !p.meta.id.endsWith('-demo'));
const combined = latestUser => core.select(migrated, migrated.map(p => p.meta.id), { latestUser, world: 'three-realms' });
assert.equal(combined('秘境等級 秘境類型 秘境開啟 秘境危險 秘境規則').text, '');
const lower = combined('下界秘境等級');
assert.equal(lower.entries.length, 1);
assert.equal(lower.entries[0].pack, 'three-realms-atlas-secret-realms');
assert.match(lower.text, /適合練氣期修士/);
assert.doesNotMatch(lower.text, /人仙期至地仙期|練氣期至築基期/);
const cross = combined('三界一級秘境');
assert.equal(cross.entries.length, 1);
assert.equal(cross.entries[0].pack, 'three-realms-secret-system');
assert.match(cross.text, /人仙期至地仙期/);
assert.doesNotMatch(cross.text, /數量最多/);
for (const [input, pack, excluded] of [
  ['下界秘境規則', 'three-realms-atlas-secret-realms', /禁止殺戮/],
  ['三界秘境規則', 'three-realms-secret-system', /死亡規則/],
  ['龍淵秘境', 'three-realms-atlas-secret-realms', /仙帝洞府/],
  ['中界仙帝洞府', 'three-realms-secret-sites', /龍淵秘境/]
]) {
  const result = combined(input);
  assert.equal(result.entries.length, input === '龍淵秘境' ? 2 : 1, input);
  if (input === '龍淵秘境') assert.equal(result.entries[1].pack, 'three-realms-lower-geography', 'existing location keyword 龍淵 can recall its map');
  assert.equal(result.entries[0].pack, pack);
  assert.doesNotMatch(result.text, excluded);
}
const before = JSON.stringify(migrated);
const overload = combined('天道宗 烏坦城 築基丹 鬼市任務 青霜仙劍 金色氣運 祖龍神血 三界一級秘境 仙帝洞府 劍仙洞府 龍淵秘境 下界秘境等級');
assert.ok(overload.entries.length <= 4 && overload.text.length <= 2200);
assert.equal(JSON.stringify(migrated), before, 'recall cannot mutate world data');
const old = all.find(p => p.meta.id === 'three-realms-atlas-secret-realms');
assert.equal(old.meta.release, '1.0.1');
assert.equal(map.source_visibility, '公開');
assert.equal(map.source_entry_count, 191);
assert.equal(map.migrated_source_entries, 2);
assert.deepEqual(map.records.map(r => r.source_index), [161, 162]);
const priorMaps = ['data/three-realms-worldbook-source-map.json', 'data/three-realms-encyclopedia-source-map.json', 'data/three-realms-lower-atlas-source-map.json', 'data/three-realms-middle-lore-source-map.json', 'data/three-realms-advanced-lore-source-map.json', 'data/three-realms-cosmic-lore-source-map.json'].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
const priorIndices = new Set(priorMaps.flatMap(m => m.records.map(r => r.source_index)));
assert.ok(map.records.every(r => !priorIndices.has(r.source_index)));
const byId = new Map(packs.flatMap(p => p.entries.map(e => [p.meta.id + ':' + e.id, e])));
const seen = new Set();
for (const source of map.records) {
  assert.match(source.source_sha256, /^[a-f0-9]{64}$/);
  let cursor = 0;
  for (const target of source.destinations) {
    assert.equal(target.start, cursor);
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
console.log('Secret lore: 2 sources / 23 chapters, exact coverage, separate grading systems, named recall, opt-in and shared budget passed.');
