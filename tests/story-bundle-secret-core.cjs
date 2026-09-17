const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

global.window = global;
const clone = value => structuredClone(value);
const scrubSecrets = value => {
  const walk = input => {
    if (Array.isArray(input)) return input.map(walk);
    if (!input || typeof input !== 'object') return input;
    return Object.fromEntries(Object.entries(input).filter(([key]) => !['key', 'apiKey'].includes(key)).map(([key, item]) => [key, walk(item)]));
  };
  return walk(clone(value));
};
global.Storage = {
  clone, scrubSecrets,
  sanitizeImportedStory(value) {
    const safe = scrubSecrets(value);
    safe.config.api = { ...(safe.config.api || {}), key: '' };
    safe.state = safe.state || {};
    safe.state.config = safe.config;
    return safe;
  }
};
global.BAOStoryLibrary = { refs: () => ({}) };
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'story-backup.js'), 'utf8'), { filename: 'js/story-backup.js' });
const marker = 'DO-NOT-EXPORT-THIS-API-KEY';
const payload = {
  characterId: 'test', config: { api: { key: marker, model: 'test' } },
  chat: { messages: [{ id: 'm1', role: 'user', content: 'hello' }] },
  state: { nested: { apiKey: marker } },
  memory: { metadata: [{ apiKey: marker }] }
};
const bundle = {
  schema: 'bao-lab-story-bundle', version: 1, story: { title: 'Safe', apiKey: marker },
  activeChapterId: 'root', chapters: [{ chapterId: 'root', parentChapterId: '', payload,
    checkpoints: [{ messageId: 'm1', seq: 0, payload: { config: { api: { key: marker } },
      state: { apiKey: marker }, chat: { messages: [{ id: 'm1', content: marker }] } } }] }]
};
const safe = BAOStoryBackup.sanitizeBundle(bundle);
assert.equal(JSON.stringify(safe).includes(marker), false, 'bundle must not contain any nested API credential');
assert.equal(safe.chapters[0].payload.config.api.key, '');
assert.equal(safe.chapters[0].checkpoints[0].payload.config.api.key, '');
assert.equal('messages' in safe.chapters[0].checkpoints[0].payload.chat, false, 'checkpoint must not duplicate chat messages');
assert.equal(bundle.chapters[0].payload.config.api.key, marker, 'sanitization must not mutate the original story');
console.log('story bundle nested API credential sanitization test passed');
