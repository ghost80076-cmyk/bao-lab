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
global.App = { characters: [] };
global.confirm = () => true;

vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'character.js'), 'utf8')
);
CharacterEngine.audit = raw =>
  raw.badStructure ? { ok: false, errors: ['bad structure'] } : { ok: true, errors: [] };
vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'character-import-upgrade.js'), 'utf8')
);

const pngFile = raw => {
  const meta = Buffer.from(
    'chara\0' + Buffer.from(JSON.stringify(raw)).toString('base64')
  );
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    return Buffer.concat([length, Buffer.from(type), body, Buffer.alloc(4)]);
  };
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('tEXt', meta),
    chunk('IEND', Buffer.alloc(0))
  ]);
  return {
    name: 'png-test-character.png',
    type: 'image/png',
    size: bytes.length,
    arrayBuffer: async () =>
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  };
};

(async () => {
  const nativeCard = {
    schema_version: '1.5',
    meta: {
      id: 'png-test-character',
      name: 'PNG測試角色',
      title: 'PNG測試角色',
      category: 'general',
      rating: 'general',
      description: 'PNG roundtrip regression'
    },
    content: {
      greeting: '這是夜灣原生 PNG 開場。',
      system_prompt: '角色冷淡慢熱，依互動逐步建立信任。',
      world: '雨港世界設定。'
    },
    gameplay: {
      supported_modes: { immersive: true, world: true },
      world_modules: [
        {
          id: 'clock',
          name: '時鐘',
          fields: [{ key: 'hour', label: '小時' }]
        }
      ],
      initial_state: {
        time: '凌晨',
        location: '雨港',
        events: [],
        npcs: []
      }
    },
    presentation: {
      supported_display: { text: true, ui: true },
      opening: {
        type: 'story',
        label: '測試開場'
      }
    }
  };

  const envelope = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'PNG測試角色',
      description: 'fallback description',
      first_mes: 'fallback greeting',
      extensions: {
        yorubay: {
          schema: 'yorubay-character-1.5',
          character: nativeCard
        }
      }
    }
  };

  const draft = await BAOCharacterImport.prepareFile(pngFile(envelope));

  assert.equal(draft.converted, false);
  assert.equal(draft.format, 'YoruBay Character Card PNG');
  assert.equal(draft.origin, 'PNG metadata');

  assert.equal(draft.character.id, 'png-test-character');
  assert.equal(draft.character.name, 'PNG測試角色');
  assert.equal(draft.character.greeting, '這是夜灣原生 PNG 開場。');
  assert.equal(
    draft.character.system_prompt,
    '角色冷淡慢熱，依互動逐步建立信任。'
  );
  assert.equal(draft.character.world, '雨港世界設定。');
  assert.equal(draft.character.world_modules[0].id, 'clock');
  assert.equal(draft.character.initial_state.location, '雨港');
  assert.equal(draft.character.opening.type, 'story');
  assert.equal(draft.character.opening.label, '測試開場');

  assert.equal(
    draft.character.import_metadata.source_format,
    'yorubay-character-card-v2'
  );
  assert.equal(draft.character.import_metadata.roundtrip_restored, true);

  assert.equal(draft.cover instanceof Blob, true);
  assert.equal(
    Buffer.from(await draft.cover.arrayBuffer()).includes(Buffer.from('chara\0')),
    false
  );

  const invalidEnvelope = structuredClone(envelope);
  delete invalidEnvelope.data.extensions.yorubay.character.content.greeting;

  await assert.rejects(
    BAOCharacterImport.prepareFile(pngFile(invalidEnvelope)),
    /greeting/
  );

  console.log('YoruBay PNG native roundtrip import checks passed.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
