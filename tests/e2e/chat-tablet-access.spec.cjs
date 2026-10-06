const { test, expect } = require('@playwright/test');

test('tablet with hidden sidebar can open author settings from the tool drawer', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOChatUISimplify && window.BAOChatToolNavigation && window.App && App.characters?.length));
  await page.evaluate(async () => {
    await App.openCharacter(App.characters[0].id);
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true); App.showView('chat');
  });
  await expect(page.locator('#bao-author-settings-storage #bao-author-regex-panel')).toHaveCount(1);
  await expect(page.locator('#bao-chat-tool-shortcuts')).toBeVisible();
  await page.locator('#bao-chat-tool-shortcuts').getByRole('button', { name: '全部功能' }).click();
  const drawer = page.locator('#bao-chat-tool-drawer');
  await expect(drawer).toBeVisible();
  await drawer.locator('details').filter({ hasText: '敘事、模型與外觀' }).locator('summary').click();
  await drawer.getByRole('button', { name: '自訂介面' }).click();
  await expect(page.getByRole('dialog', { name: '角色卡自訂介面設定' })).toBeVisible();
});
