const assert = require('node:assert/strict');
const { Database, tab, save, add } = require('./storage-multitab-core.cjs');
const empty = () => ({ autosave: null, slots: [] });
class BrowserStorage {
  data = new Map();
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
async function migrationRace() {
  const db = new Database(), browser = new BrowserStorage();
  const writer = tab(db, empty(), browser), reader = tab(db, empty(), browser);
  db.records.set(writer.autosaveRecordId, writer._record('autosave', save('old-auto', 1)));
  db.records.set('deleted', writer._record('slot', add('deleted', 1).payload));
  browser.setItem(reader.prefix + reader.slotsKey, JSON.stringify([add('legacy', 2).payload]));
  const replace = reader._replaceDatabaseStories.bind(reader);
  reader._replaceDatabaseStories = async (...args) => {
    await writer._persistOperationIndexedDB({ type: 'saveStory', payload: save('remote-auto', 10) });
    await writer._persistOperationIndexedDB({ type: 'deleteSlot', id: 'deleted' });
    return replace(...args);
  };
  await reader._migrateLegacyToIndexedDB();
  assert.equal(db.records.get(writer.autosaveRecordId).payload.label, 'remote-auto', 'migration must not overwrite a concurrently updated autosave');
  assert.equal(db.records.has('deleted'), false, 'migration must not resurrect a concurrently deleted slot');
  assert.ok(db.records.has('legacy'));
}
async function fallbackConflict(conflict) {
  const db = new Database(), browser = new BrowserStorage();
  const owner = tab(db, empty(), browser), remote = tab(db, empty(), browser);
  db.records.set(owner.autosaveRecordId, owner._record('autosave', save('old-auto', 1)));
  db.records.set('old', owner._record('slot', add('old', 1).payload));
  await owner._loadIndexedDBCache();
  await owner._persistOperationIndexedDB({ type: 'saveStory', payload: save('own-durable', 2) });
  if (conflict) {
    await remote._persistOperationIndexedDB({ type: 'saveStory', payload: save('remote-auto', 20) });
    await remote._persistOperationIndexedDB(add('remote-slot', 20));
    // A later owner write must not hide an earlier foreign revision increment.
    await owner._persistOperationIndexedDB(add('own-slot', 3));
  }
  owner._cache = empty(); // intentional local deletion after the database fails
  owner._degradeToLocalStorage(Error('injected failure'));
  await owner.flush();
  const next = tab(db, empty(), browser);
  await next._migrateLegacyToIndexedDB();
  if (conflict) {
    assert.equal(db.records.get(owner.autosaveRecordId).payload.label, 'remote-auto');
    assert.ok(db.records.has('remote-slot'), 'stale fallback cannot delete a remote addition');
  } else {
    assert.equal(db.records.has(owner.autosaveRecordId), false, 'matching revision preserves intentional autosave deletion');
    assert.equal(db.records.has('old'), false, 'matching revision preserves intentional slot deletion');
  }
}
async function cleanupRace() {
  const db = new Database(), browser = new BrowserStorage(), reader = tab(db, empty(), browser);
  browser.setItem(reader.prefix + reader.slotsKey, JSON.stringify([add('legacy', 1).payload]));
  const replace = reader._replaceDatabaseStories.bind(reader);
  reader._replaceDatabaseStories = async (...args) => {
    await replace(...args);
    browser.setItem(reader.prefix + reader.slotsKey, JSON.stringify([add('new-backup', 2).payload]));
  };
  await reader._migrateLegacyToIndexedDB();
  assert.equal(reader._cleanupLegacyStoryStorage(), false, 'cleanup must retain a changed backup');
  assert.equal(JSON.parse(browser.getItem(reader.prefix + reader.slotsKey))[0].id, 'new-backup');
}
async function main() {
  await migrationRace();
  await fallbackConflict(false);
  await fallbackConflict(true);
  await cleanupRace();
  console.log('Storage migration concurrency: atomic migration, matching/conflicting revisions and changed-backup cleanup passed');
}
const watchdog = setTimeout(() => { console.error('Migration concurrency test stalled'); process.exitCode = 1; }, 5000);
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => clearTimeout(watchdog));
