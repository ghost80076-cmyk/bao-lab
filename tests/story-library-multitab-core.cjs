const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const source = fs.readFileSync(process.env.STORY_LIBRARY_SOURCE || path.join(__dirname, '..', 'js/story-library.js'), 'utf8');
function tab(db) {
  const raw = new Map();
  const c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => raw.get(key) ?? null, setItem: (key, value) => raw.set(key, String(value)), removeItem: key => raw.delete(key)
  }, Storage: { validateStory: value => Boolean(value?.characterId && Array.isArray(value.chat?.messages)), scrubSecrets: structuredClone, sanitizeImportedStory: structuredClone } };
  c.window = c; vm.createContext(c); vm.runInContext(source, c);
  const library = c.BAOStoryLibrary;
  library._db = db; library.open = async () => db;
  return library;
}
const refs = { storyId: 'story', chapterId: 'root', storyCreatedAt: '2026-01-01', chapterCreatedAt: '2026-01-01', chapterLabel: 'Original chapter' };
const save = (ids, library = refs) => ({ characterId: 'hero', characterName: 'Hero', savedAt: '2026-10-18T01:00:00Z', config: {}, state: {},
  chat: { messages: ids.map(id => ({ id, role: 'assistant', content: id })) }, _library: structuredClone(library) });
async function main() {
  const db = new Database(), a = tab(db), b = tab(db);
  await a.persist(save(['first']));
  await Promise.all([a.renameStory('story', 'Renamed story'), b.setStoryPinned('story', true)]);
  let record = db.records.get('story:story');
  assert.equal(record.title, 'Renamed story', 'concurrent pinning must retain the renamed title');
  assert.equal(record.pinned, true);
  await Promise.all([a.markStoryOpened('story', '2027-01-01T00:00:00Z'), b.persist(save(['first', 'second']))]);
  record = db.records.get('story:story');
  assert.equal(record.lastOpenedAt, '2027-01-01T00:00:00Z', 'saving from another tab retains the latest opened time');
  // A local cache of an earlier open must not win over newer durable metadata.
  await b.markStoryOpened('story', '2028-01-01T00:00:00Z');
  await a.persist(save(['first', 'second']));
  assert.equal(db.records.get('story:story').lastOpenedAt, '2028-01-01T00:00:00Z');
  await Promise.all([a.renameChapter('story', 'root', 'Renamed chapter'), b.persist(save(['first', 'second']))]);
  assert.equal(db.records.get('chapter:story:root').label, 'Renamed chapter', 'stale payload labels cannot undo library renames');
  await Promise.all([a.persist(save(['first', 'middle', 'tail'])), b.persist(save(['replacement']))]);
  const reconstructed = await a.reconstruct('story', 'root');
  assert.deepEqual(Array.from(reconstructed.chat.messages, value => value.id), ['replacement'], 'replacing a chapter removes every message from the preceding committed version');
  assert.equal(db.records.get('chapter:story:root').messageCount, 1);
  assert.equal([...db.records.values()].filter(value => value.kind === 'checkpoint' && value.chapterId === 'root').length, 1);
  assert.equal(db.records.get('story:story').title, 'Renamed story');
  assert.equal(db.records.get('story:story').pinned, true);
  // Once a deleted parent's child is promoted, a stale payload must not reattach it.
  const branchRefs = { ...refs, chapterId: 'branch', parentChapterId: 'root', branchPointMessageId: 'replacement', branchPointSeq: 0, branchPointPreview: 'replacement' };
  await a.persist(save(['branch-message'], branchRefs));
  a.adoptRefs({ _library: branchRefs });
  await a.deleteChapter('story', 'root');
  await b.persist(save(['branch-message'], branchRefs));
  const branch = db.records.get('chapter:story:branch');
  assert.equal(branch.parentChapterId, '', 'a save from stale branch refs must preserve promotion');
  assert.equal(branch.branchPointMessageId, '');
  assert.equal(branch.branchPointSeq, -1);
  assert.equal(branch.branchPointPreview, '');
  const callbackError = Error('injected callback failure');
  const callbackBefore = structuredClone([...db.records]);
  await assert.rejects(a.mutateRecords((records, store) => {
    store.delete('story:story');
    store.put({ id: 'partial', kind: 'story', storyId: 'partial' });
    throw callbackError;
  }), error => error === callbackError);
  await a.allRecords();
  assert.deepEqual([...db.records], callbackBefore, 'asynchronous read callback errors abort all queued writes');
  // A write error during replacement must preserve all preceding records.
  const before = structuredClone([...db.records]);
  db.failDelete = 'message:story:branch:00000000';
  await assert.rejects(b.persist(save(['failed'], branchRefs)), /injected prune failure/);
  await a.allRecords();
  assert.deepEqual([...db.records], before);
  assert.equal(await a.renameStory('missing', 'No resurrection'), false);
  assert.equal(await b.setStoryPinned('missing', true), false);
  console.log('Story library multitab: metadata updates, stale refs, whole-chapter replacement and transaction rollback passed');
}
const watchdog = setTimeout(() => { console.error('Story library multitab test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
