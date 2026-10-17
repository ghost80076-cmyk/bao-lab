const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
// Transactions share one scheduler and commit atomically. Requests queued from
// success callbacks remain in the same transaction, as in browser IndexedDB.
class Database {
  records = new Map(); queue = []; active = false;
  transaction() {
    const requests = [];
    let staged, aborted = false;
    const tx = { error: null, objectStore: () => ({
      getAll: () => request(() => [...staged.values()].map(value => structuredClone(value))),
      put: value => request(() => staged.set(value.id, structuredClone(value))),
      delete: id => { if (id === this.failDelete) throw Error('injected prune failure'); return request(() => staged.delete(id)); }
    }), abort: () => { aborted = true; } };
    const request = action => { const r = {}; requests.push(() => { r.result = action(); r.onsuccess?.(); }); return r; };
    this.queue.push(() => {
      staged = new Map([...this.records].map(([key, value]) => [key, structuredClone(value)]));
      const step = () => {
        try {
          if (aborted) { tx.onabort?.(); return done(); }
          if (requests.length) { requests.shift()(); setImmediate(step); return; }
          this.records = staged; tx.oncomplete?.(); done();
        } catch (error) { tx.error = error; aborted = true; tx.onerror?.(); done(); }
      };
      const done = () => { this.active = false; this.drain(); };
      setImmediate(step);
    });
    this.drain();
    return tx;
  }
  drain() { if (!this.active && this.queue.length) { this.active = true; this.queue.shift()(); } }
}
function tab(db, cache) {
  const c = { structuredClone, setTimeout, console: { warn() {} }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c.window = c; vm.createContext(c);
  vm.runInContext(source.replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.store = Storage;', c);
  Object.assign(c.store, { _db: db, _mode: 'indexedDB', _ready: true, _initPromise: Promise.resolve('indexedDB'), _cache: structuredClone(cache) });
  return c.store;
}
const save = (label, time = 0) => ({ characterId: 'hero', label, savedAt: new Date(1760000000000 + time * 1000).toISOString(), config: {}, chat: { messages: [] } });
const add = (id, time) => ({ type: 'saveSlot', payload: { ...save(id, time), id } });
async function main() {
  const db = new Database(), empty = { autosave: null, slots: [] };
  const a = tab(db, empty), b = tab(db, empty);
  db.records.set(a.autosaveRecordId, a._record('autosave', save('keep-autosave')));
  db.records.set('extension', { id: 'extension', kind: 'other', payload: { keep: true } });
  a._commitOperation(add('a', 1)); b._commitOperation(add('b', 2));
  await Promise.all([a.flush(), b.flush()]);
  assert.ok(db.records.has('a') && db.records.has('b'), 'simultaneous saves from stale tabs must both survive');
  // B still has A in its stale cache when A removes that slot.
  b._cache.slots = [add('a', 1).payload, add('b', 2).payload];
  a.deleteSlot('a'); await a.flush();
  b._commitOperation(add('c', 3)); await b.flush();
  assert.equal(db.records.has('a'), false, 'saving another slot must not resurrect a remotely deleted slot');
  a.deleteSlot('missing'); await a.flush();
  assert.ok(db.records.has('b') && db.records.has('c'), 'a stale-tab delete must retain unrelated remote slots');
  a.deleteSlot(a.autosaveRecordId); await a.flush();
  assert.equal(db.records.get(a.autosaveRecordId).payload.label, 'keep-autosave');
  assert.equal(db.records.get('extension').payload.keep, true);
  const cappedDB = new Database();
  const first = tab(cappedDB, empty);
  for (let i = 0; i < 19; i++) cappedDB.records.set('old-' + i, first._record('slot', add('old-' + i, i).payload));
  const baseline = { autosave: null, slots: [...cappedDB.records.values()].map(record => record.payload) };
  const left = tab(cappedDB, baseline), right = tab(cappedDB, baseline);
  left._commitOperation(add('left', 30)); right._commitOperation(add('right', 31));
  await Promise.all([left.flush(), right.flush()]);
  const slots = [...cappedDB.records.values()].filter(record => record.kind === 'slot');
  assert.equal(slots.length, 20, 'capacity pruning must use the shared transaction state');
  assert.ok(cappedDB.records.has('left') && cappedDB.records.has('right'));
  assert.equal(cappedDB.records.has('old-0'), false, 'only the oldest slot is evicted');
  const reloaded = tab(cappedDB, empty); await reloaded._loadIndexedDBCache();
  assert.equal(reloaded.listSlots().length, 20);
  assert.ok(reloaded.getSlot('left') && reloaded.getSlot('right'));
  cappedDB.failDelete = 'old-1';
  await assert.rejects(left._persistOperationIndexedDB(add('rollback-slot', 40)), /injected prune failure/);
  await left._getAllRecords(); // wait until the aborted transaction has settled
  assert.equal(cappedDB.records.has('rollback-slot'), false, 'prune errors roll back the newly queued slot');
  assert.ok(cappedDB.records.has('old-1'), 'failed pruning must retain the previous durable slot');
  assert.equal(cappedDB.records.size, 20);
  console.log('Storage multitab: concurrent adds, stale deletes, no resurrection, atomic capacity and reload passed');
}
const watchdog = setTimeout(() => { console.error('Storage multitab test stalled'); process.exitCode = 1; }, 5000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
