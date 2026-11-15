const { test, expect } = require('@playwright/test');

async function closeFallbackWriter(owner, observer) {
  await owner.close();
  // Closing a WebKit page can finish before its native lock release reaches
  // the observer process. Wait for that lifecycle signal, never a time delay.
  await expect.poll(() => observer.evaluate(async () =>
    (await navigator.locks.query()).held.some(lock => lock.name === Storage.fallbackWriterLockName)
  )).toBe(false);
}

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
  // Reopen after the fallback owner closes; a cached observer cannot take over.
  await closeFallbackWriter(page, fresh);
  await fresh.reload();
  await fresh.evaluate(() => Storage.ready());
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

test('fallback tabs reject a stale second writer and recover a whole snapshot atomically', async ({ context, page }) => {
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
    try { await Storage.flush(); return { ok: true }; }
    catch (error) { return { ok: false, code: error.code, message: error.message }; }
  }, id);
  const ids = tab => tab.evaluate(() => Storage._readFallbackSnapshot().slots.map(slot => slot.id).sort());
  const results = await Promise.all([add(page, 'left'), add(other, 'right')]);
  expect(results[0]).toEqual({ ok: true });
  expect(results[1]).toMatchObject({ ok: false, code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  expect(results[1].message).toContain('本頁未儲存');
  const exported = await other.evaluate(() => Storage.getSlot('right'));
  expect(exported.id).toBe('right');
  const fresh = await context.newPage();
  await fresh.goto('/storage-fallback-harness'); await fresh.evaluate(() => Storage.ready());
  expect(await ids(fresh)).toEqual(['left']);
  // Export before closing. Reopening is mandatory, even after the owner closes.
  await closeFallbackWriter(page, other);
  expect(await add(other, 'still-blocked')).toMatchObject({ ok: false, code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  await other.reload(); await other.evaluate(() => Storage.ready());
  await other.evaluate(async payload => {
    Storage._commitOperation({ type: 'saveSlot', payload }); await Storage.flush();
  }, exported);
  expect(await ids(other)).toEqual(['left', 'right']);
  // The stale observer still remembers left; it cannot resurrect a deletion.
  await other.evaluate(async () => { Storage.deleteSlot('left'); await Storage.flush(); });
  expect(await add(fresh, 'third')).toMatchObject({ ok: false, code: 'BAO_FALLBACK_WRITE_UNSAFE' });
  expect(await add(other, 'third')).toEqual({ ok: true });
  expect(await ids(other)).toEqual(['right', 'third']);
  const prior = await other.evaluate(() => localStorage.getItem(Storage.fallbackSnapshotKey));
  await other.evaluate(() => {
    const prototype = Object.getPrototypeOf(localStorage);
    window.restoreStorageWrite = prototype.setItem;
    prototype.setItem = function(key, value) {
      if (key === Storage.fallbackSnapshotKey) throw new DOMException('injected quota failure', 'QuotaExceededError');
      return window.restoreStorageWrite.call(this, key, value);
    };
  });
  expect(await add(other, 'quota-failed')).toMatchObject({ ok: false });
  expect(await other.evaluate(() => localStorage.getItem(Storage.fallbackSnapshotKey))).toBe(prior);
  expect(await other.evaluate(() => Storage.getSlot('quota-failed')?.id)).toBe('quota-failed');
  await other.evaluate(() => { Object.getPrototypeOf(localStorage).setItem = window.restoreStorageWrite; });
  expect(await add(other, 'after-quota')).toEqual({ ok: true });
  // A later successful save also retries retained earlier operations.
  expect(await ids(other)).toEqual(['after-quota', 'quota-failed', 'right', 'third']);
  await other.evaluate(async () => {
    Storage._commitOperation({ type: 'saveStory', payload: {
      characterId: 'hero', savedAt: new Date().toISOString(), config: {}, chat: { messages: [{ role: 'user', content: 'saved' }] }
    } });
    await Storage.flush();
    window.App = { saveStory() { return false; } };
  });
  await other.addScriptTag({ url: '/js/storage-write-guard.js' });
  expect(await other.evaluate(() => BAOStorageWriteGuard.verify(Storage.loadStory()).ok)).toBe(true);
  await other.reload(); await other.evaluate(() => Storage.ready());
  expect(await other.evaluate(() => Storage.listSlots().map(slot => slot.id).sort())).toEqual(['after-quota', 'quota-failed', 'right', 'third']);
  expect(await other.evaluate(() => Storage.loadStory().chat.messages[0].content)).toBe('saved');
  await fresh.close();
  const reopened = await context.newPage();
  await reopened.goto('/storage-fallback-harness'); await reopened.evaluate(() => Storage.ready());
  expect(await ids(reopened)).toEqual(['after-quota', 'quota-failed', 'right', 'third']);
});

// Record the actual return values used by persistence, without extra reads
// which can themselves refresh WebKit's localStorage cache and hide the race.
async function traceFallback(context) {
  await context.addInitScript(() => {
    window.storageTrace = [];
    const record = (phase, snapshot, lock) => storageTrace.push({
      tab: location.hash, phase, time: performance.timeOrigin + performance.now(), lock,
      revision: snapshot?.revision ?? null, owner: snapshot?.owner ?? null,
      slots: snapshot?.slots?.map(slot => slot.id) || []
    });
    window.recordStorageTrace = record;
    const request = navigator.locks.request.bind(navigator.locks);
    navigator.locks.request = (name, options, action) => {
      record('request', null, name);
      return request(name, options, async lock => {
        record(lock ? 'acquire' : 'denied', null, name);
        try { return await action(lock); }
        finally { if (lock) record('release', null, name); }
      });
    };
    const set = Object.getPrototypeOf(localStorage).setItem;
    Object.getPrototypeOf(localStorage).setItem = function(key, value) {
      const result = set.call(this, key, value);
      if (key === 'bao-lab:story-fallback-snapshot-v1') record('write', JSON.parse(value));
      return result;
    };
    addEventListener('storage', event => {
      if (event.key === 'bao-lab:story-fallback-snapshot-v1') record('storage-event', event.newValue ? JSON.parse(event.newValue) : null);
    });
  });
  await context.route('**/gated-fallback*', route => route.fulfill({ contentType: 'text/html', body: `
    <script>Object.defineProperty(window,'indexedDB',{value:undefined})</script><script src="/js/storage.js"></script>
    <script>const read=Storage._readFallbackSnapshot;Storage._readFallbackSnapshot=function(){const value=read.call(this);recordStorageTrace('read',value);return value}</script>` }));
}
for (let trial = 1; trial <= 8; trial++) {
  test(`fallback lease controlled contention and reopen stress ${trial}/8`, async ({context, page}, info) => {
    await traceFallback(context);
    const other = await context.newPage();
    for (const [tab, id] of [[page, 'left'], [other, 'right']]) {
      await tab.goto('/gated-fallback#' + id); await tab.evaluate(() => Storage.ready());
    }
    // Hold the first actual story lock; wait for the second native request,
    // then release explicitly. There are no timing sleeps or eventual retries.
    await page.evaluate(() => {
      const original = Storage._withStoryLock.bind(Storage);
      window.hold = new Promise(resolve => window.release = resolve);
      Storage._withStoryLock = action => original(async () => { window.entered = true; await hold; return action(); });
      Storage._commitOperation({ type: 'saveSlot', payload: { id: 'left', characterId: 'fixture', config: {}, chat: { messages: [] } } });
    });
    await page.waitForFunction(() => window.entered);
    await other.evaluate(() => Storage._commitOperation({ type: 'saveSlot', payload: { id: 'right', characterId: 'fixture', config: {}, chat: { messages: [] } } }));
    await other.waitForFunction(() => storageTrace.some(event => event.phase === 'request' && event.lock === Storage.storyLockName));
    const waiting = await other.evaluate(async () => ({ locks: await navigator.locks.query(), events: storageTrace }));
    expect(waiting.locks.held.filter(lock => lock.name === 'bao-lab:story-storage-v1')).toHaveLength(1);
    expect(waiting.locks.pending.filter(lock => lock.name === 'bao-lab:story-storage-v1')).toHaveLength(1);
    await page.evaluate(() => release());
    const outcomes = await Promise.all([page, other].map(tab => tab.evaluate(async () => {
      try { await Storage.flush(); return { saved: true }; }
      catch (error) { return { saved: false, code: error.code }; }
    })));
    expect(outcomes).toEqual([{ saved: true }, { saved: false, code: 'BAO_FALLBACK_WRITE_UNSAFE' }]);
    const exported = await other.evaluate(() => Storage.getSlot('right'));
    const readback = await Promise.all([page, other].map(tab => tab.evaluate(() => Storage._readFallbackSnapshot()?.slots.map(slot => slot.id) || [])));
    const traces = (await Promise.all([page, other].map(tab => tab.evaluate(() => storageTrace)))).flat().sort((a,b) => a.time-b.time);
    expect(traces.filter(event => event.phase === 'write').map(event => event.tab)).toEqual(['#left']);
    const fresh = await context.newPage(); await fresh.goto('/gated-fallback#fresh'); await fresh.evaluate(() => Storage.ready());
    const freshIds = await fresh.evaluate(() => Storage.listSlots().map(slot => slot.id).sort());
    expect(freshIds).toEqual(['left']);
    await other.reload(); await other.evaluate(() => Storage.ready());
    const reloadIds = await other.evaluate(() => Storage.listSlots().map(slot => slot.id).sort());
    expect(reloadIds).toEqual(['left']);
    await closeFallbackWriter(page, other);
    // A blocked cached document never automatically becomes a writer.
    expect(await other.evaluate(() => Storage.status().fallbackWriter)).toBe('blocked');
    await other.reload(); await other.evaluate(() => Storage.ready());
    await other.evaluate(async payload => { Storage._commitOperation({ type: 'saveSlot', payload }); await Storage.flush(); }, exported);
    await other.reload(); await other.evaluate(() => Storage.ready());
    const recovered = await other.evaluate(() => Storage.listSlots().map(slot => slot.id).sort());
    expect(recovered).toEqual(['left', 'right']);
    const evidence = { browser: info.project.name, trial, outcomes, waiting, trace: traces, readback, freshIds, reloadIds, recovered };
    console.log('FALLBACK_LEASE_EVIDENCE ' + JSON.stringify(evidence));
    await info.attach('fallback-lock-trace', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
  });
}

test('unsafe fallback has an export path and no success notification at 320px', async ({context, page}) => {
  await context.route('**/fallback-warning', route => route.fulfill({contentType:'text/html',body:`
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><section id="chat-view"><div class="composer"><textarea id="input"></textarea></div></section>
    <script>Object.defineProperty(window,'indexedDB',{value:undefined})</script><script src="/js/storage.js"></script>`}));
  await page.goto('/fallback-warning'); await page.evaluate(() => Storage.ready());
  const other = await context.newPage(); await other.setViewportSize({width:320,height:568});
  await other.goto('/fallback-warning'); await other.evaluate(() => Storage.ready());
  await other.evaluate(() => {
    window.GameState = { current: {} }; window.Chat = { messages: [{role:'user',content:'recoverable fixture'}] };
    window.App = { activeCharacter: { id:'fixture' }, config: { api: { key:'fixture-secret-must-not-export' } }, saveStory(){return Storage.saveStory()} };
  });
  await other.addScriptTag({url:'/js/storage-write-guard.js'});
  await other.locator('#input').focus();
  expect(await other.evaluate(async () => { App.saveStory(true); return BAOStorageWriteGuard.whenIdle(); })).toBe(false);
  const warning = other.locator('#bao-storage-write-warning');
  await expect(warning).toHaveAttribute('role','alert');
  await expect(warning).toContainText('本頁未儲存');
  await expect(other.locator('#input')).toBeFocused();
  await expect(warning.locator('[data-retry-story-save]')).toHaveCount(0);
  const button = warning.getByRole('button',{name:'匯出本頁故事'});
  await expect(button).toBeVisible();
  const download = other.waitForEvent('download'); await button.click();
  const file = await (await download).path();
  const text = require('node:fs').readFileSync(file,'utf8');
  expect(text).not.toContain('fixture-secret');
  expect(JSON.parse(text).chat.messages[0].content).toBe('recoverable fixture');
  expect(await other.evaluate(() => { const event = new Event('beforeunload', {cancelable:true}); window.dispatchEvent(event); return event.defaultPrevented; })).toBe(true);
  expect(await page.evaluate(() => Storage._readFallbackSnapshot())).toBe(null);
});

test('fallback without Web Locks refuses writing while IndexedDB remains usable', async ({context, page}) => {
  await context.addInitScript(() => Object.defineProperty(navigator,'locks',{value:undefined}));
  await context.route('**/no-locks*', route => route.fulfill({contentType:'text/html',body:
    (route.request().url().includes('fallback') ? '<script>Object.defineProperty(window,"indexedDB",{value:undefined})</script>' : '') + '<script src="/js/storage.js"></script>'}));
  for (const mode of ['fallback','indexeddb']) {
    await page.goto('/no-locks?' + mode); await page.evaluate(() => Storage.ready());
    const result = await page.evaluate(async () => {
      Storage._commitOperation({type:'saveSlot',payload:{id:'safe',characterId:'fixture',config:{},chat:{messages:[]}}});
      try { await Storage.flush(); return {ok:true, mode:Storage.status().mode}; }
      catch(error) { return {ok:false,code:error.code,retained:Storage.getSlot('safe')?.id,snapshot:localStorage.getItem(Storage.fallbackSnapshotKey)}; }
    });
    if (mode === 'fallback') expect(result).toEqual({ok:false,code:'BAO_FALLBACK_WRITE_UNSAFE',retained:'safe',snapshot:null});
    else expect(result).toEqual({ok:true,mode:'indexedDB'});
  }
});

test('secondary IndexedDB page retains the live fallback owner backup until safe reopening', async ({context, page}) => {
  await context.route('**/migration-owner*', route => route.fulfill({contentType:'text/html',body:
    (route.request().url().includes('fallback') ? '<script>Object.defineProperty(window,"indexedDB",{value:undefined})</script>' : '') + '<script src="/js/storage.js"></script>'}));
  await page.goto('/migration-owner?fallback'); await page.evaluate(() => Storage.ready());
  await page.evaluate(async () => {
    Storage._commitOperation({type:'saveSlot',payload:{id:'fallback-confirmed',characterId:'fixture',config:{},chat:{messages:[]}}});
    await Storage.flush();
  });
  const other = await context.newPage(); await other.goto('/migration-owner?indexeddb'); await other.evaluate(() => Storage.ready());
  expect(await other.evaluate(() => Storage.status().mode)).toBe('indexedDB');
  expect(await page.evaluate(() => Storage._readFallbackSnapshot().slots.map(slot => slot.id))).toEqual(['fallback-confirmed']);
  // Normal IDB record writes still work while this page is not the lease owner.
  await other.evaluate(async () => {
    Storage._commitOperation({type:'saveSlot',payload:{id:'idb-confirmed',characterId:'fixture',config:{},chat:{messages:[]}}}); await Storage.flush();
  });
  await closeFallbackWriter(page, other); await other.reload(); await other.evaluate(() => Storage.ready());
  expect(await other.evaluate(() => Storage.listSlots().map(slot => slot.id).sort())).toEqual(['fallback-confirmed','idb-confirmed']);
  expect(await other.evaluate(() => localStorage.getItem(Storage.fallbackSnapshotKey))).toBe(null);
});

test('a retired document cannot reuse its fallback lease after pagehide', async ({context, page}) => {
  await context.route('**/retired-fallback', route => route.fulfill({contentType:'text/html',body:
    '<script>Object.defineProperty(window,"indexedDB",{value:undefined})</script><script src="/js/storage.js"></script>'}));
  await page.goto('/retired-fallback'); await page.evaluate(() => Storage.ready());
  const result = await page.evaluate(async () => {
    window.dispatchEvent(new Event('pagehide'));
    Storage._commitOperation({type:'saveSlot',payload:{id:'retained',characterId:'fixture',config:{},chat:{messages:[]}}});
    try { await Storage.flush(); return 'unsafe success'; }
    catch(error) { return {code:error.code,retained:Storage.getSlot('retained')?.id,raw:localStorage.getItem(Storage.fallbackSnapshotKey)}; }
  });
  expect(result).toEqual({code:'BAO_FALLBACK_WRITE_UNSAFE',retained:'retained',raw:null});
});

test('simulated BFCache restoration keeps the old fallback writer retired', async ({context, page}) => {
  // Synthetic lifecycle event injection validates the safety invariant only.
  // It does not claim that the browser actually placed a page in BFCache.
  await context.route('**/bfcache-fallback', route => route.fulfill({contentType:'text/html',body:
    '<script>Object.defineProperty(window,"indexedDB",{value:undefined})</script><script src="/js/storage.js"></script>'}));
  await page.goto('/bfcache-fallback');
  await page.evaluate(() => Storage.ready());
  const result = await page.evaluate(async () => {
    const payload = id => ({id,characterId:'fixture',config:{},chat:{messages:[]}});
    Storage._commitOperation({type:'saveSlot',payload:payload('before-bfcache')});
    await Storage.flush();
    const before = localStorage.getItem(Storage.fallbackSnapshotKey);
    const hide = new Event('pagehide');
    Object.defineProperty(hide, 'persisted', {value:true});
    window.dispatchEvent(hide);
    const show = new Event('pageshow');
    Object.defineProperty(show, 'persisted', {value:true});
    window.dispatchEvent(show);
    Storage._commitOperation({type:'saveSlot',payload:payload('stale-after-return')});
    let code = '';
    try { await Storage.flush(); } catch (error) { code = error.code || ''; }
    return {
      code, retired: Storage._fallbackLeaseRetired,
      cache: Storage.getSlot('stale-after-return')?.id,
      unchanged: localStorage.getItem(Storage.fallbackSnapshotKey) === before,
      disk: Storage._readFallbackSnapshot()?.slots.map(slot => slot.id)
    };
  });
  expect(result).toEqual({
    code:'BAO_FALLBACK_WRITE_UNSAFE', retired:true,
    cache:'stale-after-return', unchanged:true, disk:['before-bfcache']
  });
});
