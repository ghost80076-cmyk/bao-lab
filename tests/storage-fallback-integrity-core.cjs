const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const AUTO = 'bao-lab:story:autosave', SLOTS = 'bao-lab:story:slots', MARKER = 'bao-lab:story-idb-fallback-v1';
class BrowserStorage {
  data = new Map(); failures = new Set(); writes = [];
  getItem(key) { if (this.failures.has('get:' + key)) throw Error('blocked read'); return this.data.get(key) ?? null; }
  setItem(key, value) { this.writes.push(['set', key]); if (this.failures.has('set:' + key)) throw Error('quota exceeded'); this.data.set(key, String(value)); }
  removeItem(key) { this.writes.push(['remove', key]); if (this.failures.has('remove:' + key)) throw Error('blocked delete'); this.data.delete(key); }
}
const save = (label, time = '2026-10-17T00:00:00Z') => ({ characterId: 'hero', label, savedAt: time, config: {}, chat: { messages: [{ role: 'user', content: label }] }, state: {} });
function boot(localStorage) {
  const c = { localStorage, structuredClone, setTimeout, console: { warn() {} } };
  c.window = c;
  vm.createContext(c);
  vm.runInContext(source + '\nwindow.store = Storage;', c);
  return c.store;
}
// Use the real migration policy with a durable record collection. Transaction
// plumbing itself is exercised by storage-indexeddb-core.cjs.
async function reloadAndMigrate(browser, records) {
  const next = boot(browser);
  next._getAllRecords = async () => structuredClone(records);
  next._replaceDatabaseStories = async (autosave, slots) => {
    records.splice(0, records.length,
      ...(autosave ? [next._record('autosave', autosave)] : []),
      ...slots.map(slot => next._record('slot', slot)));
  };
  await next._migrateLegacyToIndexedDB();
  return records;
}
async function testFailure(failedKey, priorMarker = false, initializing = false) {
  const browser = new BrowserStorage();
  const store = boot(browser);
  const oldAuto = save('durable-auto');
  const keptSlot = { ...save('durable-slot'), id: 'keep' };
  const records = [store._record('autosave', oldAuto), store._record('slot', keptSlot)];
  if (priorMarker) {
    browser.setItem(AUTO, JSON.stringify(oldAuto));
    browser.setItem(SLOTS, JSON.stringify([keptSlot]));
    browser.setItem(MARKER, priorMarker === true ? 'yes' : priorMarker);
  }
  store._cache = { autosave: save('new-auto', '2026-10-17T01:00:00Z'), slots: [] };
  browser.failures.add('set:' + failedKey);
  if (initializing) assert.equal(store._persistLegacySnapshot(false), false);
  else { store._mode = 'indexedDB'; store._degradeToLocalStorage(Error('IndexedDB unavailable')); }
  assert.equal(browser.getItem(MARKER), null, 'partial fallback must not be authoritative');
  browser.failures.clear();
  await reloadAndMigrate(browser, records);
  assert.ok(records.some(record => record.id === 'keep'), 'incomplete fallback must not delete the durable slot');
  assert.ok(records.some(record => record.kind === 'autosave'), 'incomplete fallback must not delete the durable autosave');
  if (failedKey === SLOTS) assert.equal(records.find(record => record.kind === 'autosave').payload.label, 'new-auto');
}
async function main() {
  for (const key of [AUTO, SLOTS]) for (const marker of [false, 'yes', 'complete-v2']) await testFailure(key, marker);
  await testFailure(SLOTS, true, true);
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('autosave', save('old')), store._record('slot', { ...save('old-slot'), id: 'old-slot' })];
    store._cache = { autosave: null, slots: [] };
    store._mode = 'indexedDB';
    store._degradeToLocalStorage(Error('offline'));
    assert.equal(browser.getItem(MARKER), store.fallbackCompleteMarker, 'complete fallback can commit intentional deletions');
    await reloadAndMigrate(browser, records);
    assert.equal(records.length, 0, 'complete deletion snapshot remains authoritative');
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    browser.setItem(AUTO, JSON.stringify(save('prior')));
    browser.setItem(SLOTS, JSON.stringify([])); browser.setItem(MARKER, 'yes');
    browser.writes.length = 0;
    browser.failures.add('remove:' + MARKER);
    store._cache = { autosave: save('new'), slots: [] };
    store._mode = 'indexedDB';
    store._degradeToLocalStorage(Error('offline'));
    assert.equal(JSON.parse(browser.getItem(AUTO)).label, 'prior', 'if marker cannot be invalidated, keep the previously complete snapshot');
    assert.ok(!browser.writes.some(([op, key]) => op === 'set' && key !== MARKER));
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    browser.setItem(AUTO, JSON.stringify(save('prior')));
    browser.setItem(MARKER, 'yes');
    browser.failures.add('remove:' + AUTO);
    store._cache = { autosave: null, slots: [] };
    store._mode = 'indexedDB';
    store._degradeToLocalStorage(Error('offline'));
    assert.equal(browser.getItem(MARKER), null, 'failed autosave deletion must not commit a complete fallback marker');
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('slot', { ...save('durable-slot'), id: 'keep' })];
    browser.failures.add('set:' + MARKER);
    store._cache = { autosave: save('new'), slots: [] };
    assert.equal(store._persistLegacySnapshot(true), false);
    assert.equal(browser.getItem(MARKER), null);
    browser.failures.clear();
    await reloadAndMigrate(browser, records);
    assert.ok(records.some(record => record.id === 'keep'), 'an uncommitted deletion snapshot must not clear durable slots');
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    store._cache = { autosave: save('local-only'), slots: [] };
    assert.equal(store._persistLegacySnapshot(false), true);
    assert.equal(browser.getItem(MARKER), null);
    assert.equal(JSON.parse(browser.getItem(AUTO)).label, 'local-only');
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('autosave', save('durable-auto')), store._record('slot', { ...save('durable-slot'), id: 'keep' })];
    browser.setItem(SLOTS, '[]'); browser.setItem(MARKER, 'yes');
    await reloadAndMigrate(browser, records);
    assert.equal(records.length, 2, 'legacy markers cannot authorize deletion of existing IndexedDB stories');
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('slot', { ...save('durable-slot'), id: 'keep' })];
    store._mode = 'initializing';
    store._degradeToLocalStorage(Error('database open failed'));
    assert.equal(browser.getItem(MARKER), null, 'unloaded IndexedDB cache cannot become an authoritative fallback');
    store._commitOperation({ type: 'saveStory', payload: save('new-after-failure') });
    assert.equal(browser.getItem(MARKER), null, 'later local writes must retain incomplete-baseline status');
    await reloadAndMigrate(browser, records);
    assert.ok(records.some(record => record.id === 'keep'));
    assert.ok(records.some(record => record.payload.label === 'new-after-failure'));
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    browser.setItem(AUTO, JSON.stringify(save('complete')));
    browser.setItem(SLOTS, '[]'); browser.setItem(MARKER, store.fallbackCompleteMarker);
    browser.failures.add('remove:' + MARKER);
    assert.equal(store._cleanupLegacyStoryStorage(), false);
    assert.equal(JSON.parse(browser.getItem(AUTO)).label, 'complete');
    assert.equal(browser.getItem(SLOTS), '[]', 'cleanup must keep snapshot keys if the authoritative marker cannot be removed');
    browser.failures.clear();
    assert.equal(store._cleanupLegacyStoryStorage(), true);
    assert.equal(browser.getItem(MARKER), null);
    assert.equal(browser.getItem(AUTO), null);
    assert.equal(browser.getItem(SLOTS), null);
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('autosave', save('durable-original'))];
    browser.setItem(AUTO, JSON.stringify(save('fallback')));
    browser.setItem(SLOTS, '[]'); browser.setItem(MARKER, store.fallbackCompleteMarker);
    browser.failures.add('remove:' + MARKER);
    await assert.rejects(reloadAndMigrate(browser, records), /blocked delete/);
    assert.equal(records[0].payload.label, 'durable-original', 'blocked marker retirement must prevent IDB migration from starting');
    assert.equal(JSON.parse(browser.getItem(AUTO)).label, 'fallback');
  }
  console.log('Storage fallback integrity: partial writes/reload, stale marker, intentional deletion and blocked invalidation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
