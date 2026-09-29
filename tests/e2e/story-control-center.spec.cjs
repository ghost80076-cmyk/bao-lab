const { test, expect } = require('@playwright/test');

test('opens the current story control center and routes to existing story tools', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryControlCenter && window.BAOConversationSearch && App.characters?.length));

  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '夜灣的燈還亮著。' };
    App.config = {
      persona: { name: '玩家', identity: '旅人', relationship: '初次見面' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: { model: 'mock-story-model', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    Chat.add('user', '我回到港口。');
    Chat.add('assistant', '故事從昨晚停下的地方繼續。');
    App.renderChatShell(false);
    App.showView('chat');
  });

  const open = page.getByRole('button', { name: '☷ 故事控制台' });
  await expect(open).toBeVisible();
  await open.click();

  const dialog = page.getByRole('dialog', { name: '本故事控制台' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('mock-story-model');
  await expect(dialog).toContainText('玩家');
  await expect(dialog).toContainText('故事記憶');
  await expect(dialog).toContainText('人物／世界狀態');
  await expect(dialog).toContainText('世界模組');
  await expect(dialog).toContainText('敘事與描寫');

  await dialog.getByRole('button', { name: /搜尋這個故事/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: '搜尋這個對話' })).toBeVisible();
});
