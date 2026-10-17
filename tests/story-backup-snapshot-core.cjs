const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const root = path.join(__dirname, '..');
const librarySource = fs.readFileSync(path.join(root, 'js/story-library.js'), 'utf8');
const backupSource = fs.readFileSync(process.env.STORY_BACKUP_SOURCE || path.join(root, 'js/story-backup.js'), 'utf8');
const storageSource = fs.readFileSync(path.join(root, 'js/storage.js'), 'utf8');
const revisionSource = fs.readFileSync(path.join(root, 'js/story-revision-state.js'), 'utf8');
function tab(db) {
  const raw = new Map();
  const c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => raw.get(key) ?? null, setItem: (key, value) => raw.set(key, String(value)), removeItem: key => raw.delete(key)
  } };
  c.window = c; vm.createContext(c);
  vm.runInContext(storageSource.replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.Storage = Storage;', c);
  vm.runInContext(librarySource, c);
  const lib = c.BAOStoryLibrary; lib._db = db; lib.open = async () => db;
  c.Storage.saveStory = () => true;
  c.App = { config: {}, saveStory: () => true };
  c.Chat = { messages: [], summary: '', add() {} };
  c.API = { send: async () => ({}) };
  vm.runInContext(revisionSource, c);
  vm.runInContext(backupSource, c);
  return { c, lib, backup: c.BAOStoryBackup };
}
const refs = (chapterId, parentChapterId = '') => ({ storyId: 'story', chapterId, parentChapterId,
  storyCreatedAt: '2026-01-01', chapterCreatedAt: chapterId === 'root' ? '2026-01-01' : '2026-01-02', chapterLabel: chapterId });
const payload = (chapter, revision) => ({ characterId: 'hero', characterName: 'Hero', savedAt: '2026-10-18T01:00:00Z',
  character: { id: 'hero', system_prompt: 'AUTHOR-SECRET' }, config: { api: { key: 'API-SECRET' } },
  chat: { messages: [{ id: chapter + '-' + revision, role: 'assistant', content: revision,
    revisionBase: { state: { location: revision + '-base' } }, variants: [{ content: revision }], activeVariant: 0 }], summary: revision },
  state: { location: revision }, _library: refs(chapter, chapter === 'root' ? '' : 'root') });
async function run(change) {
  const db = new Database(), a = tab(db), b = tab(db);
  for (const chapter of ['root', 'branch']) await a.lib.persist(payload(chapter, 'old'));
  a.lib.adoptRefs({ _library: refs('branch', 'root') });
  const read = a.lib.allRecords.bind(a.lib);
  let reads = 0;
  // Commit from the other tab just after the export read returns its snapshot.
  a.lib.allRecords = async () => {
    const records = await read(); reads++;
    if (reads === 1) {
      if (change === 'save') for (const chapter of ['root', 'branch']) await b.lib.persist(payload(chapter, 'new'));
      if (change === 'delete') await b.lib.deleteStory('story');
      if (change === 'switch') a.lib.beginStory('Other active story');
      if (change === 'stale-active') a.lib.adoptRefs({ _library: refs('not-in-snapshot') });
    }
    return records;
  };
  const bundle = await a.backup.buildBundle('story');
  assert.equal(bundle.activeChapterId, 'branch', 'active chapter is chosen from the captured context and snapshot');
  assert.equal(bundle.story.activeChapterId, bundle.activeChapterId);
  assert.deepEqual(Array.from(bundle.chapters, item => item.payload.chat.messages[0].content), ['old', 'old']);
  for (const chapter of bundle.chapters) {
    assert.equal(chapter.payload.state.location, 'old');
    assert.equal(chapter.payload.chat.messages[0].revisionBase.state.location, 'old-base');
    assert.equal(chapter.payload.chat.messages[0].variants[0].content, 'old');
    assert.equal(chapter.checkpoints[0].messageId, chapter.payload.chat.messages[0].id);
    assert.equal(chapter.checkpoints[0].payload.state.location, 'old');
  }
  assert.equal(reads, 1, 'all chapters, metadata and checkpoints must use the same database read');
  assert.equal(JSON.stringify(bundle).includes('AUTHOR-SECRET'), false);
  assert.equal(JSON.stringify(bundle).includes('API-SECRET'), false);
  assert.equal(a.backup.sanitizeBundle(bundle).chapters.length, 2, 'the exported point-in-time bundle remains importable');
  if (change === 'delete') assert.equal(await b.lib.reconstruct('story', 'root'), null);
  if (change === 'save') assert.equal((await b.lib.reconstruct('story', 'root')).chat.messages[0].content, 'new');
}
async function main() {
  for (const change of ['save', 'delete', 'switch', 'stale-active']) await run(change);
  const db = new Database(), a = tab(db);
  await a.lib.persist(payload('root', 'old'));
  const originalRead = a.lib.allRecords.bind(a.lib);
  let reconstructReads = 0;
  a.lib.allRecords = async () => { reconstructReads++; return originalRead(); };
  assert.equal((await a.lib.reconstruct('story', 'root')).chat.messages[0].revisionBase.state.location, 'old-base');
  assert.equal(reconstructReads, 1, 'ordinary rich-message reconstruction also uses one read');
  a.lib.allRecords = originalRead;
  a.lib.adoptRefs({ _library: refs('missing') });
  assert.equal((await a.backup.buildBundle('story')).activeChapterId, 'root', 'stale current chapter falls back to a chapter present in the snapshot');
  const broken = await a.lib.allRecords();
  await a.lib.transaction('readwrite', store => store.delete('snapshot:story:root'));
  await assert.rejects(a.backup.buildBundle('story'), /無法重建/);
  assert.ok(broken.some(item => item.kind === 'snapshot'));
  await a.lib.deleteStory('story');
  await assert.rejects(a.backup.buildBundle('story'), /找不到/);
  console.log('Story backup snapshot: concurrent saves/deletion, context switch, active fallback, privacy and missing records passed');
}
const watchdog = setTimeout(() => { console.error('Backup snapshot test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
