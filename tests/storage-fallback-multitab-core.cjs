const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.STORAGE_SOURCE || path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
class BrowserStorage {
  data = new Map(); fail = false;
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw Error('quota exceeded'); this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
class Locks {
  tail = Promise.resolve(); active = 0; maximum = 0;
  request(name, options, action) {
    const run = async () => {
      this.active++; this.maximum = Math.max(this.maximum, this.active);
      try { await new Promise(setImmediate); return await action(); }
      finally { this.active--; }
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => {});
    return result;
  }
}
function boot(localStorage, locks) {
  const c = { localStorage, navigator: { locks }, structuredClone, setTimeout, console: { warn() {} } };
  c.window = c; vm.createContext(c);
  vm.runInContext(source + '\nwindow.store = Storage;', c);
  return c.store;
}
const save = (label, n = 0) => ({ characterId: 'hero', label, savedAt: new Date(1760000000000 + n * 1000).toISOString(), config: {}, chat: { messages: [] } });
const add = (id, n = 0) => ({ type: 'saveSlot', payload: { ...save(id, n), id } });
const ids = store => Array.from(store.listSlots(), slot => slot.id).sort();
async function main() {
  const browser = new BrowserStorage(), locks = new Locks();
  let a = boot(browser, locks), b = boot(browser, locks);
  a._commitOperation(add('a', 1)); b._commitOperation(add('b', 2));
  await Promise.all([a.flush(), b.flush()]);
  assert.deepEqual(ids(boot(browser, locks)), ['a', 'b'], 'two fallback writers must both survive reload');
  b = boot(browser, locks); // stale cache still contains a when a deletes it
  a.deleteSlot('a'); await a.flush();
  b._commitOperation(add('c', 3)); await b.flush();
  assert.deepEqual(ids(boot(browser, locks)), ['b', 'c'], 'a stale writer must not resurrect another tab\'s deletion');
  a.deleteSlot('missing'); await a.flush();
  assert.deepEqual(ids(boot(browser, locks)), ['b', 'c'], 'deleting from a stale tab retains unrelated remote slots');
  a._commitOperation({ type: 'saveStory', payload: save('first', 1) });
  b._commitOperation({ type: 'saveStory', payload: save('last', 2) });
  await Promise.all([a.flush(), b.flush()]);
  assert.equal(boot(browser, locks).loadStory().label, 'last');
  a.clearStory(); await a.flush();
  assert.equal(boot(browser, locks).loadStory(), null, 'intentional autosave deletion survives reload');
  for (let n = 4; n <= 20; n++) a._commitOperation(add('slot-' + n, n));
  await a.flush();
  b = boot(browser, locks);
  a._commitOperation(add('new-a', 30)); b._commitOperation(add('new-b', 31));
  await Promise.all([a.flush(), b.flush()]);
  const reloaded = boot(browser, locks);
  assert.equal(reloaded.listSlots().length, 20);
  assert.ok(reloaded.getSlot('new-a') && reloaded.getSlot('new-b'));
  const prior = [...browser.data];
  browser.fail = true;
  a._commitOperation(add('quota-failed', 40)); await a.flush();
  assert.deepEqual([...browser.data], prior, 'failed atomic commit leaves the whole previous snapshot untouched');
  browser.fail = false;
  b._commitOperation(add('after-quota', 41)); await b.flush();
  assert.ok(boot(browser, locks).getSlot('after-quota'), 'a failed writer must release the lock');
  assert.equal(locks.maximum, 1);
  const failedBrowser = new BrowserStorage(), failedLocks = new Locks();
  const failed = boot(failedBrowser, failedLocks);
  failed._mode = 'indexedDB'; failed._expectedRevision = 0;
  failed._persistOperationIndexedDB = async () => { throw Error('database write failed'); };
  failed._commitOperation({ type: 'saveStory', payload: save('queued-old', 1) });
  failed._commitOperation(add('queued-slot', 2));
  failed.deleteSlot('queued-slot');
  failed._commitOperation({ type: 'saveStory', payload: save('queued-last', 3) });
  await failed.flush();
  assert.equal(boot(failedBrowser, failedLocks).loadStory().label, 'queued-last');
  assert.deepEqual(ids(boot(failedBrowser, failedLocks)), [], 'writes queued behind a failed IDB write must still reach fallback');
  const mixedBrowser = new BrowserStorage(), mixedLocks = new Locks();
  const old = boot(mixedBrowser, mixedLocks), newer = boot(mixedBrowser, mixedLocks);
  old._mode = 'indexedDB'; old._expectedRevision = 0;
  old._cache = { autosave: save('old'), slots: [] };
  old._degradeToLocalStorage(Error('offline')); await old.flush();
  newer._mode = 'indexedDB'; newer._expectedRevision = 1;
  newer._cache = { autosave: save('newer', 1), slots: [] };
  newer._degradeToLocalStorage(Error('offline')); await newer.flush();
  old._commitOperation(add('another', 2)); await old.flush();
  assert.equal(JSON.parse(mixedBrowser.getItem(old.fallbackSnapshotKey)).revision, null,
    'mixed source revisions cannot regain replacement authority after another write');
  console.log('Fallback multitab: rebase, deletion, autosave, capacity, atomic quota failure and lock release passed');
}
const watchdog = setTimeout(() => { console.error('Fallback multitab test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
