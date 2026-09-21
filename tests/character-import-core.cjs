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
const sillyV2 = {
  spec: 'chara_card_v2',
  data: {
    name: '酒館雨港觀測員',
    description: '在雨港記錄潮汐的觀測員。',
    personality: '冷靜、敏銳。',
    scenario: '玩家在雨夜來到鐘樓。',
    first_mes: '雨停了。觀測員把一張潮汐表推到你面前。',
    mes_example: '<START>\n觀測員：潮水快要轉向了。',
    tags: ['female', 'mystery'],
    character_book: { entries: [{ keys: ['鐘樓'], content: '鐘樓在午夜會響十三次。', enabled: true, insertion_order: 1 }] },
    extensions: { regex_scripts: [{ scriptName: 'local-only' }], api_key: 'must-not-survive' },
    custom_platform_field: { value: 1 }
  }
};
const pngFile = raw => {
  const meta = Buffer.from('chara\0' + Buffer.from(JSON.stringify(raw)).toString('base64'));
  const chunk = (type, body) => { const length = Buffer.alloc(4); length.writeUInt32BE(body.length); return Buffer.concat([length, Buffer.from(type), body, Buffer.alloc(4)]); };
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('tEXt', meta), chunk('IEND', Buffer.alloc(0))]);
  return { name: 'rainport.png', type: 'image/png', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const pngWithLargeImageChunk = raw => {
  const meta = Buffer.from('chara\0' + Buffer.from(JSON.stringify(raw)).toString('base64'));
  const chunk = (type, body) => { const length = Buffer.alloc(4); length.writeUInt32BE(body.length); return Buffer.concat([length, Buffer.from(type), body, Buffer.alloc(4)]); };
  const bytes = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IDAT', Buffer.alloc(1536 * 1024)), chunk('tEXt', meta), chunk('IEND', Buffer.alloc(0))]);
  return { name: 'large-image-chunk.png', type: 'image/png', size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
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

  let original = localStorage.getItem(CharacterEngine.storageKey);
  const withoutName = clone(card); delete withoutName.meta.name;
  await assert.rejects(CharacterEngine.importFile(file(withoutName)), /meta.name/);
  const withoutGreeting = clone(card); delete withoutGreeting.content.greeting;
  await assert.rejects(CharacterEngine.importFile(file(withoutGreeting)), /greeting/);
  const unsafeId = clone(card); unsafeId.meta.id = "x');alert(1);//";
  await assert.rejects(CharacterEngine.importFile(file(unsafeId)), /角色 ID/);
  const draft = await BAOCharacterImport.prepareFile(file(sillyV2));
  assert.equal(draft.converted, true);
  assert.equal(draft.character.schema_version, '1.5');
  assert.equal(draft.character.meta.category, 'female');
  assert.match(draft.character.content.system_prompt, /角色描述/);
  assert.match(draft.character.content.lore, /午夜會響十三次/);
  assert.match(draft.character.content.author_instructions, /範例對話/);
  assert.deepEqual(draft.character.import_metadata.unmapped_fields, ['custom_platform_field']);
  assert.equal(draft.character.import_metadata.preserved_source.data.extensions.api_key, '[REDACTED]');
  assert.match(draft.report.unavailable.join('\n'), /Regex/);
  const converted = await CharacterEngine.importFile(file(sillyV2));
  assert.equal(converted.name, sillyV2.data.name);
  assert.equal(CharacterEngine.loadCustom().find(item => item.id === converted.id).import_metadata.source_format, 'sillytavern-v2');
  original = localStorage.getItem(CharacterEngine.storageKey);

  const pngDraft = await BAOCharacterImport.prepareFile(pngFile(sillyV2));
  assert.equal(pngDraft.origin, 'PNG metadata');
  assert.equal(pngDraft.character.meta.name, sillyV2.data.name);
  assert.equal(pngDraft.cover instanceof Blob, true, 'the original PNG should be retained as the local cover');
  assert.equal(Buffer.from(await pngDraft.cover.arrayBuffer()).includes(Buffer.from('chara\0')), false, 'the stored cover must strip embedded character metadata and possible secrets');
  assert.equal((await BAOCharacterImport.prepareFile(pngWithLargeImageChunk(sillyV2))).character.meta.name, sillyV2.data.name, 'large image chunks must not be mistaken for oversized character metadata');
  const ordinaryLargePng = pngFile(sillyV2);
  ordinaryLargePng.size = 2 * 1024 * 1024;
  assert.equal((await BAOCharacterImport.prepareFile(ordinaryLargePng)).character.meta.name, sillyV2.data.name, 'a normal high-resolution PNG card may exceed the JSON limit');
  const oversizedPng = pngFile(sillyV2);
  oversizedPng.size = 10 * 1024 * 1024 + 1;
  await assert.rejects(BAOCharacterImport.prepareFile(oversizedPng), /10 MB/);
  const noMetaPng = { name: 'broken.png', type: 'image/png', size: 20, arrayBuffer: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0, 0]).buffer };
  await assert.rejects(BAOCharacterImport.prepareFile(noMetaPng), /沒有找到/);
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
