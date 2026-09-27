const { test, expect } = require('@playwright/test');

test('Lin Chenfeng opening is structured UI backed by plain story text', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.length && Storage.status().ready, null, { timeout: 15000 });

  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();

  for (let step = 0; step < 3; step++) {
    await page.getByRole('button', { name: '下一步' }).click();
  }

  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();

  await page.waitForFunction(() => Boolean(window.BAOSceneHTML?.renderStructuredOpening), null, { timeout: 15000 });
  await expect(page.locator('.bao-structured-opening')).toBeVisible();
  await expect(page.locator('.bao-opening-post')).toHaveCount(2);
  await expect(page.locator('.bao-opening-post-player')).toContainText('最近很累');
  await expect(page.locator('.bao-opening-post-character')).toContainText('七年前');

  const stored = await page.evaluate(() => ({
    greeting: Chat.messages[0]?.greeting,
    content: Chat.messages[0]?.content,
    openingType: App.activeCharacter?.opening?.type,
    stateTime: GameState.current?.time,
    stage: GameState.current?.modules?.relationship?.stage
  }));
  expect(stored.greeting).toBe(true);
  expect(stored.content).not.toMatch(/<\/?(?:div|p|span|details|style)\b/i);
  expect(stored.openingType).toBe('forum');
  expect(stored.stateTime).toBe('23:52');
  expect(stored.stage).toBe('陌生人');

  const choice = page.getByRole('button', { name: /七年前那篇，你怎麼會看過？/ });
  await choice.click();
  await expect(page.locator('#user-input')).toHaveValue('七年前那篇，你怎麼會看過？');
  expect(await page.evaluate(() => Chat.messages.length)).toBe(1);
});
