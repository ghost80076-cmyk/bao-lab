const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WebLocks } = require('./helpers/storage-web-locks.cjs');
const source = fs.readFileSync(process.env.STORAGE_SOURCE || path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
class BrowserStorage {
  data = new Map(); fail = false;
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.fail) throw Error('quota exceeded'); this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
function boot(localStorage, manager, supported = true) {
  const locks = manager.client();
  const c = { localStorage, navigator: supported ? { locks } : {}, structuredClone, setTimeout, console: { warn() {} } };
  c.window = c; vm.createContext(c);
  vm.runInContext(source + '\nwindow.store = Storage;', c);
  c.store.closeDocument = () => locks.close(); // Browser destroys its held lease.
  return c.store;
}
const save = (label, n = 0) => ({ characterId: 'hero', label, savedAt: new Date(1760000000000 + n * 1000).toISOString(), config: {}, chat: { messages: [] } });
const add = (id, n = 0) => ({ type: 'saveSlot', payload: { ...save(id, n), id } });
const ids = store => Array.from(store.listSlots(), slot => slot.id).sort();
async function main() {
  const browser = new BrowserStorage(), locks = new WebLocks();
  let a = boot(browser, locks), b = boot(browser, locks);
  await Promise.all([a.ready(), b.ready()]);
  a._commitOperation(add('a', 1)); b._commitOperation(add('b', 2));
  const result = await Promise.allSettled([a.flush(), b.flush()]);
  assert.equal(result[0].status, 'fulfilled');
  assert.equal(result[1].status, 'rejected');
  assert.equal(result[1].reason.code, 'BAO_FALLBACK_WRITE_UNSAFE');
  assert.deepEqual(ids(boot(browser, locks)), ['a'], 'the confirmed slot is never overwritten by another page');
  assert.ok(b.getSlot('b'), 'rejected writer retains its accepted original payload for export');
  const recover = async (owner, blocked, operation) => {
    owner.closeDocument(); blocked.closeDocument();
    const reopened = boot(browser, locks); await reopened.ready();
    reopened._commitOperation(operation); await reopened.flush(); return reopened;
  };
  // Export/reopen/import is deliberate: an already-loaded blocked page cannot
  // assume that acquiring a later lock refreshes its stale localStorage cache.
  a = await recover(a, b, add('b', 2));
  assert.deepEqual(ids(boot(browser, locks)), ['a', 'b'], 'both slots survive explicit safe recovery');
  b = boot(browser, locks); await b.ready(); // stale cache includes a
  a.deleteSlot('a'); await a.flush();
  b._commitOperation(add('c', 3)); await assert.rejects(b.flush(), { code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  assert.deepEqual(ids(boot(browser, locks)), ['b'], 'stale rejected writer cannot resurrect a deletion');
  a = await recover(a, b, add('c', 3));
  assert.deepEqual(ids(boot(browser, locks)), ['b', 'c']);
  a.deleteSlot('missing'); await a.flush();
  assert.deepEqual(ids(boot(browser, locks)), ['b', 'c'], 'deleting an absent slot retains unrelated slots');
  a._commitOperation({ type: 'saveStory', payload: save('first', 1) }); await a.flush();
  b = boot(browser, locks); await b.ready();
  b._commitOperation({ type: 'saveStory', payload: save('last', 2) });
  await assert.rejects(b.flush(), { code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  assert.equal(boot(browser, locks).loadStory().label, 'first');
  a = await recover(a, b, { type: 'saveStory', payload: save('last', 2) });
  assert.equal(boot(browser, locks).loadStory().label, 'last');
  a.clearStory(); await a.flush();
  assert.equal(boot(browser, locks).loadStory(), null, 'intentional autosave deletion survives reload');
  for (let n = 4; n <= 20; n++) a._commitOperation(add('slot-' + n, n));
  await a.flush();
  b = boot(browser, locks); await b.ready();
  a._commitOperation(add('new-a', 30)); b._commitOperation(add('new-b', 31));
  await a.flush(); await assert.rejects(b.flush(), { code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  a = await recover(a, b, add('new-b', 31));
  const reloaded = boot(browser, locks);
  assert.equal(reloaded.listSlots().length, 20);
  assert.ok(reloaded.getSlot('new-a') && reloaded.getSlot('new-b'));
  const prior = [...browser.data];
  browser.fail = true;
  a._commitOperation(add('quota-failed', 40)); await assert.rejects(a.flush(), /quota/);
  assert.deepEqual([...browser.data], prior, 'failed atomic commit leaves the entire previous snapshot untouched');
  assert.ok(a.getSlot('quota-failed'));
  browser.fail = false;
  a._commitOperation(add('after-quota', 41)); await a.flush();
  const recovered = boot(browser, locks);
  assert.ok(recovered.getSlot('after-quota') && recovered.getSlot('quota-failed'), 'recovery retries every latest failed operation, not only the newest slot');
  assert.equal(a.status().uncommittedWrites, 0);
  assert.equal(locks.maximum, 1);
  const unsupported = boot(new BrowserStorage(), new WebLocks(), false);
  unsupported._commitOperation(add('no-locks'));
  await assert.rejects(unsupported.flush(), { code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  assert.ok(unsupported.getSlot('no-locks'));
  // Deterministically model WebKit returning a stale null snapshot after the
  // previous tab releases its native story lock. The new lease rejects before
  // consulting this stale read, rather than overwriting the confirmed slot.
  const staleBrowser = new BrowserStorage(), staleLocks = new WebLocks();
  const first = boot(staleBrowser, staleLocks); await first.ready();
  const staleView = { getItem: key => key === first.fallbackSnapshotKey ? null : staleBrowser.getItem(key),
    setItem: (...args) => staleBrowser.setItem(...args), removeItem: key => staleBrowser.removeItem(key) };
  const stale = boot(staleView, staleLocks); await stale.ready();
  first._commitOperation(add('confirmed')); await first.flush();
  stale._commitOperation(add('recoverable'));
  await assert.rejects(stale.flush(), { code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  assert.deepEqual(ids(boot(staleBrowser, staleLocks)), ['confirmed']);
  assert.ok(stale.getSlot('recoverable'));
  const failedBrowser = new BrowserStorage(), failedLocks = new WebLocks();
  const failed = boot(failedBrowser, failedLocks);
  failed._mode = 'indexedDB'; failed._expectedRevision = 0;
  failed._persistOperationIndexedDB = async () => { throw Error('database write failed'); };
  failed._commitOperation({ type: 'saveStory', payload: save('queued-old', 1) });
  failed._commitOperation(add('queued-slot', 2)); failed.deleteSlot('queued-slot');
  failed._commitOperation({ type: 'saveStory', payload: save('queued-last', 3) });
  await failed.flush();
  assert.equal(boot(failedBrowser, failedLocks).loadStory().label, 'queued-last');
  assert.deepEqual(ids(boot(failedBrowser, failedLocks)), [], 'writes queued behind failed IDB still reach fallback');
  const mixedBrowser = new BrowserStorage(), mixedLocks = new WebLocks();
  const old = boot(mixedBrowser, mixedLocks);
  old._mode = 'indexedDB'; old._expectedRevision = 0; old._cache = { autosave: save('old'), slots: [] };
  old._degradeToLocalStorage(Error('offline')); await old.flush(); old.closeDocument();
  const newer = boot(mixedBrowser, mixedLocks);
  newer._mode = 'indexedDB'; newer._expectedRevision = 1; newer._cache = { autosave: save('newer', 1), slots: [] };
  newer._degradeToLocalStorage(Error('offline')); await newer.flush();
  newer._commitOperation(add('another', 2)); await newer.flush();
  assert.equal(JSON.parse(mixedBrowser.getItem(old.fallbackSnapshotKey)).revision, null,
    'mixed source revisions cannot regain replacement authority');
  console.log('Fallback multitab: lease conflict, safe recovery, stale deletion, autosave, capacity, quota replay and unsupported locks passed');
}
const watchdog = setTimeout(() => { console.error('Fallback multitab test stalled'); process.exitCode = 1; }, 10000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
