const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '班長。' })).toBeVisible();
  await page.getByRole('button', { name: '探索角色' }).click();
  const card = page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '開始故事' }).click();
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
    GameState.current.time = '夜晚';
    GameState.current.location = '舊城';
    GameState.current.contextPack = { id: 'old-pack', summary: '舊資料' };
    App.renderChatShell(false);
    App.saveStory(false);
    await Storage.flush();
    await BAOStoryLibrary.flush();
    Chat.add('user', '繼續走原路');
    Chat.add('assistant', '前往新城');
    Chat.summary = '新記憶';
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

const state = page => page.evaluate(() => ({
  messages: Chat.messages.map(m => m.content),
  time: GameState.current.time,
  location: GameState.current.location,
  summary: Chat.summary,
  contextPackId: GameState.current.contextPack?.id,
  refs: BAOStoryLibrary.refs()
}));

test('rolls back from a message into a separate branch and can switch to the original story', async ({ page }) => {
  await openDemoStory(page);
  const { firstId, originalChapterId } = await seedStory(page);
  const rollbackButton = page.locator(`[data-story-rollback="${firstId}"]`);
  await expect(rollbackButton).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await rollbackButton.click();
  await expect.poll(() => page.evaluate(() => Chat.messages.length)).toBe(2);
  const rewound = await state(page);
  expect(rewound).toMatchObject({
    messages: ['第一次選擇', '歷史岔路'],
    time: '夜晚', location: '舊城', summary: '舊記憶', contextPackId: 'old-pack',
    refs: { parentChapterId: originalChapterId }
  });
  expect(rewound.refs.chapterId).not.toBe(originalChapterId);
  await page.locator('#story-branch-button').click();
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
  await expect(page.locator(`[data-story-rollback="${firstId}"]`)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
