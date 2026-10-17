const { test, expect } = require('@playwright/test');

// Keep app autosave hooks out of this harness; both tabs still use the actual
// Storage module and the browser's shared IndexedDB transaction scheduler.
test('shared IndexedDB keeps unrelated slots from stale tabs and prunes atomically', async ({ context, page }) => {
  await context.route('**/storage-test-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script src="/js/storage.js"></script>'
  }));
  const other = await context.newPage();
  await page.goto('/storage-test-harness');
  await page.evaluate(() => Storage.ready());
  await other.goto('/storage-test-harness');
  await other.evaluate(() => Storage.ready());
  const add = (tab, id, time) => tab.evaluate(async ({ id, time }) => {
    Storage._commitOperation({ type: 'saveSlot', payload: {
      id, label: id, characterId: 'hero', savedAt: new Date(1760000000000 + time * 1000).toISOString(),
      config: {}, chat: { messages: [] }
    } });
    await Storage.flush();
  }, { id, time });
  const ids = () => page.evaluate(async () => (await Storage._getAllRecords())
    .filter(record => record.kind === 'slot').map(record => record.id).sort());
  await Promise.all([add(page, 'left', 1), add(other, 'right', 2)]);
  expect(await ids()).toEqual(['left', 'right']);
  await add(page, 'third', 3);
  expect(await ids()).toEqual(['left', 'right', 'third']);
  // The other tab still remembers right after this tab deletes it.
  await page.evaluate(async () => { Storage.deleteSlot('right'); await Storage.flush(); });
  await add(other, 'fourth', 4);
  expect(await ids()).toEqual(['fourth', 'left', 'third']);
  await other.evaluate(async () => { Storage.deleteSlot('missing'); await Storage.flush(); });
  expect(await ids()).toEqual(['fourth', 'left', 'third']);
  // A synchronous action error must roll back previously queued IDB requests.
  expect(await page.evaluate(async () => {
    try { await Storage._transaction('readwrite', store => { store.delete('left'); throw Error('rollback-probe'); }); }
    catch (error) { return error.message; }
  })).toBe('rollback-probe');
  expect(await ids()).toContain('left');
  for (let i = 5; i < 21; i++) await add(page, 'old-' + i, i);
  await Promise.all([add(page, 'new-left', 30), add(other, 'new-right', 31)]);
  const finalIds = await ids();
  expect(finalIds).toHaveLength(20);
  expect(finalIds).toContain('new-left');
  expect(finalIds).toContain('new-right');
  expect(finalIds).not.toContain('left');
  await page.reload();
  await page.evaluate(() => Storage.ready());
  expect(await page.evaluate(() => Storage.listSlots().map(slot => slot.id).sort())).toEqual(finalIds);
});

test('migration and stale fallback preserve another tab\'s committed stories', async ({ context, page }) => {
  await context.route('**/storage-test-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script src="/js/storage.js"></script>'
  }));
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto('/storage-test-harness');
    await tab.evaluate(() => Storage.ready());
  }
  await page.evaluate(async () => {
    const save = (label, time) => ({ label, characterId: 'hero', savedAt: new Date(time).toISOString(), config: {}, chat: { messages: [] } });
    Storage._commitOperation({ type: 'saveStory', payload: save('old', 1000) });
    Storage._commitOperation({ type: 'saveSlot', payload: { ...save('deleted', 1000), id: 'deleted' } });
    await Storage.flush();
    localStorage.setItem(Storage.prefix + Storage.slotsKey, JSON.stringify([{ ...save('legacy', 2000), id: 'legacy' }]));
  });
  await other.evaluate(() => {
    const replace = Storage._replaceDatabaseStories.bind(Storage);
    Storage._replaceDatabaseStories = async (...args) => {
      window.migrationPaused = true;
      await new Promise(resolve => { window.releaseMigration = resolve; });
      return replace(...args);
    };
  });
  const migrating = other.evaluate(() => Storage._migrateLegacyToIndexedDB());
  await expect.poll(() => other.evaluate(() => Boolean(window.migrationPaused))).toBe(true);
  await page.evaluate(async () => {
    Storage._commitOperation({ type: 'saveStory', payload: { label: 'remote-new', characterId: 'hero', savedAt: new Date(10000).toISOString(), config: {}, chat: { messages: [] } } });
    Storage.deleteSlot('deleted');
    await Storage.flush();
  });
  await other.evaluate(() => window.releaseMigration());
  await migrating;
  // Use a fresh tab for the next migration, avoiding the deliberate pause hook.
  const fresh = await context.newPage();
  await fresh.goto('/storage-test-harness');
  await fresh.evaluate(() => Storage.ready());
  const result = () => fresh.evaluate(async () => {
    const records = await Storage._getAllRecords();
    return { auto: records.find(record => record.kind === 'autosave')?.payload.label,
      slots: records.filter(record => record.kind === 'slot').map(record => record.id).sort() };
  });
  expect(await result()).toEqual({ auto: 'remote-new', slots: ['legacy'] });
  await page.evaluate(() => Storage._loadIndexedDBCache());
  await fresh.evaluate(async () => {
    Storage._commitOperation({ type: 'saveSlot', payload: { id: 'remote-slot', label: 'remote-slot', characterId: 'hero', savedAt: new Date(20000).toISOString(), config: {}, chat: { messages: [] } } });
    await Storage.flush();
  });
  await page.evaluate(async () => {
    Storage._cache = { autosave: null, slots: [] };
    Storage._degradeToLocalStorage(Error('injected storage failure'));
    await Storage.flush();
  });
  await fresh.evaluate(() => Storage._withStoryLock(async () => {
    await Storage._migrateLegacyToIndexedDB();
    Storage._cleanupLegacyStoryStorage();
  }));
  expect(await result()).toEqual({ auto: 'remote-new', slots: ['legacy', 'remote-slot'] });
  // Without a foreign write, a new complete fallback still applies deletions.
  await fresh.evaluate(async () => {
    await Storage._loadIndexedDBCache();
    Storage._cache = { autosave: null, slots: [] };
    Storage._degradeToLocalStorage(Error('injected storage failure'));
    await Storage.flush();
    Storage._db = await Storage._openDatabase();
    await Storage._migrateLegacyToIndexedDB();
  });
  expect(await result()).toEqual({ auto: undefined, slots: [] });
});

test('fallback tabs rebase under Web Locks and commit a whole snapshot atomically', async ({ context, page }) => {
  await context.route('**/storage-fallback-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script>Object.defineProperty(window,"indexedDB",{value:undefined});</script><script src="/js/storage.js"></script>'
  }));
  const other = await context.newPage();
  for (const tab of [page, other]) {
    await tab.goto('/storage-fallback-harness');
    await tab.evaluate(() => Storage.ready());
  }
  expect(await page.evaluate(() => Boolean(navigator.locks?.request))).toBe(true);
  const add = (tab, id) => tab.evaluate(async id => {
    Storage._commitOperation({ type: 'saveSlot', payload: {
      id, label: id, characterId: 'hero', savedAt: new Date().toISOString(), config: {}, chat: { messages: [] }
    } });
    await Storage.flush();
  }, id);
  const ids = () => page.evaluate(() => Storage._readFallbackSnapshot().slots.map(slot => slot.id).sort());
  await Promise.all([add(page, 'left'), add(other, 'right')]);
  expect(await ids()).toEqual(['left', 'right']);
  await other.reload(); await other.evaluate(() => Storage.ready());
  await page.evaluate(async () => { Storage.deleteSlot('left'); await Storage.flush(); });
  await add(other, 'third');
  expect(await ids()).toEqual(['right', 'third']);
  const prior = await page.evaluate(() => localStorage.getItem(Storage.fallbackSnapshotKey));
  await page.evaluate(() => {
    const prototype = Object.getPrototypeOf(localStorage);
    window.restoreStorageWrite = prototype.setItem;
    prototype.setItem = function(key, value) {
      if (key === Storage.fallbackSnapshotKey) throw new DOMException('injected quota failure', 'QuotaExceededError');
      return window.restoreStorageWrite.call(this, key, value);
    };
  });
  await add(page, 'quota-failed');
  expect(await page.evaluate(() => localStorage.getItem(Storage.fallbackSnapshotKey))).toBe(prior);
  await add(other, 'after-quota');
  expect(await ids()).toEqual(['after-quota', 'right', 'third']);
  await page.evaluate(() => { Object.getPrototypeOf(localStorage).setItem = window.restoreStorageWrite; });
  await other.evaluate(async () => {
    Storage._commitOperation({ type: 'saveStory', payload: {
      characterId: 'hero', savedAt: new Date().toISOString(), config: {}, chat: { messages: [{ role: 'user', content: 'saved' }] }
    } });
    await Storage.flush();
    window.App = { saveStory() { return false; } };
  });
  await other.addScriptTag({ url: '/js/storage-write-guard.js' });
  expect(await other.evaluate(() => BAOStorageWriteGuard.verify(Storage.loadStory()).ok)).toBe(true);
  await page.reload(); await page.evaluate(() => Storage.ready());
  expect(await page.evaluate(() => Storage.listSlots().map(slot => slot.id).sort())).toEqual(['after-quota', 'right', 'third']);
  expect(await page.evaluate(() => Storage.loadStory().chat.messages[0].content)).toBe('saved');
});
