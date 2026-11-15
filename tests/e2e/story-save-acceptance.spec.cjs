const { test, expect } = require('@playwright/test');

async function openStory(page) {
  // Local preview only. Every provider call is forbidden in this fixture.
  await page.route(/generativelanguage\.googleapis\.com|api\.openai\.com|openrouter\.ai/, route => {
    throw new Error('Unexpected provider call: ' + route.request().url());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === 'ready'
    && BAOExtensionLoadHealth.snapshot().world === 'ready' && Storage.status().ready);
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.waitForFunction(() => window.BAOStoryRollback && window.BAOStoryBranches);
  await page.evaluate(async () => {
    App.saveStory(false);
    await Storage.flush();
    await BAOStoryLibrary.flush(BAOStoryLibrary.refs().storyId);
    await window.BAOStorageWriteGuard?.whenIdle?.();
  });
}

const snapshot = page => page.evaluate(() => ({
  messages: Chat.messages.map(m => m.content), summary: Chat.summary,
  location: GameState.current.location, chapter: BAOStoryLibrary.refs().chapterId
}));

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 },
  { width: 390, height: 420 }, { width: 1440, height: 900 }]) {
  test(`pending exit / failed storage / local-only retry / reload (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page);
    await page.locator('#user-input').fill('尚未送出的草稿');
    await page.locator('#user-input').focus();
    const prior = await page.evaluate(async () => {
      window.__saveOriginals = { idb: Storage._persistOperationIndexedDB, fallback: Storage._persistFallbackSnapshot,
        library: BAOStoryLibrary.persist };
      const before = JSON.stringify(await Storage._getAllRecords());
      Chat.add('user', '新回合'); Chat.add('assistant', '已產生且不能丟失的正文');
      Chat.summary = '已完成整理但尚未保存的摘要';
      GameState.current.location = '安全測試地點';
      const gate = new Promise(resolve => { window.__releaseWrite = resolve; });
      Storage._persistOperationIndexedDB = async () => { window.__writeEntered = true; await gate; throw new Error('fixture IDB denied'); };
      Storage._persistFallbackSnapshot = () => { throw new DOMException('fixture full', 'QuotaExceededError'); };
      BAOStoryLibrary.persist = async () => { await gate; throw new Error('fixture library denied'); };
      window.__exitDone = false;
      window.__exitTask = Promise.resolve(App.exitChat()).then(result => { window.__exitDone = true; return result; });
      return before;
    });
    await page.waitForFunction(() => window.__writeEntered);
    expect(await page.evaluate(() => window.__exitDone)).toBe(false);
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    expect(await page.evaluate(() => {
      const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented;
    })).toBe(true);
    await page.evaluate(() => window.__releaseWrite());
    expect(await page.evaluate(() => window.__exitTask)).toBe(false);
    await expect(page.locator('#bao-storage-write-warning')).toContainText('尚未成功');
    await expect(page.locator('#user-input')).toHaveValue('尚未送出的草稿');
    await expect(page.locator('#user-input')).toBeFocused();
    await test.info().attach('save-failure-layout', { body: await page.screenshot(), contentType: 'image/png' });
    expect(await page.evaluate(() => BAOStoryLibrary._writeFailures.size)).toBeGreaterThan(0);
    // Actual IDB still contains the previous valid autosave; failed writes did not replace it.
    expect(await page.evaluate(async () => {
      const db = await Storage._openDatabase();
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(Storage.dbStore, 'readonly'), request = tx.objectStore(Storage.dbStore).getAll();
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      }); db.close(); return JSON.stringify(records);
    })).toBe(prior);
    const beforeRetry = await snapshot(page);
    await page.evaluate(() => {
      Storage._persistOperationIndexedDB = window.__saveOriginals.idb;
      Storage._persistFallbackSnapshot = window.__saveOriginals.fallback;
      BAOStoryLibrary.persist = window.__saveOriginals.library;
    });
    const retry = page.locator('[data-retry-story-save]');
    await retry.scrollIntoViewIfNeeded();
    const geometry = await retry.evaluate(button => {
      const box = button.getBoundingClientRect(), hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { width: box.width, height: box.height, hit: hit === button || button.contains(hit) };
    });
    expect(geometry.width).toBeGreaterThanOrEqual(44); expect(geometry.height).toBeGreaterThanOrEqual(44); expect(geometry.hit).toBe(true);
    await retry.click();
    expect(await page.evaluate(() => BAOStorageWriteGuard.whenIdle())).toBe(true);
    await expect(page.locator('#bao-storage-write-warning')).toHaveCount(0);
    expect(await snapshot(page)).toEqual(beforeRetry);
    await page.reload();
    await page.waitForFunction(() => Storage.status().ready && window.BAOStoryLibrary);
    const reloaded = await page.evaluate(async () => {
      const save = Storage.loadStory(), refs = save._library;
      const library = await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId);
      const compact = value => ({ messages: value.chat.messages.map(m => m.content), summary: value.chat.summary,
        location: value.state.location, chapter: value._library.chapterId });
      return { auto: compact(save), library: compact(library) };
    });
    expect(reloaded).toEqual({ auto: beforeRetry, library: beforeRetry });
  });

  test(`destination branch save failure restores source; retry remains reload-safe (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page);
    const ids = await page.evaluate(async () => {
      Chat.messages = Chat.ensureMessageIds([{ role: 'user', content: '歷史選擇' }, { role: 'assistant', content: '歷史回覆' }]);
      Chat.summary = '歷史摘要'; GameState.current.location = '歷史地點';
      App.saveStory(false); await Storage.flush(); await BAOStoryLibrary.flush(BAOStoryLibrary.refs().storyId);
      const source = BAOStoryLibrary.refs();
      const branch = await BAOStoryLibrary.createBranch(Chat.messages[1].id, '驗收分支');
      BAOStoryLibrary.adoptRefs({ _library: source });
      Chat.add('user', '來源繼續'); Chat.add('assistant', '來源最新回覆');
      Chat.summary = '來源最新摘要'; GameState.current.location = '來源最新地點';
      App.saveStory(false); await Storage.flush(); await BAOStoryLibrary.flush(source.storyId);
      await window.BAOStorageWriteGuard?.whenIdle?.();
      return { source, branch: branch._library };
    });
    const original = await snapshot(page);
    const error = await page.evaluate(async ids => {
      const persist = BAOStoryLibrary.persist;
      BAOStoryLibrary.persist = async function(payload) {
        if (payload._library.chapterId === ids.branch.chapterId) throw new Error('fixture destination denied');
        return persist.call(this, payload);
      };
      try { await BAOStoryBranches.restore(ids.branch.storyId, ids.branch.chapterId); return ''; }
      catch (error) { return error.message; }
      finally { BAOStoryLibrary.persist = persist; }
    }, ids);
    expect(error).toContain('儲存');
    expect(await snapshot(page)).toEqual(original);
    expect(await page.evaluate(() => Storage.loadStory()._library.chapterId)).toBe(ids.source.chapterId);
    // A failed destination does not change or discard the successfully saved source.
    expect(await page.evaluate(async ids => (await BAOStoryLibrary.reconstruct(ids.source.storyId, ids.source.chapterId)).chat.summary, ids)).toBe(original.summary);
    expect(await page.evaluate(ids => BAOStoryBranches.restore(ids.branch.storyId, ids.branch.chapterId), ids)).toBe(true);
    await page.reload();
    await page.waitForFunction(() => Storage.status().ready);
    expect(await page.evaluate(() => ({ summary: Storage.loadStory().chat.summary, chapter: Storage.loadStory()._library.chapterId })))
      .toEqual({ summary: '歷史摘要', chapter: ids.branch.chapterId });
  });

  test(`automatic memory stops after an uncommitted batch; storage retry does not call a model (${viewport.width}x${viewport.height})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openStory(page);
    const result = await page.evaluate(async () => {
      App.config.demoMode = false;
      App.config.api = { type: 'custom', protocol: 'openai', key: 'fixture', model: 'fixture', baseUrl: 'https://fixture.invalid/v1' };
      App.config.memory = { mode: 'smart', maxRounds: 20, summaryInterval: 2, episodicRecall: false };
      Chat.reset();
      for (let i = 0; i < 91; i++) { Chat.add('user', '行動' + i + '文'.repeat(600)); Chat.add('assistant', '已確認結果' + i + '文'.repeat(600)); }
      App.saveStory(false); await BAOStorageWriteGuard.whenIdle();
      window.__memoryCalls = 0;
      API.send = async () => { window.__memoryCalls++; return { text: JSON.stringify({ events: ['已確認的分批劇情摘要'] }), finishReason: 'STOP' }; };
      window.__memoryPersist = BAOStoryLibrary.persist;
      BAOStoryLibrary.persist = async () => { throw new Error('fixture memory save failure'); };
      BAOMemoryWorkbench.open();
      await BAOMemoryWorkbench.retryAutoMemory();
      await BAOStorageWriteGuard.whenIdle();
      return { calls: window.__memoryCalls, cursor: Chat.summarizedUntil, summary: Chat.summary,
        messages: Chat.messages.length, health: Chat.memoryHealth };
    });
    expect(result.calls).toBe(1);
    expect(result.cursor).toBeGreaterThan(0); expect(result.cursor).toBeLessThan(174);
    expect(result.summary).toContain('已確認的分批劇情摘要');
    expect(result.messages).toBe(182);
    expect(result.health.message).toContain('尚未完成儲存');
    await expect(page.locator('.memory-health-card')).toContainText('關閉記憶工作台');
    await page.locator('.memory-desk-close').click();
    await expect(page.locator('[data-retry-story-save]')).toBeVisible();
    await page.evaluate(() => { BAOStoryLibrary.persist = window.__memoryPersist; });
    await page.locator('[data-retry-story-save]').click();
    await page.evaluate(() => BAOStorageWriteGuard.whenIdle());
    expect(await page.evaluate(() => window.__memoryCalls)).toBe(1);
    await page.reload();
    await page.waitForFunction(() => Storage.status().ready && window.BAOStoryLibrary);
    expect(await page.evaluate(() => ({ cursor: Storage.loadStory().chat.summarizedUntil,
      summary: Storage.loadStory().chat.summary, messages: Storage.loadStory().chat.messages.length })))
      .toEqual({ cursor: result.cursor, summary: result.summary, messages: 182 });
  });
}
