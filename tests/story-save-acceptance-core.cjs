'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const drain = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function fixture() {
  const notices = [], nodes = new Map(), listeners = {};
  const create = () => ({ style: {}, children: [], dataset: {}, setAttribute() {}, addEventListener(type, fn) { this[type] = fn; },
    append(...children) { this.children.push(...children); }, remove() { nodes.delete(this.id); } });
  const composer = { before(node) { nodes.set(node.id, node); } };
  const storage = { _cache: {}, prefix: 'bao:', storyKey: 'story', status: () => ({ mode: 'indexedDB' }), flush: async () => {},
    loadStory() { return this._cache.autosave; } };
  let serial = 0, libraryOK = true;
  const library = { refs: () => ({ storyId: 's', chapterId: 'c' }), flush: async id => { assert.equal(id, 's'); return libraryOK; } };
  const app = { config: {}, saveStory() { storage._cache.autosave = { savedAt: String(++serial), _library: library.refs(), chat: { messages: [{ content: 'produced content' }] } }; return true; } };
  const ctx = vm.createContext({ App: app, Storage: storage, GameState: { current: {} }, Chat: {}, console,
    document: { querySelector: () => composer, getElementById: id => nodes.get(id), createElement: create },
    localStorage: { getItem() {} }, addEventListener: (name, fn) => { listeners[name] = fn; },
    BAOStoryLibrary: library, BAOFeedback: { notify: (message, tone) => notices.push({ message, tone }) } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(process.env.STORAGE_WRITE_GUARD_SOURCE || 'js/storage-write-guard.js', 'utf8'), ctx);
  return { app, storage, library, notices, nodes, listeners, ctx, failLibrary: () => { libraryOK = false; }, recover: () => { libraryOK = true; } };
}

test('manual save never claims success when the chapter write failed', async () => {
  const f = fixture(); f.failLibrary();
  assert.equal(f.app.saveStory(true), true, 'the synchronous API remains acceptance only');
  await drain();
  assert.equal(f.notices.some(n => n.tone === 'success'), false);
  assert.match(f.nodes.get('bao-storage-write-warning')?.textContent || '', /故事庫|章節/);
});

test('durability barrier waits for both stores; failed saves block unload until local retry succeeds', async () => {
  const f = fixture(), gate = deferred();
  f.library.flush = async () => gate.promise;
  f.app.saveStory(true);
  let done = false;
  const barrier = f.ctx.BAOStorageWriteGuard.whenIdle().then(ok => { done = true; return ok; });
  await drain(); assert.equal(done, false); assert.equal(f.notices.length, 0);
  let blocked = false;
  f.listeners.beforeunload({ preventDefault() { blocked = true; } });
  assert.equal(blocked, true);
  gate.resolve(false); assert.equal(await barrier, false);
  assert.equal(f.storage.loadStory().chat.messages[0].content, 'produced content');
  f.library.flush = async () => true;
  f.app.saveStory(true); assert.equal(await f.ctx.BAOStorageWriteGuard.whenIdle(), true);
  blocked = false; f.listeners.beforeunload({ preventDefault() { blocked = true; } });
  assert.equal(blocked, false);
  assert.equal(f.nodes.has('bao-storage-write-warning'), false);
});

test('overlapping auto/manual saves await the newest accepted write without premature success', async () => {
  const f = fixture(), first = deferred(), second = deferred();
  let calls = 0;
  f.storage.flush = () => (++calls === 1 ? first.promise : second.promise);
  f.app.saveStory(true); await drain(); f.app.saveStory(false); await drain();
  first.resolve(); await drain(); assert.equal(f.notices.some(n => n.tone === 'success'), false);
  second.resolve(); assert.equal(await f.ctx.BAOStorageWriteGuard.whenIdle(), true);
});

test('fallback verification rejects a same-time same-length but different story', () => {
  const f = fixture(); f.storage.status = () => ({ mode: 'localStorage' });
  f.storage._readFallbackSnapshot = () => ({ autosave: { savedAt: '1', chat: { messages: [{ content: 'old' }] } } });
  assert.equal(f.ctx.BAOStorageWriteGuard.verify({ savedAt: '1', chat: { messages: [{ content: 'new' }] } }).ok, false);
});

test('saving a pending player turn waits for cancellation and cannot replace the last valid save', async () => {
  const f = fixture(), gate = deferred();
  f.app.saveStory(false); await f.ctx.BAOStorageWriteGuard.whenIdle();
  const prior = f.storage.loadStory();
  f.app.__requestPending = true; f.app.__requestSettlement = gate.promise;
  f.ctx.Chat.messages = [{ role: 'user', content: 'unsettled input' }];
  f.app.saveStory(true); await drain();
  assert.equal(f.storage.loadStory(), prior, 'never write a transient player message into the last valid save');
  f.ctx.Chat.messages = []; f.app.__requestPending = false;
  gate.resolve(); assert.equal(await f.ctx.BAOStorageWriteGuard.whenIdle(), true);
  assert.notEqual(f.storage.loadStory(), prior, 'the deferred save runs after the turn settles');
});

test('the retry barrier includes chapter replay before the new autosave is accepted', async () => {
  const f = fixture(), gate = deferred();
  f.failLibrary(); f.app.saveStory(false);
  assert.equal(await f.ctx.BAOStorageWriteGuard.whenIdle(), false);
  f.library.retryFailedWrites = () => gate.promise;
  f.recover();
  f.ctx.BAOStorageWriteGuard.retry();
  let settled = false;
  const pending = f.ctx.BAOStorageWriteGuard.whenIdle().then(ok => { settled = true; return ok; });
  await drain(); assert.equal(settled, false);
  gate.resolve(); assert.equal(await pending, true);
});
