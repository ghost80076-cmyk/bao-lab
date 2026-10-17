const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const AUTO = 'bao-lab:story:autosave', SLOTS = 'bao-lab:story:slots';
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function boot() {
  const data = new Map();
  const c = { indexedDB: {}, structuredClone, setTimeout, console: { warn() {} }, localStorage: {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key)
  } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(source.replace(/Storage\.init\(\);\s*$/, '') + '\nwindow.store = Storage;', c);
  return { store: c.store, data };
}
const save = label => ({ characterId: 'hero', label, savedAt: '2026-10-17T00:00:00Z', config: {}, chat: { messages: [] } });
const slot = id => ({ ...save(id), id });
const put = label => ({ type: 'saveStory', payload: save(label) });
const add = id => ({ type: 'saveSlot', payload: slot(id) });
const del = id => ({ type: 'deleteSlot', id });
const baseline = () => ({ autosave: save('durable'), slots: [slot('old')] });
async function initialization(failAt, clearAutosave = false) {
  const { store, data } = boot(), opening = deferred(), entered = deferred(), release = deferred();
  let durable = baseline(), calls = 0;
  store._openDatabase = () => opening.promise;
  store._migrateLegacyToIndexedDB = async () => {};
  store._loadIndexedDBCache = async () => { store._cache = structuredClone(durable); store._expectedRevision = 0; };
  store._persistOperationIndexedDB = async operation => {
    calls++;
    if (calls === 1) { entered.resolve(); await release.promise; }
    if (calls === failAt) throw Error('injected write failure');
    if (operation.type === 'saveStory') durable.autosave = structuredClone(operation.payload);
    if (operation.type === 'clearStory') durable.autosave = null;
    if (operation.type === 'saveSlot' || operation.type === 'deleteSlot') durable.slots = structuredClone(store._cache.slots);
  };
  const init = store.init();
  for (const operation of [put('queued-first'), add('queued'), del('old'), put('queued-last')]) store._commitOperation(operation);
  opening.resolve({ close() {} });
  await entered.promise;
  // Writes arriving during replay must stay in the same queue and must not be
  // overwritten by an older operation after the first awaited write resumes.
  store._commitOperation(put('during-replay'));
  store._commitOperation(add('during'));
  store._commitOperation(del('queued'));
  if (clearAutosave) store._commitOperation({ type: 'clearStory' });
  release.resolve();
  await init;
  await store.flush();
  const expectedLabel = clearAutosave ? undefined : 'during-replay';
  assert.equal(store._cache.autosave?.label, expectedLabel, 'latest autosave survives initialization');
  assert.deepEqual(Array.from(store._cache.slots, item => item.id), ['during'], 'queued additions and deletions survive');
  assert.equal(store._pendingOperations.length, 0, 'initialization drains or releases the queue');
  if (failAt) {
    assert.equal(store._mode, 'localStorage');
    const backup = JSON.parse(data.get(store.fallbackSnapshotKey));
    assert.equal(backup.autosave?.label, expectedLabel);
    assert.deepEqual(backup.slots.map(item => item.id), ['during']);
    assert.equal(backup.revision, 0, 'a fully loaded baseline supports authoritative recovery');
    // Reload through the real migration policy, including intentional deletions.
    const browser = boot();
    for (const [key, value] of data) browser.data.set(key, value);
    browser.store._getAllRecords = async () => [
      ...(durable.autosave ? [store._record('autosave', durable.autosave)] : []),
      ...durable.slots.map(item => store._record('slot', item))
    ];
    browser.store._replaceDatabaseStories = async (autosave, slots, resolveStories) => {
      if (resolveStories) ({ autosave, slots } = resolveStories(await browser.store._getAllRecords()));
      durable = structuredClone({ autosave, slots });
    };
    await browser.store._migrateLegacyToIndexedDB();
  } else {
    assert.equal(store._mode, 'indexedDB');
    assert.equal(data.has(AUTO), false, 'successful replay cleans temporary local data');
    assert.equal(data.has(SLOTS), false);
  }
  assert.equal(durable.autosave?.label, expectedLabel, 'durable reload retains latest autosave or its deletion');
  assert.deepEqual(durable.slots.map(item => item.id), ['during']);
}
async function transactions() {
  const { store } = boot();
  const durable = new Map([['keep', 'original']]);
  // Model atomic IDB commit/abort rather than mutating the durable map eagerly.
  store._db = { transaction() {
    const staged = new Map(durable);
    let aborted = false;
    const tx = {
      objectStore: () => ({
        get() { const request = {}; queueMicrotask(() => { request.result = undefined; request.onsuccess?.(); }); return request; },
        delete: key => staged.delete(key),
        put: record => { if (record.kind !== 'storage-meta') staged.set(record.id, record.value); }
      }),
      abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); }
    };
    setImmediate(() => {
      if (aborted) return;
      durable.clear(); for (const entry of staged) durable.set(...entry);
      tx.oncomplete?.();
    });
    return tx;
  } };
  const failure = Error('serialization failure');
  await assert.rejects(store._transaction('readwrite', objectStore => {
    objectStore.delete('keep'); objectStore.put({ id: 'new', value: 'partial' }); throw failure;
  }), error => error === failure);
  await new Promise(setImmediate);
  assert.deepEqual([...durable], [['keep', 'original']], 'an action exception must roll back all earlier queued mutations');
  await store._transaction('readwrite', objectStore => objectStore.put({ id: 'new', value: 'complete' }));
  assert.equal(durable.get('new'), 'complete', 'successful transactions still commit');
}
async function main() {
  if (process.argv.includes('--transaction-only')) { await transactions(); return; }
  for (const failAt of [0, 1, 3, 6]) for (const clear of [false, true]) await initialization(failAt, clear);
  await transactions();
  console.log('Storage initialization recovery: concurrent replay, first/middle/late failure, reload deletions and atomic abort passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
