const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
global.window = global;
global.localStorage = new MemoryStorage();
global.App = { characters: [{ id: 'linchenfeng', source: 'built-in' }] };
global.confirm = () => true;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'character.js'), 'utf8'));
CharacterEngine.audit = raw => raw.badStructure ? { ok: false, errors: ['重複欄位'] } : { ok: true, errors: [] };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'character-import-upgrade.js'), 'utf8'));

const file = raw => ({ size: Buffer.byteLength(JSON.stringify(raw)), text: async () => JSON.stringify(raw) });
const template = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'characters', 'character-basic-template.json'), 'utf8'));
const clone = data => structuredClone(data);

(async () => {
  assert.equal(BAOCharacterImport.inspect(template).name, '請填入角色姓名');
  const card = clone(template);
  card.meta.id = 'tested-card';
  card.meta.name = '測試角色';
  card.content.system_prompt = '角色遵守世界因果，依可見資訊行動。';
  card.content.greeting = '雨停了，角色在車站等候。';
  card.content.lore = '只有角色知道的秘密。';
  card.gameplay.initial_state.location = '雨港';
  const imported = await CharacterEngine.importFile(file(card));
  assert.equal(imported.name, '測試角色');
  assert.equal(imported.source, 'local-import');
  const stored = CharacterEngine.loadCustom().find(item => item.id === 'tested-card');
  assert.equal(stored.greeting, card.content.greeting);
  assert.equal(stored.system_prompt, card.content.system_prompt);
  assert.equal(stored.lore, card.content.lore);
  assert.equal(stored.initial_state.location, '雨港');

  const original = localStorage.getItem(CharacterEngine.storageKey);
  const withoutName = clone(card); delete withoutName.meta.name;
  await assert.rejects(CharacterEngine.importFile(file(withoutName)), /meta.name/);
  const withoutGreeting = clone(card); delete withoutGreeting.content.greeting;
  await assert.rejects(CharacterEngine.importFile(file(withoutGreeting)), /greeting/);
  const unsafeId = clone(card); unsafeId.meta.id = "x');alert(1);//";
  await assert.rejects(CharacterEngine.importFile(file(unsafeId)), /角色 ID/);
  const unsupported = { spec: 'chara_card_v2', data: { name: '酒館角色' } };
  await assert.rejects(CharacterEngine.importFile(file(unsupported)), /酒館/);
  const collide = clone(card); collide.meta.id = 'linchenfeng';
  await assert.rejects(CharacterEngine.importFile(file(collide)), /內建作品/);
  const malformed = { size: 6, text: async () => '{nope}' };
  await assert.rejects(CharacterEngine.importFile(malformed), /JSON 語法/);
  const broken = clone(card); broken.badStructure = true;
  await assert.rejects(CharacterEngine.importFile(file(broken)), /結構錯誤/);
  assert.equal(localStorage.getItem(CharacterEngine.storageKey), original, 'invalid imports must not change the library');

  global.confirm = () => false;
  const revised = clone(card); revised.content.greeting = '另一個開場';
  await assert.rejects(CharacterEngine.importFile(file(revised)), /已取消/);
  assert.equal(localStorage.getItem(CharacterEngine.storageKey), original, 'cancel must preserve existing role');
  global.confirm = () => true;
  await CharacterEngine.importFile(file(revised));
  assert.equal(CharacterEngine.loadCustom().find(item => item.id === 'tested-card').greeting, '另一個開場');
  localStorage.setItem(CharacterEngine.storageKey, '{corrupted');
  await assert.rejects(CharacterEngine.importFile(file(revised)), /避免覆蓋資料/);
  assert.equal(localStorage.getItem(CharacterEngine.storageKey), '{corrupted');
  console.log('Character JSON import hardening core checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
