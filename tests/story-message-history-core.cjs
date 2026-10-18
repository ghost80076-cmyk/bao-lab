const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'js', file), 'utf8');
const revisionSource = fs.readFileSync(process.env.REVISION_SOURCE || path.join(root, 'js/story-revision-state.js'), 'utf8');
const raw = new Map(), db = new Database();
const c = { structuredClone, console: { warn() {} }, localStorage: {
  getItem: key => raw.get(key) ?? null, setItem: (key, value) => raw.set(key, String(value)), removeItem: key => raw.delete(key)
} };
c.window = c; vm.createContext(c);
vm.runInContext(read('storage.js').replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.Storage = Storage;', c);
vm.runInContext(read('story-library.js'), c);
const lib = c.BAOStoryLibrary; lib._db = db; lib.open = async () => db;
c.App = { config: {}, saveStory: () => true };
c.Chat = { messages: [], add() {} }; c.API = { send: async () => ({}) };
vm.runInContext(revisionSource, c);
const refs = { storyId: 'history', chapterId: 'root', storyCreatedAt: '2026-01-01', chapterCreatedAt: '2026-01-01', chapterLabel: 'Root' };
const firstTime = '2026-01-01T01:00:00Z', secondTime = '2026-01-02T02:00:00Z';
const make = (savedAt, ids = ['first', 'second']) => ({ characterId: 'hero', characterName: 'Hero', savedAt, config: {}, state: {}, _library: refs,
  chat: { messages: ids.map(id => ({ id, role: 'assistant', content: id, revisionBase: { state: { location: 'before-' + id } },
    variants: [{ content: id + '-variant' }], activeVariant: 0 })) } });
async function main() {
  const initial = make(firstTime); await lib.persist(initial);
  assert.equal(initial.chat.messages[0].createdAt, undefined, 'storage enrichment must not mutate the live message');
  await lib.persist(make(secondTime, ['second', 'first', 'third']));
  let records = (await lib.allRecords()).filter(record => record.kind === 'message');
  assert.deepEqual(Array.from(records, record => record.createdAt), [firstTime, firstTime, secondTime], 'repeat save and reordering retain timestamps by message identity');
  assert.deepEqual(Array.from(records, record => record.messagePayload.createdAt), [firstTime, firstTime, secondTime], 'rich message payloads carry the same durable creation time');
  // Older records already have a timestamp, but their rich payload omitted it.
  await lib.transaction('readwrite', store => records.forEach(record => {
    delete record.messagePayload.createdAt; store.put(record);
  }));
  const restored = await lib.reconstruct('history', 'root');
  assert.deepEqual(Array.from(restored.chat.messages, message => message.createdAt), [firstTime, firstTime, secondTime]);
  assert.equal(restored.chat.messages[0].revisionBase.state.location, 'before-second');
  assert.equal(restored.chat.messages[0].variants[0].content, 'second-variant');
  // Plain legacy records also recover their original time.
  const plain = (await lib.allRecords()).find(record => record.kind === 'message' && record.messageId === 'third');
  delete plain.messagePayload;
  await lib.transaction('readwrite', store => store.put(plain));
  assert.equal((await lib.reconstruct('history', 'root')).chat.messages[2].createdAt, secondTime);
  const active = make(secondTime, ['second', 'first', 'third']);
  lib.adoptRefs(active);
  c.Storage.saveStory = () => { lib.queuePersist(active); return true; };
  const branch = await lib.createBranch('third', 'History branch');
  assert.deepEqual(Array.from(branch.chat.messages, message => message.createdAt), [firstTime, firstTime, secondTime], 'branch enrichment cannot replace source history with branch creation time');
  assert.equal(branch.chat.messages[0].variants[0].content, 'second-variant');
  const reopened = await lib.reconstruct(refs.storyId, branch._library.chapterId);
  assert.deepEqual(Array.from(reopened.chat.messages, message => message.createdAt), [firstTime, firstTime, secondTime]);
  // A different ID at a reused sequence position is a new message, not old history.
  const replaced = make(firstTime, ['old-id']); replaced._library = { ...refs, chapterId: 'replacement' };
  await lib.persist(replaced);
  const replacement = make(secondTime, ['new-id']); replacement._library = replaced._library;
  await lib.persist(replacement);
  assert.equal((await lib.reconstruct('history', 'replacement')).chat.messages[0].createdAt, secondTime);
  // Legacy messages without IDs still match their prior sequence position.
  const noId = make(firstTime, ['legacy']); noId._library = { ...refs, chapterId: 'legacy' };
  delete noId.chat.messages[0].id;
  await lib.persist(noId); noId.savedAt = secondTime; await lib.persist(noId);
  assert.equal((await lib.reconstruct('history', 'legacy')).chat.messages[0].createdAt, firstTime);
  // An explicit timestamp on a newly supplied message is still respected.
  const explicit = make(secondTime, ['new-explicit']); explicit._library = { ...refs, chapterId: 'explicit' };
  explicit.chat.messages[0].createdAt = '2025-12-01T00:00:00Z';
  await lib.persist(explicit);
  assert.equal((await lib.reconstruct('history', 'explicit')).chat.messages[0].createdAt, '2025-12-01T00:00:00Z');
  vm.runInContext(read('story-backup.js'), c);
  c.Storage.saveStory = () => true;
  const bundle = await c.BAOStoryBackup.buildBundle('history');
  assert.deepEqual(Array.from(bundle.chapters.find(chapter => chapter.chapterId === branch._library.chapterId).payload.chat.messages, message => message.createdAt), [firstTime, firstTime, secondTime]);
  console.log('Message history: repeated saves, reordered IDs, rich/plain legacy records, branch enrichment and export preserve creation times');
}
const watchdog = setTimeout(() => { console.error('Message history test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
