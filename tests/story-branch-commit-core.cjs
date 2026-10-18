const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, 'js', file), 'utf8');
function tab(db, revision = true) {
  const raw = new Map(), c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => raw.get(key) ?? null, setItem: (key, value) => raw.set(key, String(value)), removeItem: key => raw.delete(key)
  } };
  c.window = c; vm.createContext(c);
  vm.runInContext(read('storage.js').replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.Storage = Storage;', c);
  vm.runInContext(fs.readFileSync(process.env.LIBRARY_SOURCE || path.join(root, 'js/story-library.js'), 'utf8'), c);
  const lib = c.BAOStoryLibrary; lib._db = db; lib.open = async () => db;
  c.Storage.saveStory = () => true;
  if (revision) {
    c.App = { config: {}, saveStory: () => true }; c.Chat = { messages: [], add() {} }; c.API = { send: async () => ({}) };
    vm.runInContext(fs.readFileSync(process.env.REVISION_SOURCE || path.join(root, 'js/story-revision-state.js'), 'utf8'), c);
  }
  return { c, lib };
}
const refs = { storyId: 'story', chapterId: 'root', chapterLabel: 'Root', storyCreatedAt: '2026-01-01', chapterCreatedAt: '2026-01-01' };
const payload = revision => ({ characterId: 'hero', characterName: 'Hero', savedAt: '2026-01-01T01:00:00Z', config: { api: { key: 'SECRET' } },
  chat: { summary: revision, messages: [{ id: 'reply', role: 'assistant', content: revision, createdAt: '2026-01-01T00:00:00Z',
    variants: [{ content: revision + '-variant' }], revisionBase: { state: { location: revision + '-base' } } }] }, state: { location: revision }, _library: refs });
async function main() {
  const db = new Database(), a = tab(db), b = tab(db);
  await a.lib.persist(payload('old')); a.lib.adoptRefs(payload('old'));
  const persist = a.lib.persist.bind(a.lib), readRecords = a.lib.allRecords.bind(a.lib);
  let writes = 0, reads = 0, firstPayload;
  a.lib.allRecords = async () => { reads++; return readRecords(); };
  a.lib.persist = async value => {
    if (!value._library?.parentChapterId) return persist(value);
    writes++; firstPayload ||= structuredClone(value);
    const ok = await persist(value);
    if (writes === 1) await b.lib.persist(payload('new'));
    return ok;
  };
  const branch = await a.lib.createBranch('reply', 'Snapshot branch');
  assert.equal(branch.chat.messages[0].content, 'old', 'source changes after the branch commit cannot replace branch history');
  assert.equal(branch.state.location, 'old');
  assert.equal(branch.chat.messages[0].variants[0].content, 'old-variant');
  assert.equal(branch.chat.messages[0].revisionBase.state.location, 'old-base');
  assert.equal(firstPayload.chat.messages[0].variants[0].content, 'old-variant', 'the initial commit must already contain full history');
  assert.equal(writes, 1, 'branch creation has one durable commit');
  assert.equal(reads, 1, 'branch construction uses one source snapshot');
  assert.equal((await b.lib.reconstruct('story', 'root')).state.location, 'new');
  // The library decodes stored history even before the revision UI module loads.
  const plainPage = tab(db, false);
  const restored = await plainPage.lib.reconstruct('story', branch._library.chapterId);
  assert.equal(restored.chat.messages[0].variants[0].content, 'old-variant');
  assert.equal(restored.chat.messages[0].createdAt, '2026-01-01T00:00:00Z');
  assert.equal(JSON.stringify(restored).includes('SECRET'), false);
  for (const failure of ['false', 'throw']) {
    const failureDB = new Database(), f = tab(failureDB);
    await f.lib.persist(payload('old')); f.lib.adoptRefs(payload('old'));
    const original = f.lib.persist.bind(f.lib);
    f.lib.persist = value => value._library?.parentChapterId
      ? failure === 'false' ? Promise.resolve(false) : Promise.reject(Error('branch commit failed')) : original(value);
    await assert.rejects(f.lib.createBranch('reply', 'Failed branch'), /寫入|branch commit failed/);
    assert.equal(f.lib.refs().chapterId, 'root');
    assert.equal((await f.lib.listChapters('story')).length, 1);
    assert.equal((await f.lib.reconstruct('story', 'root')).chat.messages[0].variants[0].content, 'old-variant');
  }
  console.log('Branch commit: one rich-history write, source snapshot consistency, decoder independence and failure rollback passed');
}
const watchdog = setTimeout(() => { console.error('Branch commit test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
