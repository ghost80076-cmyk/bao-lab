const { test, expect } = require('@playwright/test');

test('mobile story keeps advanced regex out of the reading column and retains access via tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.BAOAdvancedToolPlacement && App.characters?.length && Storage.status().ready));
  await page.getByRole('button', { name: '探索作品' }).click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await expect(page.locator('#bao-author-settings-launcher')).toHaveCount(1);
  const reading = await page.evaluate(() => {
    const panel = document.getElementById('bao-author-regex-panel');
    return { parent: panel?.parentElement?.tagName, insideMain: Boolean(panel?.closest('.chat-main')),
      display: panel && getComputedStyle(panel).display };
  });
  expect(reading.insideMain).toBe(false);
  expect(reading.display).toBe('none');
  await page.locator('#bao-mobile-tools-tab').click();
  const drawer = page.locator('#bao-chat-tool-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('summary').filter({ hasText: '敘事、模型與外觀' }).click();
  await drawer.getByRole('button', { name: '顯示與排版（作者正則）' }).click();
  await expect(page.locator('#bao-author-settings-overlay')).toBeVisible();
  await expect(page.locator('#bao-author-settings-overlay #bao-author-regex-panel')).toBeVisible();
  await page.getByRole('button', { name: '關閉設定 ×' }).click();
  await expect(page.locator('#bao-author-settings-overlay')).toHaveCount(0);
  await expect(page.locator('#bao-author-regex-panel')).toBeHidden();
});

test('image prompt remains usable from advanced tools without a permanent sidebar button', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.BAOAdvancedToolPlacement && App.characters?.length && Storage.status().ready));
  await page.getByRole('button', { name: '探索作品' }).click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  const image = page.locator('[data-bao-image-prompt]');
  await expect(image).toHaveCount(1);
  await expect(page.locator('#bao-chat-image-tools [data-bao-image-prompt]')).toHaveCount(1);
  await page.locator('#bao-mobile-tools-tab').click();
  const drawer = page.locator('#bao-chat-tool-drawer');
  await drawer.locator('summary').filter({ hasText: '敘事、模型與外觀' }).click();
  await drawer.getByRole('button', { name: '製作圖片提示詞' }).click();
  await expect(page.getByRole('dialog', { name: '劇情配圖提示詞' })).toBeVisible();
  await page.getByRole('dialog', { name: '劇情配圖提示詞' }).getByRole('button', { name: '關閉' }).click();
});
