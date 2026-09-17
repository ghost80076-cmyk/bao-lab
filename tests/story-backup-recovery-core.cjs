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
    if (!value?.characterId || !value?.config || !Array.isArray(value?.chat?.messages)) throw Error('invalid story');
    const safe = scrubSecrets(value);
    safe.config.api = { ...(safe.config.api || {}), key: '' };
    safe.state = safe.state || {};
    safe.state.config = safe.config;
    return safe;
  },
  importFile: async file => JSON.parse(await file.text())
};
const previousRefs = { storyId: 'existing', chapterId: 'existing-root' };
let refs = clone(previousRefs);
let records = [];
let persistCalls = 0;
let failCleanup = false;
global.BAOStoryLibrary = {
  refs: () => clone(refs),
  open: async () => true,
  id: prefix => prefix + '-' + (++nextId),
  adoptRefs: payload => { refs = clone(payload._library); },
  clearRefs: () => { refs = {}; },
  persist: async payload => {
    persistCalls++;
    records.push({ storyId: payload._library.storyId, chapterId: payload._library.chapterId });
    if (persistCalls === 2) throw Error('simulated disk failure');
    return true;
  },
  deleteStory: async storyId => {
    if (failCleanup) throw Error('simulated cleanup failure');
    records = records.filter(record => record.storyId !== storyId);
  },
  allRecords: async () => [],
  reconstruct: async () => null,
  transaction: async () => true
};
let nextId = 0;
vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'story-backup.js'), 'utf8'), { filename: 'js/story-backup.js' });
const chapter = (id, parent = '') => ({
  chapterId: id, parentChapterId: parent, label: id,
  payload: { characterId: 'hero', config: { api: { key: 'SECRET' } }, chat: { messages: [{ id: id + '-1', role: 'user', content: id }] }, state: {} }
});
const bundle = chapters => ({ schema: 'bao-lab-story-bundle', version: 1, story: { title: 'Test' }, activeChapterId: 'root', chapters });
(async () => {
  const invalidParent = bundle([chapter('root'), chapter('branch', 'missing')]);
  await assert.rejects(BAOStoryBackup.importBundle(invalidParent), /父章節不存在/);
  assert.equal(persistCalls, 0, 'malformed bundle must be rejected before writing');
  assert.deepEqual(refs, previousRefs);
  const cycle = bundle([chapter('root', 'branch'), chapter('branch', 'root')]);
  await assert.rejects(BAOStoryBackup.importBundle(cycle), /循環/);
  assert.equal(persistCalls, 0);
  const valid = bundle([chapter('root'), chapter('branch', 'root')]);
  await assert.rejects(BAOStoryBackup.importBundle(valid), /simulated disk failure/);
  assert.equal(records.length, 0, 'failed import must remove partial story records');
  assert.deepEqual(refs, previousRefs, 'failed import must restore active story');
  persistCalls = 0;
  failCleanup = true;
  await assert.rejects(BAOStoryBackup.importBundle(valid), /無法清除部分匯入/);
  assert.deepEqual(refs, previousRefs, 'cleanup failure must still restore active story');
  console.log('story backup recovery core test passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
