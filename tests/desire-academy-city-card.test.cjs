'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const card = require('../data/characters/community/da/desire-academy-city.json');
const catalog = require('../data/character-catalog/community/page-0001.json');
const manifest = require('../data/character-catalog/community/manifest.json');
const GameplayUI = require('../js/gameplay-ui-core.js');

assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, 'desire-academy-city');
assert.equal(card.meta.category, 'male');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.gender, 'all');

const entry = catalog.find(item => item.id === card.meta.id);
assert.ok(entry, 'community catalog should include desire-academy-city');
assert.equal(entry.file, 'data/characters/community/da/desire-academy-city.json');
assert.equal(entry.avatar, card.meta.avatar);
assert.equal(entry.rating, 'adult');
assert.equal(manifest.total, catalog.length);
assert.equal(manifest.pages[0].count, catalog.length);

const coverPath = path.join(__dirname, '..', card.meta.avatar);
assert.ok(fs.existsSync(coverPath), 'cover should exist');
const cover = fs.readFileSync(coverPath);
assert.equal(cover.subarray(0, 4).toString('ascii'), 'RIFF');
assert.equal(cover.subarray(8, 12).toString('ascii'), 'WEBP');

assert.match(card.content.system_prompt, /所有固定角色都是 21 歲以上專業演員/);
assert.match(card.content.system_prompt, /鏡頭內／幕後/);
assert.match(card.content.system_prompt, /數值色情遊戲/);
assert.match(card.content.system_prompt, /不得聲稱角色就是現實存在的 AV 女優/);
assert.match(card.content.system_prompt, /不得替玩家輸出新台詞/);
assert.match(card.content.system_prompt, /動態演員生態/);
assert.match(card.content.system_prompt, /臨演／客串 → 常駐配角 → 核心演員/);
assert.match(card.content.system_prompt, /不要為了熱鬧而每輪亂生新人/);

const builder = card.gameplay.ui_schema.builder;
const roleField = builder.fields.find(item => item.key === 'stage_role');
assert.deepEqual(roleField.options, [
  '新入學的學生',
  '新來的老師',
  '特別學員',
  '學園理事長',
  '外部人士',
  '特殊服務人員'
]);
const ageField = builder.fields.find(item => item.key === 'age');
assert.equal(ageField.min, 21);

const npcNames = new Set(card.gameplay.initial_state.npcs.map(npc => npc.name));
for (const name of ['東條有希','瑞原凜','宇都宮沙希','夢佳','高井美月','小春','高梨天羽','艾爾米亞','麗華']) {
  assert.ok(npcNames.has(name), `missing performer ${name}`);
}

const moduleIds = new Set(card.gameplay.world_modules.map(item => item.id));
for (const id of ['production_state','player_casting','player_stats','scene_score','skill_book','cast_roster','relations','scene_participants','open_threads','production_log','cast_pipeline','production_people']) {
  assert.ok(moduleIds.has(id), `missing world module ${id}`);
}

const promptIds = new Set(card.content.dynamic_prompts.map(item => item.id));
for (const id of ['camera-layer','performer-dex','scene-scoring','adult-scene','taboo-script','world-motion','cast-generation','cast-promotion']) {
  assert.ok(promptIds.has(id), `missing dynamic prompt ${id}`);
}

const normalized = GameplayUI.normalize(card.gameplay.ui_schema);
assert.ok(normalized, 'Gameplay UI schema should normalize');
assert.deepEqual(normalized.panels.map(panel => panel.id), ['studio','stats','cast','skills','actions']);
assert.equal(normalized.theme.preset, 'noir');
assert.ok(card.gameplay.initial_state.modules.cast_pipeline.some(item => item.includes('核心｜')));
assert.ok(card.gameplay.initial_state.modules.cast_pipeline.some(item => item.includes('常駐配角')));
assert.ok(card.gameplay.initial_state.modules.production_people.length >= 1);

const opening = JSON.stringify(card.presentation.opening);
assert.doesNotMatch(opening, /<script\b/i);
assert.doesNotMatch(opening, /hc-collapse|hc-h1|hc-n/i);
assert.ok(card.presentation.opening.choices.some(choice => choice.includes('第一個棚位')));
assert.match(card.content.system_prompt,/【開局資料來源】/);
assert.match(card.content.system_prompt,/不得再次問玩家今晚要演誰/);
assert.doesNotMatch(card.content.greeting,/通行證還是空白|先決定今晚要演誰/);

console.log('PASS desire academy actor-layer, stats, adult gate, catalog, cover and Gameplay UI');
