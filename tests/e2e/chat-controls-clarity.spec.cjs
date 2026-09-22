const { test, expect } = require('@playwright/test');

test('labels distinguish auto-save, named backup and story library without losing actions', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOChatControlsClarity && window.BAOChatToolNavigation && window.BAOStoryEntryVisibility));
  await expect(page.locator('#chat-view [data-chat-tool-group="story"] > summary')).toHaveText('▤ 故事庫與存檔');
  await expect(page.locator('#save-slot-button')).toHaveText('另存手動備份');
  await expect(page.locator('#list-slots-button')).toHaveText('手動備份清單');
  await expect(page.locator('#import-save-button')).toHaveText('匯入備份檔');
  await expect(page.locator('#chat-view #bao-chat-quick-actions button[onclick*="App.saveStory"]')).toHaveText('快速儲存');
  await expect(page.locator('#bao-chat-api-aside')).toHaveText('AI 模型與連線');
  await page.waitForFunction(() => Boolean(document.querySelector('[data-bao-open="story-tools"]')));
  await expect(page.locator('[data-bao-open="story-tools"]')).toHaveText('故事庫與完整備份');
  await page.evaluate(() => window.BAOChatToolNavigation.openDrawer());
  const drawer = page.locator('#bao-chat-tool-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-bao-clarity-group="story"]')).toHaveText('▤ 故事庫與存檔');
  await drawer.locator('[data-bao-clarity-group="story"]').click();
  await expect(drawer.getByRole('button', { name: '手動備份清單' })).toHaveCount(1);
  await drawer.getByRole('button', { name: '關閉 ×' }).click();
  await expect(page.locator('#list-slots-button')).toHaveText('手動備份清單');
});

test('story library is not repeated in chat top navigation, but remains reachable elsewhere', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryEntryVisibility && window.BAOChatToolNavigation));
  await page.waitForFunction(() => Boolean(document.querySelector('[data-open-story-library]') && document.querySelector('#chat-view [data-bao-open="story-tools"]')));
  const navLibrary = page.locator('.topbar nav [data-open-story-library]');
  await expect(navLibrary).not.toHaveAttribute('aria-hidden', 'true');
  await page.evaluate(() => App.showView('chat'));
  await expect(navLibrary).toHaveAttribute('aria-hidden', 'true');
  expect(await navLibrary.evaluate(node => node.style.display)).toBe('none');
  await page.evaluate(() => App.showView('home'));
  await expect(navLibrary).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('#home-continue')).toHaveText('繼續上次故事');
  await expect(page.locator('#continue-story')).toHaveText('繼續上次故事');
});
