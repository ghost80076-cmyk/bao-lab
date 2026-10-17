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
