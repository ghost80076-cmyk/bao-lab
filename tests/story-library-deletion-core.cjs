const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const source = fs.readFileSync(process.env.STORY_LIBRARY_SOURCE || path.join(__dirname, '..', 'js/story-library.js'), 'utf8');
function tab(db) {
  const raw = new Map(), notices = [];
  const c = { structuredClone, console: { warn() {} }, BAOFeedback: { notify: text => notices.push(text) }, localStorage: {
    getItem: key => raw.get(key) ?? null, setItem: (key, value) => raw.set(key, String(value)), removeItem: key => raw.delete(key)
  }, Storage: { validateStory: value => Boolean(value?.characterId && Array.isArray(value.chat?.messages)), scrubSecrets: structuredClone, sanitizeImportedStory: structuredClone } };
  c.window = c; vm.createContext(c); vm.runInContext(source, c);
  const lib = c.BAOStoryLibrary; lib._db = db; lib.open = async () => db;
  return { lib, notices };
}
const refs = (storyId, chapterId, parentChapterId = '') => ({ storyId, chapterId, parentChapterId, storyCreatedAt: '2026-01-01', chapterCreatedAt: '2026-01-01', chapterLabel: chapterId });
const save = (lib, count = 1) => ({ characterId: 'hero', characterName: 'Hero', savedAt: '2026-10-18T01:00:00Z', config: {}, state: {},
  chat: { messages: Array.from({ length: count }, (_, i) => ({ id: 'message-' + i, role: 'assistant', content: 'message ' + i })) }, _library: lib });
const deleted = error => error.code === 'YORUBAY_LIBRARY_DELETED';
async function main() {
  const db = new Database(), { lib: a, notices } = tab(db), { lib: b } = tab(db);
  const root = refs('story', 'root');
  await a.persist(save(root));
  await a.persist(save(refs('unrelated', 'keep')));
  let release; a._writeQueue = new Promise(resolve => { release = resolve; });
  const queued = a.queuePersist(save(root, 3));
  assert.equal(await b.deleteStory('story'), true);
  const afterDelete = structuredClone([...db.records]);
  release(); assert.equal(await queued, false, 'an older queued save cannot resurrect a deleted story');
  assert.equal(await a.flush('story'), false);
  assert.deepEqual([...db.records], afterDelete);
  assert.equal(notices.length, 1, 'a blocked stale save reports why the library could not persist it');
  await a.queuePersist(save(root));
  assert.equal(notices.length, 1, 'repeated autosaves must not repeat the same deletion notice');
  await assert.rejects(a.persist(save(root)), deleted);
  await assert.rejects(a.persist(save(refs('story', 'new-chapter'))), deleted);
  assert.equal(await a.reconstruct('story', 'root'), null);
  assert.equal((await a.reconstruct('unrelated', 'keep')).chat.messages.length, 1);
  // A fresh identity (the normal full-bundle import path) remains writable.
  assert.equal(await a.persist(save(refs('imported-story', 'imported-chapter'))), true);
  // Delete reads the version committed before it, including newly added messages.
  const race = refs('race', 'root'); await a.persist(save(race));
  await Promise.all([a.persist(save(race, 4)), b.deleteStory('race')]);
  assert.equal([...db.records.values()].filter(x => x.storyId === 'race' && x.kind !== 'deletion').length, 0);
  const main = refs('chapters', 'main'), branch = refs('chapters', 'branch', 'main'), leaf = refs('chapters', 'leaf', 'branch');
  for (const ref of [main, branch, leaf]) await a.persist(save(ref));
  b.adoptRefs({ _library: branch });
  assert.equal(await b.deleteChapter('chapters', 'main'), true);
  await assert.rejects(a.persist(save(main)), deleted);
  assert.equal(await a.persist(save(branch)), true, 'promoted child remains writable even with stale parent refs');
  assert.equal((await a.listChapters('chapters')).find(x => x.chapterId === 'branch').parentChapterId, '');
  assert.ok((await a.listStories()).find(x => x.storyId === 'chapters').activeChapterId !== 'main');
  // A last chapter is removed together with its story metadata.
  b.clearRefs();
  assert.equal(await b.deleteChapter('imported-story', 'imported-chapter'), true);
  await assert.rejects(a.persist(save(refs('imported-story', 'new-chapter'))), deleted);
  const trunk = refs('tree', 'trunk'), fork = refs('tree', 'fork', 'trunk'), child = refs('tree', 'child', 'fork');
  for (const ref of [trunk, fork, child]) await a.persist(save(ref));
  b.adoptRefs({ _library: child });
  assert.equal(await b.deleteBranch('tree', 'fork'), false, 'deleting a subtree containing the active chapter must be refused');
  b.adoptRefs({ _library: trunk });
  const newcomer = refs('tree', 'new-child', 'fork');
  const results = await Promise.all([a.persist(save(newcomer, 3)), b.deleteBranch('tree', 'fork')]);
  assert.equal(results[1].deleted, 3, 'subtree membership is read in the deletion transaction');
  for (const ref of [fork, child, newcomer, refs('tree', 'late-child', 'fork')]) await assert.rejects(a.persist(save(ref)), deleted);
  assert.deepEqual(Array.from(await a.listChapters('tree'), x => x.chapterId), ['trunk']);
  assert.equal((await a.listStories()).find(x => x.storyId === 'tree').activeChapterId, 'trunk');
  // Failed deletion cannot commit partial removals or tombstones.
  const protectedRefs = refs('rollback', 'root'); await a.persist(save(protectedRefs));
  const before = structuredClone([...db.records]);
  db.failDelete = 'message:rollback:root:00000000';
  await assert.rejects(b.deleteStory('rollback'), /injected prune failure/);
  await a.allRecords();
  assert.deepEqual([...db.records], before);
  db.failDelete = null;
  assert.equal(await a.persist(save(protectedRefs, 2)), true);
  console.log('Story library deletion: queued/stale saves, atomic removal, promoted children, subtree guards and rollback passed');
}
const watchdog = setTimeout(() => { console.error('Story library deletion test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
