const { test, expect } = require('@playwright/test');

test('first paint already uses the final player navigation', async ({ page }) => {
  await page.route('**/js/site-ui.js*', route => route.abort());
  await page.goto('/');

  const nav = page.locator('.topbar nav');
  await expect(nav).toContainText('作品');
  await expect(nav).toContainText('繼續上次故事');
  await expect(nav).toContainText('我的');
  await expect(nav).toContainText('我的故事');
  await expect(nav).toContainText('關於夜灣');
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
    window.BAORefreshSaveUI && App.characters?.length && Storage.status().ready, null, { timeout: 30000 });
  await expect(page.locator('#bao-me-nav')).toHaveCount(1);
  await expect(page.locator('.topbar nav [data-open-story-library]')).toHaveCount(1);
  await page.evaluate(async () => {
    const character = App.characters.find(item => item.id !== 'autonomous-npc-world');
    await App.openCharacter(character.id);
    App.config = {
      narrativeMode: 'immersive',
      displayMode: 'ui',
      persona: { name: '回歸測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    const greeting = Chat.add('assistant', App.activeCharacter.greeting || '故事開始');
    greeting.greeting = true;
    App.renderChatShell(false);
    App.showView('chat');
    App.saveStory(false);
  });
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await page.waitForFunction(() => window.BAOPlayerShellV2 && window.BAOChatToolNavigation &&
    document.getElementById('chat-view')?.dataset.baoSurface === 'play', null, { timeout: 30000 });
  await page.locator('#bao-surface-mode-toggle').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
  const sidebar = page.locator('#chat-view .chat-layout > aside').first();
  await expect(sidebar).toBeVisible();

  const quickSave = sidebar.getByRole('button', { name: '快速儲存', exact: true });
  await expect(quickSave).toBeVisible();
  await quickSave.click();
  const toast = page.locator('#bao-feedback-toast');
  await expect(toast).toBeVisible();
  await expect(toast).toContainText(/已確認寫入|已寫入瀏覽器備援儲存空間/);

  const storyTools = sidebar.locator('details[data-chat-tool-group="story"]');
  await storyTools.locator('summary').click();
  await storyTools.locator('#save-slot-button').click();
  const request = page.locator('#bao-text-request');
  await expect(request).toBeVisible();
  await request.locator('input').fill('回歸測試備份');
  await request.getByRole('button', { name: '儲存備份' }).click();
  await expect(request).toBeHidden();
  await expect(toast).toContainText('手動備份已確認寫入這台裝置');
  expect(nativeDialogs).toEqual([]);
});
