const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/character-library-repair.js'), 'utf8');
const legacyKey = 'bao-lab:custom-characters';
const pendingKey = 'bao-lab:character-pending-upserts-v1';
const card = (id, category = 'male', name = id) => ({
  id, name, title: name, category, greeting: '開場', system_prompt: '設定', source: 'local-import'
});
const settle = () => new Promise(resolve => setTimeout(resolve, 25));

function fixture({ studio = false, legacy = null, pending = null, stored = [], storage = null, fail = false } = {}) {
  const data = storage || new Map();
  if (legacy !== null) data.set(legacyKey, JSON.stringify(legacy));
  if (pending !== null) data.set(pendingKey, JSON.stringify(pending));
  const localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: key => data.delete(key)
  };
  let records = structuredClone(stored);
  let renders = 0;
  const engine = {
    storageKey: legacyKey,
    normalize: raw => ({ ...raw }),
    loadCustom: () => records.map(x => ({ ...x })),
    loadCustomAsync: async () => records.map(x => ({ ...x })),
    readyCustomLibrary: async () => {},
    saveCustomAsync: async raw => {
      if (fail) throw new Error('database unavailable');
      records = [{ ...raw }, ...records.filter(x => x.id !== raw.id)];
    },
    // Old synchronous install can return before IndexedDB actually writes.
    saveCustom: raw => ({ ...raw })
  };
  const app = {
    characters: [...records, { id: 'built-in', source: 'built-in' }],
    renderCharacters: () => { renders++; }
  };
  const document = {
    getElementById: id => studio && id === 'studio-form' ? {} : null,
    querySelector: () => null
  };
  // Deliberately leave window.CharacterEngine undefined: the homepage's
  // top-level const is only accessible as a global lexical binding.
  const window = { App: app };
  vm.runInNewContext(source, { CharacterEngine: engine, window, document, localStorage, setTimeout, console: { warn() {} } });
  return { engine, app, data, getRecords: () => records, getRenders: () => renders };
}

test('a second distinct-ID studio card is recovered without overwriting an existing card', async () => {
  const original = card('first', 'male', 'original in IndexedDB');
  const oldConflict = card('first', 'r18', 'old duplicate');
  const lostSecond = card('second', 'male');
  const ctx = fixture({ stored: [original], legacy: [oldConflict, lostSecond] });
  await settle();
  assert.equal(ctx.getRecords().length, 2);
  assert.equal(ctx.getRecords().find(x => x.id === 'first').name, original.name);
  assert.equal(ctx.getRecords().find(x => x.id === 'second').category, 'male');
  assert.equal(ctx.app.characters.length, 3);
  assert.ok(ctx.getRenders() > 0);
  assert.ok(ctx.data.has(legacyKey), 'never destroy the old backup');
});

test('studio edit journal replays male-to-R18 changes after an interrupted save', async () => {
  const data = new Map();
  const old = card('one', 'male');
  const studio = fixture({ studio: true, stored: [old], storage: data });
  await settle();
  studio.engine.saveCustom(card('one', 'r18'));
  assert.equal(JSON.parse(data.get(pendingKey))[0].category, 'r18');
  assert.equal(studio.getRecords()[0].category, 'male', 'simulate an interrupted IDB write');
  const home = fixture({ stored: studio.getRecords(), storage: data });
  await settle();
  assert.equal(home.getRecords()[0].category, 'r18');
  assert.equal(home.data.has(pendingKey), false, 'journal clears only after persisted replay');
});

test('a failed IndexedDB write leaves the recovery journal intact', async () => {
  const pending = [card('second', 'r18')];
  const ctx = fixture({ stored: [card('first')], pending, fail: true });
  await settle();
  assert.equal(ctx.getRecords().length, 1);
  assert.equal(JSON.parse(ctx.data.get(pendingKey))[0].id, 'second');
});

test('editor and homepage load the repair module in their actual script paths', () => {
  const studio = fs.readFileSync(path.join(__dirname, '../character-studio.html'), 'utf8');
  const bridge = fs.readFileSync(path.join(__dirname, '../js/global-bridge.js'), 'utf8');
  assert.ok(studio.indexOf('src="js/character-library.js"') < studio.indexOf('src="js/character-library-repair.js"'));
  assert.ok(studio.indexOf('src="js/character-library-repair.js"') < studio.indexOf('src="js/character-studio.js"'));
  assert.ok(bridge.includes("repairScript.src = 'js/character-library-repair.js'"));
});
