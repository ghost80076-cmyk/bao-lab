const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const root = path.join(__dirname, '..');
const storageSource = fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8');
const librarySource = fs.readFileSync(process.env.STORY_LIBRARY_SOURCE || path.join(root, 'js/story-library.js'), 'utf8');
const backupSource = fs.readFileSync(path.join(root, 'js/story-backup.js'), 'utf8');
const data = new Map();
const c = { structuredClone, setTimeout, console: { warn() {} }, localStorage: {
  getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key)
} };
c.window = c; vm.createContext(c);
vm.runInContext(storageSource + '\nwindow.Storage = Storage;', c);
vm.runInContext(librarySource, c);
const library = c.BAOStoryLibrary, db = new Database();
library._db = db; library.open = async () => db;
const save = label => ({ characterId: 'hero', characterName: 'Hero', savedAt: new Date().toISOString(), config: {},
  chat: { messages: [{ id: label + '-u', role: 'user', content: label }, { id: label + '-a', role: 'assistant', content: label }], summary: '' }, state: {} });
async function main() {
  if (!process.argv.includes('--queue-only')) {
    db.records.set('keep', { id: 'keep', kind: 'story', storyId: 'original' });
    const error = Error('injected action failure');
    await assert.rejects(library.transaction('readwrite', store => {
      store.delete('keep'); store.put({ id: 'partial', kind: 'story', storyId: 'partial' }); throw error;
    }), value => value === error);
    await library.allRecords();
    assert.ok(db.records.has('keep'), 'action errors must preserve the original record');
    assert.equal(db.records.has('partial'), false, 'action errors must roll back queued partial writes');
  }
  const a = library.beginStory('A');
  let release; const paused = new Promise(resolve => { release = resolve; });
  library._writeQueue = paused;
  const queued = library.queuePersist(save('A-progress'));
  const b = library.beginStory('B');
  release(); await queued;
  const stored = await library.reconstruct(a.storyId, a.chapterId);
  assert.equal(stored?.chat.messages[0].content, 'A-progress', 'queued writes must retain their original story and chapter');
  assert.equal(await library.reconstruct(b.storyId, b.chapterId), null, 'switching stories cannot redirect an older queued write');
  assert.equal(library.refs().storyId, b.storyId, 'persisting an older story must not change active refs');
  const tagged = { ...save('A-tagged'), _library: a };
  await library.persist(tagged);
  assert.equal((await library.reconstruct(a.storyId, a.chapterId)).chat.messages[0].content, 'A-tagged');
  assert.equal(library.refs().storyId, b.storyId);
  const persist = library.persist.bind(library);
  let failA = true;
  library.persist = async payload => {
    if (payload._library.storyId === a.storyId && failA) throw Error('injected disk failure');
    return persist(payload);
  };
  library.queuePersist(tagged);
  await library.flush();
  assert.equal(await library.flush(a.storyId), false, 'scoped flush reports an uncommitted chapter');
  library.queuePersist({ ...save('B-good'), _library: b });
  assert.equal(await library.flush(b.storyId), true);
  assert.equal(await library.flush(a.storyId), false, 'another story\'s success cannot hide this failure');
  const sibling = { ...a, chapterId: 'sibling', chapterLabel: 'Sibling' };
  failA = false;
  library.queuePersist({ ...save('sibling'), _library: sibling });
  await library.flush();
  assert.equal(await library.flush(a.storyId), false, 'a sibling chapter success cannot clear the failed chapter');
  failA = true;
  c.Storage.saveStory = () => { library.queuePersist(tagged); return true; };
  library.adoptRefs(tagged);
  vm.runInContext(backupSource, c);
  let reads = 0;
  const allRecords = library.allRecords.bind(library);
  library.allRecords = async () => { reads++; return allRecords(); };
  await assert.rejects(c.BAOStoryBackup.buildBundle(a.storyId), /未.*(寫入|儲存)|備份.*失敗/);
  assert.equal(reads, 0, 'export must stop before reconstructing a stale backup');
  failA = false;
  const bundle = await c.BAOStoryBackup.buildBundle(a.storyId);
  assert.equal(bundle.chapters.find(chapter => chapter.chapterId === a.chapterId).payload.chat.messages[0].content, 'A-tagged');
  assert.equal(await library.flush(a.storyId), true, 'retrying the failed chapter restores export readiness');
  library.persist = async () => false;
  library.queuePersist({ ...save('B-failed'), _library: b });
  assert.equal(await library.flush(b.storyId), false, 'false persistence results also block durability');
  library.persist = persist;
  assert.equal(await library.deleteStory(b.storyId), true);
  assert.equal(await library.flush(b.storyId), true, 'intentional story deletion releases obsolete failure state');
  // A failed branch write must keep the original active chapter.
  library.persist = async payload => payload._library.parentChapterId ? false : persist(payload);
  await assert.rejects(library.createBranch('A-tagged-a', 'failed branch'), /新分支.*寫入/);
  assert.equal(library.refs().storyId, a.storyId);
  assert.equal(library.refs().chapterId, a.chapterId);
  library.persist = async payload => payload._library.parentChapterId ? Promise.reject(Error('branch write failed')) : persist(payload);
  await assert.rejects(library.createBranch('A-tagged-a', 'throwing branch'), /branch write failed/);
  assert.equal(library.refs().chapterId, a.chapterId);
  c.Storage.saveStory = () => false;
  c.GameState = { current: {} };
  await assert.rejects(c.BAOStoryBackup.buildBundle(a.storyId), /目前|儲存/);
  c.GameState.current = null;
  assert.equal((await c.BAOStoryBackup.buildBundle(a.storyId)).story.storyId, a.storyId, 'saved stories remain exportable after leaving live play');
  console.log('Story library durability: atomic abort, pinned refs, scoped failures, failed export and successful retry passed');
}
const watchdog = setTimeout(() => { console.error('Story library durability test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
