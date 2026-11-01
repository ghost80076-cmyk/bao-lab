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
