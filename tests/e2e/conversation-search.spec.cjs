const { test, expect } = require('@playwright/test');

test('searches the current local story and jumps to the selected message', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOConversationSearch && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '歡迎回到夜灣。' };
    App.config = {
      persona: { name: '玩家', gender: '', identity: '', personality: '', relationship: '', extra: '' },
      narrativeMode: 'immersive', displayMode: 'text',
      api: { model: 'mock', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'rounds', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    const greeting = Chat.add('assistant', App.activeCharacter.greeting); greeting.greeting = true;
    Chat.add('user', '我在雨夜走進港口。');
    Chat.add('assistant', '他撐著傘，在港口等你。');
    Chat.add('user', '我問起那封信。');
    Chat.add('assistant', '他把那封信放在桌上。');
    App.renderChatShell(false);
    App.showView('chat');
  });

  await expect(page.getByRole('button', { name: '⌕ 搜尋對話' })).toBeVisible();
  await page.getByRole('button', { name: '⌕ 搜尋對話' }).click();
  const dialog = page.getByRole('dialog', { name: '搜尋這個對話' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill('港口');
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 2 則');
  await expect(dialog.locator('.conversation-search-result')).toHaveCount(2);
  await dialog.getByRole('button', { name: '只看 AI' }).click();
  await expect(dialog.locator('[data-search-status]')).toHaveText('找到 1 則');
  await dialog.locator('.conversation-search-result').click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#chat-stream > .message[data-message-index="2"]')).toHaveClass(/bao-search-target/);
});
