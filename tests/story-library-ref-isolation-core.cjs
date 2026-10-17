const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Database } = require('./storage-multitab-core.cjs');
const source = fs.readFileSync(process.env.STORY_LIBRARY_SOURCE || path.join(__dirname, '..', 'js/story-library.js'), 'utf8');
const payload = label => ({ characterId: 'hero', characterName: 'Hero', savedAt: '2026-10-18T01:00:00Z', config: {}, state: {},
  chat: { messages: [{ id: label, role: 'assistant', content: label }] } });
function tab(db, raw, initial = null, blocked = false) {
  const c = { structuredClone, console: { warn() {} }, localStorage: {
    getItem: key => { if (blocked) throw Error('blocked'); return raw.get(key) ?? null; },
    setItem: (key, value) => { if (blocked) throw Error('quota'); raw.set(key, String(value)); },
    removeItem: key => { if (blocked) throw Error('blocked'); raw.delete(key); }
  }, App: { startStory() { return true; } }, Storage: {
    _payload: null, _saved: initial,
    validateStory: value => Boolean(value?.characterId && Array.isArray(value.chat?.messages)),
    scrubSecrets: structuredClone, sanitizeImportedStory: structuredClone,
    buildStoryPayload() { return this._payload ? structuredClone(this._payload) : null; },
    saveStory() { this._saved = this.buildStoryPayload(); return !!this._saved; },
    loadStory() { return this._saved ? structuredClone(this._saved) : null; },
    restoreStory(value) { if (value.invalid) return false; this._payload = structuredClone(value); return true; }
  } };
  c.window = c; vm.createContext(c); vm.runInContext(source, c);
  const lib = c.BAOStoryLibrary; lib._db = db; lib.open = async () => db; lib.install();
  return { lib, storage: c.Storage, app: c.App };
}
async function main() {
  const db = new Database(), raw = new Map(), a = tab(db, raw), b = tab(db, raw);
  a.app.startStory(); const ar = a.lib.refs(); a.storage._payload = payload('A');
  b.app.startStory(); const br = b.lib.refs(); b.storage._payload = payload('B');
  assert.notEqual(ar.storyId, br.storyId);
  assert.equal(a.lib.refs().storyId, ar.storyId, 'another tab starting a story cannot redirect this tab');
  a.storage.saveStory(); b.storage.saveStory();
  await Promise.all([a.lib.flush(), b.lib.flush()]);
  assert.equal((await a.lib.reconstruct(ar.storyId, ar.chapterId)).chat.messages[0].content, 'A');
  assert.equal((await b.lib.reconstruct(br.storyId, br.chapterId)).chat.messages[0].content, 'B');
  const branch = a.lib.beginBranch({ messageId: 'A', seq: 0, preview: 'A', label: 'A branch' });
  assert.equal(a.lib.refs().branchPointSeq, 0, 'zero-based branch positions survive local reference writes');
  b.lib.beginChapter('B sequel');
  assert.equal(a.storage.buildStoryPayload()._library.chapterId, branch.chapterId);
  assert.equal(b.storage.buildStoryPayload()._library.storyId, br.storyId);
  a.lib.clearRefs();
  assert.equal(b.lib.refs().storyId, br.storyId, 'clearing refs only clears this page');
  a.storage.restoreStory({ ...payload('A again'), _library: ar });
  assert.equal(b.lib.refs().storyId, br.storyId, 'restoring one page cannot switch another');
  assert.equal(a.storage.restoreStory({ invalid: true }), false);
  assert.equal(a.lib.refs().storyId, ar.storyId);
  // Delete in B clears B's matching refs but A retains its original identity.
  b.lib.adoptRefs({ _library: ar });
  assert.equal(await b.lib.deleteStory(ar.storyId), true);
  assert.equal(a.storage.buildStoryPayload()._library.storyId, ar.storyId, 'remote deletion cannot silently mint a replacement identity');
  a.storage.saveStory();
  assert.equal(await a.lib.flush(ar.storyId), false, 'the existing deletion guard blocks the original identity');
  assert.equal(await a.lib.reconstruct(ar.storyId, ar.chapterId), null);
  // A full reload follows its loaded autosave payload, not another page's old keys.
  const loaded = { ...payload('loaded autosave'), _library: br };
  const fresh = tab(db, raw, loaded);
  await fresh.lib.flush();
  assert.equal(fresh.lib.refs().storyId, br.storyId);
  assert.equal(fresh.lib.refs().chapterId, br.chapterId);
  assert.equal((await fresh.lib.reconstruct(br.storyId, br.chapterId)).chat.messages[0].content, 'loaded autosave');
  const noDisk = tab(db, raw, null, true);
  noDisk.app.startStory(); const isolated = noDisk.lib.refs();
  assert.ok(isolated.storyId && isolated.chapterId, 'blocked localStorage cannot erase live references');
  noDisk.storage._payload = payload('without localStorage');
  noDisk.storage.saveStory(); assert.equal(await noDisk.lib.flush(isolated.storyId), true);
  assert.equal((await noDisk.lib.reconstruct(isolated.storyId, isolated.chapterId)).chat.messages[0].content, 'without localStorage');
  console.log('Story library refs: tab isolation, builds/saves, branches, restore, deletion, reload and blocked localStorage passed');
}
const watchdog = setTimeout(() => { console.error('Story reference isolation test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
