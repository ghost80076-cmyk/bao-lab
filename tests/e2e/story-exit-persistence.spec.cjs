const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === "ready"
    && BAOExtensionLoadHealth.snapshot().world === "ready" && Storage.status().ready);
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await page.locator('#api-type').selectOption('gemini');
  await expect(page.locator("#test-api")).toBeVisible();
};

for (const width of [390, 1440]) {
  test(`cancel then exit persists settled history across reload and retry (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    let requests = 0;
    let releaseFirst;
    const firstResponse = new Promise(resolve => { releaseFirst = resolve; });
    await page.route('https://generativelanguage.googleapis.com/**', async route => {
      requests++;
      if (requests === 1) {
        await firstResponse;
        try { await route.abort(); } catch {}
      } else {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
          candidates: [{ content: { parts: [{ text: '重試成功，故事繼續。' }] }, finishReason: 'STOP' }]
        }) });
      }
    });
    await openModelStep(page);
    await page.locator('#api-key').fill('MAIN-TEST-KEY');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
    const before = await page.evaluate(async () => {
      App.config.memory.mode = 'full';
      App.config.stateTracking = false;
      App.config.cost = { ...App.config.cost, stateInterval: 1000 };
      App.saveStory(false);
      const refs = BAOStoryLibrary.refs();
      await BAOStoryLibrary.flush(refs.storyId);
      return { messages: JSON.stringify(Chat.messages), refs };
    });
    await page.locator('#user-input').fill('取消後不應留在存檔');
    await page.getByRole('button', { name: '送出訊息' }).click();
    await expect.poll(() => requests).toBe(1);
    expect(await page.evaluate(async () => {
      App.saveStory(true);
      await Storage.flush();
      return JSON.stringify(Storage.loadStory().chat.messages);
    })).toBe(before.messages);
    await page.evaluate(() => { window.__cancelExit = App.exitChat(); });
    releaseFirst();
    await page.evaluate(() => window.__cancelExit);
    await expect(page.locator('#detail-view')).toHaveClass(/active/);
    const saved = await page.evaluate(async refs => {
      await Storage.flush();
      await BAOStoryLibrary.flush(refs.storyId);
      return { auto: JSON.stringify(Storage.loadStory().chat.messages),
        library: JSON.stringify((await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId)).chat.messages) };
    }, before.refs);
    expect(saved).toEqual({ auto: before.messages, library: before.messages });
    await page.reload();
    await page.waitForFunction(() => BAOExtensionLoadHealth.snapshot().story === 'ready' && Storage.status().ready);
    expect(await page.evaluate(() => JSON.stringify(Storage.loadStory().chat.messages))).toBe(before.messages);
    await page.evaluate(() => {
      const save = Storage.loadStory();
      if (!Storage.restoreStory(save)) throw new Error('Restore failed');
      App.config.api.key = 'MAIN-TEST-KEY';
      GameState.current.config = App.config;
      App.renderChatShell(false);
      App.showView('chat');
    });
    await page.locator('#user-input').fill('繼續這個故事');
    await page.getByRole('button', { name: '送出訊息' }).click();
    await expect(page.locator('#chat-stream')).toContainText('重試成功，故事繼續。');
    await page.waitForFunction(() => !App.__requestPending && !App.__sendMessageTasks?.size);
    expect(await page.evaluate(() => Chat.messages.filter(m => m.role === 'user').map(m => m.content))).toEqual(['繼續這個故事']);
    expect(requests).toBe(2);
  });

}

test.describe('storage guard script fails to load', () => {
  // A registered PWA worker could otherwise serve the script despite routing.
  test.use({ serviceWorkers: 'block' });

  async function openWithoutGuard(page) {
    await page.route('**/js/storage-write-guard.js*', route => route.abort('failed'));
    await page.goto('/');
    await page.waitForFunction(() => Storage.status().ready && App.characters?.length
      && BAOExtensionLoadHealth?.snapshot().story === 'unavailable');
    expect(await page.evaluate(() => Boolean(window.BAOStorageWriteGuard))).toBe(false);
    await page.evaluate(() => {
      App.activeCharacter = { ...App.characters[0], id: 'exit-guard-missing-fixture', name: '守衛載入失敗測試' };
      App.config = {
        persona: { name: '測試玩家' }, narrativeMode: 'immersive', displayMode: 'text',
        api: { type: 'custom', protocol: 'openai', model: 'offline', baseUrl: 'https://offline.invalid', key: '' },
        memory: { mode: 'full', maxRounds: 20 }
      };
      Chat.reset();
      GameState.create(App.activeCharacter, App.config);
      Chat.add('assistant', '守衛缺失但必須保存的故事');
      App.showView('chat');
    });
  }

  for (const width of [390, 1440]) {
    test(`missing guard awaits delayed IndexedDB commit before exit (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openWithoutGuard(page);
      await page.evaluate(() => {
        const persist = Storage._persistOperationIndexedDB.bind(Storage);
        window.__commitGate = new Promise(resolve => { window.__releaseCommit = resolve; });
        Storage._persistOperationIndexedDB = async operation => {
          window.__commitEntered = true;
          await window.__commitGate;
          return persist(operation);
        };
        window.__exitSettled = false;
        window.__exitResult = App.exitChat().then(result => {
          window.__exitSettled = true;
          return result;
        });
      });
      await page.waitForFunction(() => window.__commitEntered);
      expect(await page.evaluate(() => window.__exitSettled)).toBe(false);
      await expect(page.locator('#chat-view')).toHaveClass(/active/);
      await page.evaluate(() => window.__releaseCommit());
      expect(await page.evaluate(() => window.__exitResult)).toBe(true);
      await expect(page.locator('#detail-view')).toHaveClass(/active/);
      await page.reload();
      await page.waitForFunction(() => Storage.status().ready);
      expect(await page.evaluate(() => Storage.loadStory()?.chat.messages.at(-1)?.content))
        .toBe('守衛缺失但必須保存的故事');
    });

    test(`missing guard blocks failed IDB and fallback writes; retry survives reload (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await openWithoutGuard(page);
      const failure = await page.evaluate(async () => {
        window.__originalIDB = Storage._persistOperationIndexedDB;
        window.__originalFallback = Storage._persistFallbackSnapshot;
        Storage._persistOperationIndexedDB = async () => { throw new Error('fixture IDB failure'); };
        Storage._persistFallbackSnapshot = () => { throw new DOMException('fixture quota', 'QuotaExceededError'); };
        const result = await App.exitChat();
        return { result, mode: Storage.status().mode, failures: Storage.status().uncommittedWrites };
      });
      expect(failure.result).toBe(false);
      expect(failure.mode).toBe('localStorage');
      expect(failure.failures).toBeGreaterThan(0);
      await expect(page.locator('#chat-view')).toHaveClass(/active/);
      await expect(page.locator('#bao-feedback-toast')).toContainText('故事尚未確認儲存');

      const recovery = await page.evaluate(async () => {
        Storage._persistOperationIndexedDB = window.__originalIDB;
        Storage._persistFallbackSnapshot = window.__originalFallback;
        const result = await App.exitChat();
        return { result, failures: Storage.status().uncommittedWrites };
      });
      expect(recovery).toEqual({ result: true, failures: 0 });
      await expect(page.locator('#detail-view')).toHaveClass(/active/);
      await page.reload();
      await page.waitForFunction(() => Storage.status().ready);
      expect(await page.evaluate(() => Storage.loadStory()?.chat.messages.at(-1)?.content))
        .toBe('守衛缺失但必須保存的故事');
    });
  }
});
