const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'js', file), 'utf8');
function tab(db) {
  const raw = new Map(), c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => raw.get(key) ?? null, setItem: (key, value) => raw.set(key, String(value)), removeItem: key => raw.delete(key)
  } };
  c.window = c; vm.createContext(c);
  vm.runInContext(read('storage.js').replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.Storage = Storage;', c);
  vm.runInContext(fs.readFileSync(process.env.LIBRARY_SOURCE || path.join(root, 'js/story-library.js'), 'utf8'), c);
  const lib = c.BAOStoryLibrary; lib._db = db; lib.open = async () => db; c.Storage.saveStory = () => true;
  return { c, lib };
}
const refs = { storyId: 'native', chapterId: 'root', chapterLabel: 'Root', storyCreatedAt: '2026-01-01', chapterCreatedAt: '2026-01-01' };
const payload = label => ({ characterId: 'hero', characterName: 'Hero', savedAt: label === 'first' ? '2026-01-01T01:00:00Z' : '2026-01-02T02:00:00Z',
  config: {}, state: { location: label }, _library: refs, chat: { messages: [{ id: 'reply', role: 'assistant', content: label,
    context_content: 'model-facing-' + label, variants: [{ content: label, metadata: { apiKey: 'SECRET-MARKER' } }], activeVariant: 0,
    revisionBase: { state: { location: 'before-' + label, nested: { apiKey: 'SECRET-MARKER' } } }, apiKey: 'SECRET-MARKER' }] } });
async function main() {
  const db = new Database(), a = tab(db);
  const input = payload('first');
  await a.lib.persist(input);
  let restored = await a.lib.reconstruct('native', 'root');
  assert.equal(restored.chat.messages[0].variants?.[0].content, 'first', 'native storage must preserve rich history before revision UI loads');
  assert.equal(restored.chat.messages[0].context_content, 'model-facing-first');
  assert.equal(restored.chat.messages[0].revisionBase.state.location, 'before-first');
  assert.equal(restored.chat.messages[0].createdAt, input.savedAt);
  assert.equal(input.chat.messages[0].createdAt, undefined, 'timestamp enrichment must not mutate live messages');
  assert.equal(input.chat.messages[0].apiKey, 'SECRET-MARKER', 'scrubbing must not mutate live messages');
  assert.equal(JSON.stringify(await a.lib.allRecords()).includes('SECRET-MARKER'), false);
  const writer = a.lib.messageRecords, decoder = a.lib.messageFromRecord;
  a.c.App = { config: {}, saveStory: () => true }; a.c.Chat = { messages: [], add() {} }; a.c.API = { send: async () => ({}) };
  vm.runInContext(read('story-revision-state.js'), a.c);
  assert.equal(a.lib.messageRecords, writer, 'loading revision UI must not replace the storage writer');
  assert.equal(a.lib.messageFromRecord, decoder);
  await a.lib.persist(payload('second'));
  restored = await a.lib.reconstruct('native', 'root');
  assert.equal(restored.chat.messages[0].variants[0].content, 'second');
  assert.equal(restored.chat.messages[0].createdAt, input.savedAt);
  a.lib.adoptRefs({ _library: refs });
  const branch = await a.lib.createBranch('reply', 'Native branch');
  assert.equal(branch.chat.messages[0].revisionBase.state.location, 'before-second');
  const fresh = tab(db);
  const reopened = await fresh.lib.reconstruct('native', branch._library.chapterId);
  assert.equal(reopened.chat.messages[0].variants[0].content, 'second');
  assert.equal(reopened.chat.messages[0].context_content, 'model-facing-second');
  assert.equal(reopened.chat.messages[0].createdAt, input.savedAt);
  assert.equal(JSON.stringify(reopened).includes('SECRET-MARKER'), false);
  // New messages with no ID keep the existing legacy timestamp compatibility.
  const legacy = payload('first'); legacy._library = { ...refs, chapterId: 'legacy' }; delete legacy.chat.messages[0].id;
  await fresh.lib.persist(legacy); legacy.savedAt = '2026-01-03T00:00:00Z'; await fresh.lib.persist(legacy);
  assert.equal((await fresh.lib.reconstruct('native', 'legacy')).chat.messages[0].createdAt, input.savedAt);
  console.log('Native message storage: full history before/after UI load, unchanged writer, timestamp compatibility, nonmutation and privacy passed');
}
const watchdog = setTimeout(() => { console.error('Native message storage test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
