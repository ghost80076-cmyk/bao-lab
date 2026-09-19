const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const registry = JSON.parse(fs.readFileSync(path.join(root, 'data/characters.json'), 'utf8'));
const item = registry.find(entry => entry.id === 'desire-district');
assert.ok(item, '角色必須在角色目錄中');
assert.equal(registry.filter(entry => entry.id === 'desire-district').length, 1, '目錄不得重複');
const card = JSON.parse(fs.readFileSync(path.join(root, item.file), 'utf8'));
assert.equal(card.schema_version, '1.5');
assert.equal(card.meta.id, item.id);
assert.equal(card.meta.category, 'r18');
assert.equal(card.meta.rating, 'adult');
assert.equal(card.meta.avatar, 'https://i.meee.com.tw/nfkc3T3.jpg');
assert.ok(card.content.greeting.includes('貓姐兒'));
assert.ok(card.content.greeting.includes('<details>'), '開場介紹應可折疊');
assert.ok(card.content.greeting.includes('<audio controls'), '開場提供可選播放器');
assert.ok(card.content.greeting.includes('src="https://videotourl.com/audio/'), '音訊必須是直接網址，而非 Markdown 連結');
assert.ok(!/<script\b|\son\w+\s*=/i.test(card.content.greeting), '開場不得帶入可執行腳本或事件屬性');
assert.equal(card.gameplay.initial_state.modules.economy.amount, 20000);
assert.equal(card.gameplay.initial_state.modules.status.stamina, 100);
assert.equal(card.gameplay.initial_state.npcs[0].name, '貓姐兒');
assert.ok(card.gameplay.initial_state.character_statuses['貓姐兒']);
const moduleIds = card.gameplay.world_modules.map(module => module.id);
assert.equal(new Set(moduleIds).size, moduleIds.length);
for (const name of Object.keys(card.gameplay.initial_state.modules)) {
  assert.ok(moduleIds.includes(name), `初始狀態缺少模組定義：${name}`);
}
assert.ok(card.gameplay.dynamic_prompts.some(item => item.id === 'district-relations'));
assert.ok(card.content.system_prompt.includes('21歲以上'));
assert.ok(card.content.system_prompt.includes('不等於同意'));
console.log('Desire District card manifest, schema, greeting and state checks passed.');
