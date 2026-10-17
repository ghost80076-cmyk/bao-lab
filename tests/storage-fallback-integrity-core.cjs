const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'storage.js'), 'utf8');
const AUTO = 'bao-lab:story:autosave', SLOTS = 'bao-lab:story:slots', MARKER = 'bao-lab:story-idb-fallback-v1';
class BrowserStorage {
  data = new Map(); failures = new Set();
  getItem(key) { if (this.failures.has('get:' + key)) throw Error('blocked read'); return this.data.get(key) ?? null; }
  setItem(key, value) { if (this.failures.has('set:' + key)) throw Error('quota exceeded'); this.data.set(key, String(value)); }
  removeItem(key) { if (this.failures.has('remove:' + key)) throw Error('blocked delete'); this.data.delete(key); }
}
const save = (label, time = '2026-10-17T00:00:00Z') => ({ characterId: 'hero', label, savedAt: time, config: {}, chat: { messages: [{ role: 'user', content: label }] }, state: {} });
function boot(localStorage) {
  const c = { localStorage, structuredClone, setTimeout, console: { warn() {} } };
  c.window = c; vm.createContext(c);
  vm.runInContext(source + '\nwindow.store = Storage;', c);
  return c.store;
}
// Actual migration policy; transaction atomicity is covered separately.
async function reloadAndMigrate(browser, records) {
  const next = boot(browser);
  next._replaceDatabaseStories = async (autosave, slots, resolveStories) => {
    if (resolveStories) ({ autosave, slots } = resolveStories(records));
    records.splice(0, records.length,
      ...(autosave ? [next._record('autosave', autosave)] : []),
      ...slots.map(slot => next._record('slot', slot)));
  };
  await next._migrateLegacyToIndexedDB();
  return records;
}
async function main() {
  // Old formats remain readable. Only v3 with a matching revision may delete.
  for (const marker of ['yes', 'complete-v2', 'complete-v3']) {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('autosave', save('durable')), store._record('slot', { ...save('keep'), id: 'keep' })];
    browser.setItem(SLOTS, '[]'); browser.setItem(MARKER, marker);
    if (marker === 'complete-v3') browser.setItem(store.fallbackRevisionKey, '0');
    await reloadAndMigrate(browser, records);
    assert.equal(records.length, marker === 'complete-v3' ? 0 : 2);
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    store._cache = { autosave: save('complete'), slots: [{ ...save('keep'), id: 'keep' }] };
    store._expectedRevision = 0; store._mode = 'indexedDB';
    store._degradeToLocalStorage(Error('offline')); await store.flush();
    const previous = browser.getItem(store.fallbackSnapshotKey);
    assert.equal(JSON.parse(previous).revision, 0);
    browser.failures.add('set:' + store.fallbackSnapshotKey);
    store._commitOperation({ type: 'clearStory' });
    store.deleteSlot('keep'); await store.flush();
    assert.equal(browser.getItem(store.fallbackSnapshotKey), previous, 'quota failure retains the entire prior snapshot');
    assert.equal(boot(browser).loadStory().label, 'complete');
    assert.ok(boot(browser).getSlot('keep'));
    browser.failures.clear();
    const records = [];
    await reloadAndMigrate(browser, records);
    assert.equal(records.length, 2);
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('autosave', save('old')), store._record('slot', { ...save('old-slot'), id: 'old-slot' })];
    store._cache = { autosave: null, slots: [] };
    store._expectedRevision = 0; store._mode = 'indexedDB';
    store._degradeToLocalStorage(Error('offline')); await store.flush();
    await reloadAndMigrate(browser, records);
    assert.equal(records.length, 0, 'matching complete snapshot preserves intentional deletion');
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('slot', { ...save('durable-slot'), id: 'keep' })];
    store._mode = 'initializing';
    store._degradeToLocalStorage(Error('database open failed')); await store.flush();
    store._commitOperation({ type: 'saveStory', payload: save('new-after-failure') }); await store.flush();
    assert.equal(JSON.parse(browser.getItem(store.fallbackSnapshotKey)).revision, null, 'unknown baseline cannot become authoritative');
    await reloadAndMigrate(browser, records);
    assert.ok(records.some(record => record.id === 'keep'));
    assert.ok(records.some(record => record.payload.label === 'new-after-failure'));
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const records = [store._record('autosave', save('durable-original'))];
    browser.setItem(AUTO, JSON.stringify(save('fallback')));
    browser.setItem(SLOTS, '[]'); browser.setItem(MARKER, 'complete-v3');
    browser.setItem(store.fallbackRevisionKey, '0');
    browser.failures.add('remove:' + MARKER);
    await assert.rejects(reloadAndMigrate(browser, records), /blocked delete/);
    assert.equal(records[0].payload.label, 'durable-original');
    assert.equal(store._cleanupLegacyStoryStorage(), false);
    assert.equal(JSON.parse(browser.getItem(AUTO)).label, 'fallback');
    browser.failures.clear();
    assert.equal(store._cleanupLegacyStoryStorage(), true);
    assert.equal(browser.getItem(AUTO), null);
  }
  {
    const browser = new BrowserStorage(), store = boot(browser);
    const corrupt = '{broken-json';
    browser.setItem(store.fallbackSnapshotKey, corrupt);
    store._commitOperation({ type: 'saveStory', payload: save('new') }); await store.flush();
    assert.equal(browser.getItem(store.fallbackSnapshotKey), corrupt, 'invalid existing snapshot is preserved for recovery');
    await assert.rejects(reloadAndMigrate(browser, []), /JSON|position|property/i);
  }
  console.log('Storage fallback integrity: atomic quota failure, reload, legacy markers, unknown baseline and corrupt snapshot preservation passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
