const { test, expect } = require('@playwright/test');

test('first paint already uses the final player navigation', async ({ page }) => {
  await page.route('**/js/site-ui.js*', route => route.abort());
  await page.goto('/');

  const nav = page.locator('.topbar nav');
  await expect(nav).toContainText('作品');
  await expect(nav).toContainText('繼續上次故事');
  await expect(nav).toContainText('我的');
  await expect(nav).toContainText('我的故事');
  await expect(nav).toContainText('關於 BAO/LAB');
  await expect(nav).not.toContainText('探索');
  await expect(nav).not.toContainText('YoruBay 帳號');
  await expect(nav).not.toContainText('投餵肉包');
});

test('save feedback stays inside the site without native dialogs', async ({ page }) => {
  test.setTimeout(70_000);
  const nativeDialogs = [];
  page.on('dialog', async dialog => {
    nativeDialogs.push(dialog.type());
    await dialog.dismiss();
  });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => window.BAOFeedback && window.BAOStorageWriteGuard &&
    window.BAOPlayerBuilderV2 && window.BAOChatToolNavigation && App.characters?.length &&
    Storage.status().ready, null, { timeout: 30000 });
  await expect(page.locator('#bao-me-nav')).toHaveCount(1);
  await expect(page.locator('.topbar nav [data-open-story-library]')).toHaveCount(1);
  await page.evaluate(async () => {
    const character = App.characters.find(item => item.id !== 'autonomous-npc-world');
    await App.openCharacter(character.id);
    App.openBuilder();
  });
  await page.locator('[data-bao-setup="advanced"]').click();
  await page.evaluate(() => App.setStep(4));
  await page.locator('#bao-demo-mode').check();
  await page.evaluate(() => App.startStory());
  await expect(page.locator('#chat-view')).toHaveClass(/active/);

  const quickSave = page.locator('#bao-chat-tool-shortcuts').getByRole('button', { name: '快速儲存' });
  await expect(quickSave).toBeVisible();
  await quickSave.click();
  const toast = page.locator('#bao-feedback-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/已確認寫入|已寫入瀏覽器備援儲存空間/);

  await page.locator('#bao-chat-tool-shortcuts').getByRole('button', { name: /全部功能/ }).click();
  const drawer = page.locator('#bao-chat-tool-drawer');
  await expect(drawer).toBeVisible();
  const storyTools = drawer.locator('details').filter({ hasText: '故事與存檔' });
  await storyTools.locator('summary').click();
  await storyTools.getByRole('button', { name: /另存手動備份|另存新檔/ }).click();
  const request = page.locator('#bao-text-request');
  await expect(request).toBeVisible();
  await request.locator('input').fill('回歸測試備份');
  await request.getByRole('button', { name: '儲存備份' }).click();
  await expect(request).toBeHidden();
  await expect(toast).toContainText('手動備份已確認寫入這台裝置');
  expect(nativeDialogs).toEqual([]);
});
