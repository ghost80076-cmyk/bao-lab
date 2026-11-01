const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect(page.locator('#user-input')).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOStoryRollback && window.BAOStoryBranches))).toBe(true);
}

async function seedStory(page) {
  return page.evaluate(async () => {
    Chat.messages = Chat.ensureMessageIds([
      { role: 'user', content: '第一次選擇' },
      { role: 'assistant', content: '歷史岔路' }
    ]);
    Chat.summary = '舊記憶';
    Chat.summarizedUntil = 2;
    GameState.current.time = '夜晚';
    GameState.current.location = '舊城';
    GameState.current.contextPack = { id: 'old-pack', summary: '舊資料' };
    App.renderChatShell(false);
    App.saveStory(false);
    await Storage.flush();
    await BAOStoryLibrary.flush();
    Chat.add('user', '繼續走原路');
    // A failed/pending next turn must not overwrite the preceding checkpoint.
    Chat.summary = '等待回覆時的較晚記憶';
    Chat.summarizedUntil = 3;
    GameState.current.location = '等待回覆時的較晚地點';
    App.saveStory(false);
    await Storage.flush();
    await BAOStoryLibrary.flush();
    const point = (await BAOStoryLibrary.allRecords()).find(record => record.kind === 'checkpoint'
      && record.chapterId === BAOStoryLibrary.refs().chapterId && record.messageId === Chat.messages[1].id);
    if (point?.payload.chat.summary !== '舊記憶' || point?.payload.state.location !== '舊城')
      throw new Error('Pending player turn overwrote the historical checkpoint');
    Chat.add('assistant', '前往新城');
    Chat.summary = '新記憶';
    Chat.summarizedUntil = 4;
    GameState.current.time = '清晨';
    GameState.current.location = '新城';
    GameState.current.contextPack = { id: 'new-pack', summary: '新資料' };
    App.renderChatShell(false);
    App.saveStory(false);
    await Storage.flush();
    await BAOStoryLibrary.flush();
    return { firstId: Chat.messages[1].id, originalChapterId: BAOStoryLibrary.refs().chapterId };
  });
}

async function revealRollback(page, id) {
  // Startup/render hooks can regroup actions after the first synchronous sync.
  // Operate the current menu and verify the target, rather than trusting a
  // one-time count/open snapshot from a menu that may be replaced.
  await expect(async () => {
    await page.evaluate(() => BAOMobileReadingLayout.syncMessageActions());
    const target = page.locator(`[data-story-rollback="${id}"]`);
    if (!await target.isVisible()) {
      const details = page.locator(`details.bao-message-more:has([data-story-rollback="${id}"])`);
      await expect(details).toBeVisible();
      if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
    }
    await expect(target).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}

const state = page => page.evaluate(() => ({
  messages: Chat.messages.map(m => m.content),
  time: GameState.current.time,
  location: GameState.current.location,
  summary: Chat.summary,
  summarizedUntil: Chat.summarizedUntil,
  contextPackId: GameState.current.contextPack?.id,
  refs: BAOStoryLibrary.refs()
}));

test('rolls back from a message into a separate branch and can switch to the original story', async ({ page }) => {
  await openDemoStory(page);
  const { firstId, originalChapterId } = await seedStory(page);
  await revealRollback(page, firstId);
  const rollbackButton = page.locator(`[data-story-rollback="${firstId}"]`);
  await expect(rollbackButton).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await rollbackButton.click();
  await expect.poll(() => page.evaluate(() => Chat.messages.length)).toBe(2);
  const rewound = await state(page);
  expect(rewound).toMatchObject({
    messages: ['第一次選擇', '歷史岔路'],
    time: '夜晚', location: '舊城', summary: '舊記憶', summarizedUntil: 2, contextPackId: 'old-pack',
    refs: { parentChapterId: originalChapterId }
  });
  expect(rewound.refs.chapterId).not.toBe(originalChapterId);
  const inspected = await page.evaluate(() => {
    const previous = API.send;
    API.send = () => { throw new Error('Local recovery inspection must never call a model'); };
    try { return BAOStoryRollback.inspectCurrent(); }
    finally { API.send = previous; }
  });
  expect(inspected.ok).toBe(true);
  expect(inspected.sources).toMatchObject({ messages: 2, summarizedUntil: 2, contextPack: true, branch: true });
  await page.evaluate(() => BAOStoryBranches.open());
  await expect(page.locator('.story-branch-node')).toHaveCount(2);
  await page.locator(`[data-chapter="${originalChapterId}"]`).getByRole('button', { name: '切換' }).click();
  await expect.poll(() => page.evaluate(() => Chat.messages.length)).toBe(4);
  expect(await state(page)).toMatchObject({
    messages: ['第一次選擇', '歷史岔路', '繼續走原路', '前往新城'],
    time: '清晨', location: '新城', summary: '新記憶', contextPackId: 'new-pack',
    refs: { chapterId: originalChapterId }
  });
});

test('mobile message exposes a rollback action without overflowing the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStory(page);
  const { firstId } = await seedStory(page);
  await expect(async () => {
    await revealRollback(page, firstId);
    await expect(page.locator(`[data-story-rollback="${firstId}"]`)).toBeVisible({ timeout: 500 });
  }).toPass({ timeout: 8000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('rejects an out-of-range historical summary without changing the original story', async ({ page }) => {
  await openDemoStory(page);
  const { firstId, originalChapterId } = await seedStory(page);
  await page.evaluate(async ({ firstId, originalChapterId }) => {
    const records = await BAOStoryLibrary.allRecords();
    const checkpoint = records.find(record => record.kind === 'checkpoint'
      && record.chapterId === originalChapterId && record.messageId === firstId);
    checkpoint.payload.chat.summarizedUntil = 99;
    await new Promise((resolve, reject) => {
      const tx = BAOStoryLibrary._db.transaction(BAOStoryLibrary.storeName, 'readwrite');
      tx.objectStore(BAOStoryLibrary.storeName).put(checkpoint);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
  }, { firstId, originalChapterId });
  const alerts = [];
  page.on('dialog', async dialog => { alerts.push(dialog.message()); await dialog.accept(); });
  expect(await page.evaluate(() => BAOStoryRollback.rewind(1))).toBe(false);
  expect(await state(page)).toMatchObject({ summary: '新記憶', summarizedUntil: 4,
    refs: { chapterId: originalChapterId } });
  expect(alerts.join('')).toContain('摘要游標超出回溯範圍');
  expect(await page.evaluate(() => Chat.messages.length)).toBe(4);
});

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  for (const action of ['branch', 'rewind']) {
    test(`${action} in a long story lands at the selected reply (${viewport.width}px)`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await openDemoStory(page);
      const original = await page.evaluate(async () => {
        Chat.messages = [];
        Chat.summary = '';
        Chat.summarizedUntil = 0;
        for (let round = 1; round <= 20; round++) {
          Chat.add('user', `選擇 ${round}`);
          Chat.add('assistant', `歷史回覆 ${round}。${'這是一段用來驗證長篇故事閱讀位置的文字。'.repeat(18)}`);
        }
        App.renderChatShell(false);
        App.saveStory(false);
        await Storage.flush(); await BAOStoryLibrary.flush();
        const refs = BAOStoryLibrary.refs();
        for (let round = 21; round <= 30; round++) {
          Chat.add('user', `選擇 ${round}`);
          Chat.add('assistant', `未來回覆 ${round}。${'原路線的後續故事。'.repeat(18)}`);
        }
        App.renderChatShell(false);
        App.saveStory(false);
        await Storage.flush(); await BAOStoryLibrary.flush();
        return refs;
      });
      const dialogs = [];
      page.on('dialog', async dialog => {
        dialogs.push(dialog.message());
        await dialog.accept(dialog.type() === 'prompt' ? '長篇定位測試' : undefined);
      });
      // Click the actual message action, including its mobile overflow menu.
      const selector = action === 'branch' ? '[data-create-branch="39"]'
        : await page.evaluate(() => `[data-story-rollback="${Chat.messages[39].id}"]`);
      await expect(async () => {
        await page.evaluate(() => BAOMobileReadingLayout.syncMessageActions());
        const button = page.locator(selector);
        if (!await button.isVisible()) {
          const more = page.locator(`details.bao-message-more:has(${selector})`);
          if (await more.getAttribute('open') === null) await more.locator(':scope > summary').click();
        }
        await expect(button).toBeVisible({ timeout: 1000 });
      }).toPass();
      await page.locator(selector).click();
      await expect.poll(() => dialogs.some(text => text.includes(action === 'branch' ? '已建立並切換至「長篇定位測試」' : '已回溯至第 20 輪'))).toBe(true);
      await expect.poll(() => page.evaluate(() => {
        const stream = document.getElementById('chat-stream');
        const target = stream.querySelector('.message.assistant:last-child');
        const box = target?.getBoundingClientRect();
        const reader = stream.getBoundingClientRect();
        return !!box && box.bottom > Math.max(reader.top, 0)
          && box.bottom <= Math.min(reader.bottom, innerHeight) + 2
          && stream.scrollTop > 500 && document.activeElement === target;
      })).toBe(true);
      const saved = await page.evaluate(async refs => {
        await Storage.flush(); await BAOStoryLibrary.flush();
        return { count: Chat.messages.length, refs: BAOStoryLibrary.refs(),
          originalCount: (await BAOStoryLibrary.reconstruct(refs.storyId, refs.chapterId)).chat.messages.length };
      }, original);
      expect(saved.count).toBe(40);
      expect(saved.originalCount).toBe(60);
      expect(saved.refs.parentChapterId).toBe(original.chapterId);

      // Switching back also returns to the current endpoint, not the opening.
      await page.evaluate(refs => BAOStoryBranches.restore(refs.storyId, refs.chapterId), original);
      await expect.poll(() => page.evaluate(() => Chat.messages.length)).toBe(60);
      await expect.poll(() => page.evaluate(() => {
        const stream = document.getElementById('chat-stream');
        const box = stream.querySelector('.message.assistant:last-child').getBoundingClientRect();
        const reader = stream.getBoundingClientRect();
        return box.bottom > Math.max(reader.top, 0)
          && box.bottom <= Math.min(reader.bottom, innerHeight) + 2;
      })).toBe(true);
      if (action === 'branch') {
        // Refusing a branch must leave both the story and reading position alone.
        await page.evaluate(() => { document.getElementById('chat-stream').scrollTop = 600; });
        const before = await page.evaluate(() => ({ refs: BAOStoryLibrary.refs(),
          count: Chat.messages.length, top: document.getElementById('chat-stream').scrollTop }));
        await page.evaluate(async () => {
          const create = BAOStoryLibrary.createBranch;
          BAOStoryLibrary.createBranch = async () => { throw new Error('測試：缺少歷史檢查點'); };
          try { await BAOStoryBranches.createFrom(39); }
          finally { BAOStoryLibrary.createBranch = create; }
        });
        expect(dialogs.at(-1)).toContain('缺少歷史檢查點');
        expect(await page.evaluate(() => ({ refs: BAOStoryLibrary.refs(),
          count: Chat.messages.length, top: document.getElementById('chat-stream').scrollTop }))).toEqual(before);
        // A late rollback write failure rerenders the original story; it must
        // restore the reader position after the shell's queued bottom scroll.
        const result = await page.evaluate(async originalChapter => {
          const flush = BAOStoryLibrary.flush;
          BAOStoryLibrary.flush = function(...args) {
            return this.refs().chapterId === originalChapter ? flush.apply(this, args) : Promise.resolve(false);
          };
          try { return await BAOStoryRollback.rewind(39); }
          finally { BAOStoryLibrary.flush = flush; }
        }, original.chapterId);
        expect(result).toBe(false);
        expect(dialogs.at(-1)).toContain('回溯分支無法寫入故事庫');
        expect(await page.evaluate(() => ({ refs: BAOStoryLibrary.refs(),
          count: Chat.messages.length, top: document.getElementById('chat-stream').scrollTop }))).toEqual(before);
      }
    });
  }
}
