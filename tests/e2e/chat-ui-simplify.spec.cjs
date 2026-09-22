const { test, expect } = require('@playwright/test');

test('phone chat keeps advanced author settings out of the reading pane but reachable from tools', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOChatUISimplify && window.BAOChatToolNavigation &&
    window.BAOMobileReadingLayout && document.getElementById('bao-author-regex-panel')));
  await page.evaluate(() => App.showView('chat'));
  await expect(page.locator('#chat-view .chat-main #bao-author-regex-panel')).toHaveCount(0);
  await expect(page.locator('#bao-author-settings-storage #bao-author-regex-panel')).toHaveCount(1);
  await page.locator('#bao-mobile-tools-tab').click();
  const drawer = page.locator('#bao-chat-tool-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('details').filter({ hasText: '敘事、模型與外觀' }).locator('summary').click();
  await drawer.getByRole('button', { name: '角色卡自訂介面（進階）' }).click();
  const dialog = page.getByRole('dialog', { name: '角色卡自訂介面設定' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('#bao-author-regex-panel')).toHaveAttribute('open', '');
  await expect(page.locator('#bao-chat-tool-drawer')).toHaveCount(0);
  await dialog.getByRole('button', { name: '關閉 ×' }).click();
  await expect(page.locator('#bao-author-settings-storage #bao-author-regex-panel')).toHaveCount(1);
  await expect(page.locator('#chat-view .chat-main #bao-author-regex-panel')).toHaveCount(0);
});

test('phone keeps image prompt action in advanced tools and preserves its original click handler', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOChatUISimplify && window.BAOChatToolNavigation));
  await page.evaluate(() => {
    const aside = document.querySelector('#chat-view aside');
    let action = aside.querySelector('[data-bao-image-prompt]');
    if (!action) {
      action = document.createElement('button');
      action.dataset.baoImagePrompt = '1';
      action.textContent = '劇情配圖提示詞';
      action.onclick = () => { window.__imagePromptWasClicked = true; };
      aside.append(action);
    } else {
      action.addEventListener('click', () => { window.__imagePromptWasClicked = true; });
    }
    window.BAOChatUISimplify.sync();
  });
  await expect(page.locator('#chat-view .chat-main [data-bao-image-prompt]')).toHaveCount(0);
  await expect(page.locator('[data-chat-tool-body="settings"] [data-bao-image-prompt]')).toHaveText('配圖工具（提示詞）');
  await page.evaluate(() => document.querySelector('[data-bao-image-prompt]').click());
  expect(await page.evaluate(() => window.__imagePromptWasClicked)).toBe(true);
});

test('phone author dock begins collapsed and can be expanded without removing the interface', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOChatUISimplify));
  await page.evaluate(() => {
    App.showView('chat');
    const dock = document.createElement('details');
    dock.id = 'bao-author-dock';
    dock.open = true;
    dock.innerHTML = '<summary>常駐作者介面 · 正則排版</summary><div id="test-author-ui">保留互動區</div>';
    document.querySelector('#chat-view .chat-main').prepend(dock);
    window.BAOChatUISimplify.sync();
  });
  const dock = page.locator('#bao-author-dock');
  await expect(dock).not.toHaveAttribute('open', '');
  await expect(dock.locator('summary')).toContainText('故事互動面板');
  await dock.locator('summary').click();
  await expect(dock.locator('#test-author-ui')).toBeVisible();
});
