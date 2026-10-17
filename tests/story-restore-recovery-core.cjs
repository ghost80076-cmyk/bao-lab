const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.STORAGE_SOURCE || path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const KEYS = ['bao-lab:player-settings', 'bao-lab:narrative-settings-v1', 'bao-lab:player-memory-slots'];
const save = () => ({ characterId: 'new', character: { id: 'new', name: 'New' }, savedAt: '2026-10-18T00:00:00Z',
  config: { api: { key: 'MUST-NOT-RESTORE' } }, chat: { messages: [{ id: 'new-message', role: 'user', content: 'new story' }], summary: 'new summary' },
  state: { location: 'new location', memorySlots: [{ id: 'new-note', text: 'new note' }] },
  preferences: { player: { theme: 'new' }, narrative: { style: 'new' }, memorySlots: [{ id: 'new-note', text: 'new note' }] } });
function fixture(failure) {
  const raw = new Map([[KEYS[0], '{ "theme": "old" }'], [KEYS[1], '{ "style": "old" }']]);
  const runtime = { player: { theme: 'old' }, narrative: { style: 'old' }, memorySlots: [{ id: 'old-note', text: 'old note' }] };
  let tripped = false, scheduledStory;
  const trip = stage => { if (failure === 'rollback-storage' && stage === 'world') { tripped = true; throw Error('world failed'); } if (stage === failure && (!tripped || failure === 'rollback')) { tripped = true; throw Error(stage + ' failed'); } };
  const oldCharacter = { id: 'old', name: 'Old' }, oldCharacters = [oldCharacter];
  const oldConfig = { api: { key: 'KEEP-IN-MEMORY' }, keep: true };
  const oldMessages = [{ id: 'old-message', role: 'user', content: 'old story' }];
  const oldState = { location: 'old location', memorySlots: runtime.memorySlots };
  const c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => { trip('read'); return raw.get(key) ?? null; },
    setItem: (key, value) => {
      if (key === KEYS[1]) trip('quota');
      if (failure === 'rollback-storage' && tripped && key === KEYS[0]) throw Error('rollback write blocked');
      raw.set(key, String(value));
    },
    removeItem: key => raw.delete(key)
  }, App: { characters: oldCharacters, activeCharacter: oldCharacter, config: oldConfig },
    Chat: { messages: oldMessages, summary: 'old summary', ensureMessageIds: messages => { trip('messages'); return structuredClone(messages); } },
    GameState: { current: oldState }, CharacterEngine: { normalize: value => { trip('normalize'); return structuredClone(value); } } };
  c.window = c;
  c.BAOPlayerSettings = { get: () => structuredClone(runtime.player), set: value => {
    runtime.player = structuredClone(value); trip('player'); if (failure === 'rollback') trip('rollback');
  } };
  c.BAONarrativeSettings = { get: () => structuredClone(runtime.narrative), set: value => { runtime.narrative = structuredClone(value); trip('narrative'); } };
  c.BAOMemoryWorkbench = { readSlots: () => structuredClone(runtime.memorySlots), writeSlots: value => {
    runtime.memorySlots = structuredClone(value); c.GameState.current.memorySlots = structuredClone(value); scheduledStory = c.GameState.current; trip('memory');
  } };
  c.BAOCharacterStatus = { ensureState: character => { character.injected = true; c.GameState.current.statusInjected = true; trip('status'); } };
  c.BAOWorldModules = { ensureState: () => { c.GameState.current.modulesInjected = true; trip('world'); } };
  vm.createContext(c);
  vm.runInContext(source.replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.store = Storage;', c);
  return { c, raw, runtime, oldCharacter, oldCharacters, oldConfig, oldMessages, oldState, scheduled: () => scheduledStory };
}
function assertPreserved(f) {
  assert.equal(f.c.App.characters, f.oldCharacters);
  assert.equal(f.c.App.activeCharacter, f.oldCharacter);
  assert.equal(f.c.App.config, f.oldConfig);
  assert.equal(f.c.Chat.messages, f.oldMessages);
  assert.equal(f.c.Chat.summary, 'old summary');
  assert.equal(Object.hasOwn(f.c.Chat, 'usage'), false, 'rollback preserves fields that were originally absent');
  assert.equal(f.c.GameState.current, f.oldState);
  assert.equal(f.oldCharacter.injected, undefined);
  assert.equal(f.oldState.statusInjected, undefined);
  assert.deepEqual([...f.raw], [[KEYS[0], '{ "theme": "old" }'], [KEYS[1], '{ "style": "old" }']]);
  assert.deepEqual(f.runtime.player, { theme: 'old' });
  assert.deepEqual(f.runtime.narrative, { style: 'old' });
  assert.deepEqual(f.runtime.memorySlots, [{ id: 'old-note', text: 'old note' }]);
  if (f.scheduled()) assert.notEqual(f.scheduled(), f.c.GameState.current, 'a candidate-story delayed save must not target the restored original');
}
for (const failure of ['quota', 'normalize', 'messages', 'read', 'player', 'narrative', 'memory', 'status', 'world', 'rollback']) {
  const f = fixture(failure);
  let result;
  assert.doesNotThrow(() => { result = f.c.store.restoreStory(save()); }, failure);
  assert.equal(result, false, failure);
  assertPreserved(f);
  assert.ok(f.c.store.status().lastRestoreError);
  if (failure === 'rollback') assert.match(f.c.store.status().lastRestoreError, /無法完整復原/);
  if (failure === 'world') {
    assert.equal(f.c.store.restoreStory(save()), true, 'a successful retry clears the previous failure');
    assert.equal(f.c.store.status().lastRestoreError, '');
  }
}
const blocked = fixture('rollback-storage');
assert.equal(blocked.c.store.restoreStory(save()), false);
assert.equal(blocked.c.App.config, blocked.oldConfig);
assert.equal(blocked.c.GameState.current, blocked.oldState);
assert.equal(blocked.raw.get(KEYS[1]), '{ "style": "old" }', 'one rollback failure must not stop other preference recovery');
assert.equal(blocked.raw.has(KEYS[2]), false);
assert.match(blocked.c.store.status().lastRestoreError, /無法完整復原/);
const existing = fixture('world');
const existingSave = save(); existingSave.characterId = 'old'; existingSave.character.id = 'old';
assert.equal(existing.c.store.restoreStory(existingSave), false);
assertPreserved(existing);
const good = fixture('none');
assert.equal(good.c.store.restoreStory(save()), true);
assert.equal(good.c.App.activeCharacter.id, 'new');
assert.equal(good.c.Chat.messages[0].content, 'new story');
assert.equal(good.c.App.config.api.key, '');
assert.equal(good.c.GameState.current.config, good.c.App.config);
assert.equal(good.c.GameState.current.modulesInjected, true);
assert.equal(good.c.App.characters.length, 2);
assert.equal(good.oldCharacters.length, 1, 'successful restore stages a new catalog without mutating old holders');
console.log('Story restore recovery: staging, quota, runtime hooks, modules, rollback errors and success passed');
