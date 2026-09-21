const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
global.document = { querySelector: () => null };
global.setInterval = fn => { fn(); return 1; };
global.clearInterval = () => {};
const clone = value => structuredClone(value);
const scrubSecrets = value => {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(key|apiKey|accessToken)$/i.test(key)).map(([key, item]) => [key, scrubSecrets(item)]));
};
global.Storage = {
  clone, scrubSecrets,
  localJSON(key, fallback) { return key.includes('player-settings') ? { apiKey: 'hidden', note: 'sk-testDeviceSecret123456' } : fallback; },
  applyPreferences() {}
};
global.CharacterEngine = {
  readyCustomLibrary: async () => {},
  exportCustomLibrary: async () => [{ id: 'local-card', character: { id: 'local-card', name: '本機角色', accessToken: 'hidden' }, cover: null }],
  importCustomLibrary: async () => []
};
global.BAOStoryLibrary = { flush: async () => {}, listStories: async () => [{ storyId: 'story-1' }] };
global.BAOStoryBackup = {
  buildBundle: async () => ({ schema: 'bao-lab-story-bundle', story: { storyId: 'story-1' }, chapters: [], apiKey: 'hidden' }),
  importBundle: async () => ({})
};

vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'device-transfer.js'), 'utf8'), { filename: 'js/device-transfer.js' });

(async () => {
  const pack = await BAODeviceTransfer.build();
  const serialized = JSON.stringify(pack);
  assert.equal(pack.schema, 'bao-lab-device-transfer');
  assert.equal(pack.characters.length, 1);
  assert.equal(pack.stories.length, 1);
  assert.equal(serialized.includes('sk-testDeviceSecret123456'), false, 'key-like strings must be redacted');
  assert.equal(serialized.includes('hidden'), false, 'credential fields must be removed');
  assert.throws(() => BAODeviceTransfer.validate({ schema: 'wrong' }), /不是有效/);
  console.log('device transfer privacy core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
