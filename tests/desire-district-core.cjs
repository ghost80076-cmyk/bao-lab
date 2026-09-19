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
assert.ok(card.content.greeting.includes('src="https://videotourl.com/audio/'), '音訊必須是直接網址');
assert.ok(!/<script\b|\son\w+\s*=/i.test(card.content.greeting), '開場不得帶入可執行腳本或事件屬性');
assert.ok(card.content.system_prompt.includes('18歲以上成年人'));
assert.ok(card.content.system_prompt.includes('不等於對額外行為的同意'));
assert.ok(card.content.world.includes('霓港島'));
assert.ok(card.content.world.includes('持證性工作者'));
assert.ok(card.content.system_prompt.includes('貓姐兒是開場入口的實際'));
assert.equal(card.gameplay.initial_state.npcs[0].presence, 'present');
const modules = card.gameplay.world_modules;
const moduleIds = modules.map(module => module.id);
assert.equal(new Set(moduleIds).size, moduleIds.length);
const initial = card.gameplay.initial_state;
for (const name of Object.keys(initial.modules)) {
  assert.ok(moduleIds.includes(name), `初始狀態缺少模組定義：${name}`);
}
for (const module of modules.filter(item => item.kind === 'object')) {
  const current = initial.modules[module.id];
  for (const field of module.fields) {
    assert.ok(Object.hasOwn(current, field.key), `初始狀態缺少 ${module.id}.${field.key}`);
  }
}
assert.equal(initial.modules.economy.amount, 20000);
assert.equal(initial.modules.status.stamina, 100);
assert.equal(initial.modules.status.ability, 50);
assert.equal(initial.modules.skills.sexual_technique, 0);
assert.equal(initial.modules.occupation.services_today, 0);
assert.equal(initial.modules.occupation.services_total, 0);
assert.equal(initial.npcs[0].name, '貓姐兒');
assert.deepEqual(Object.keys(initial.character_statuses), ['貓姐兒']);
assert.ok(initial.npcs[0].notes.includes('開場時在登記處與玩家互動的當前NPC'));
const statusFields = card.gameplay.character_status.fields;
assert.ok(statusFields.length <= 24);
assert.equal(new Set(statusFields.map(field => field.key)).size, statusFields.length);
for (const field of statusFields) {
  assert.ok(Object.hasOwn(initial.character_statuses['貓姐兒'], field.key), `貓姐兒示例缺少 ${field.key}`);
}
for (const name of ['district-economy', 'district-intimacy', 'district-offscreen']) {
  assert.ok(card.gameplay.dynamic_prompts.some(item => item.id === name), `缺少動態模組 ${name}`);
}
console.log('Desire District adult world, status, skills, NPC and greeting checks passed.');
