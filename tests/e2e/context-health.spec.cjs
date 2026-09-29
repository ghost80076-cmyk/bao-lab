const { test, expect } = require('@playwright/test');

test('shows player-facing context health without pretending per-layer token precision', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOContextHealth && window.BAOStoryControlCenter && App.characters?.length));

  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '夜灣仍替你留著燈。' };
    App.config = {
      persona: { name: '旅人', identity: '記者', relationship: '舊識' },
      narrativeMode: 'world',
      displayMode: 'ui',
      api: { model: 'mock-context-model', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    Chat.add('user', '我問起昨晚的事。');
    Chat.add('assistant', '他把舊信重新放到桌上。');
    Chat.lastStoryPromptTokens = 32000;
    Chat.contextGuard = { level: 'normal', ratio: 0.5, recentRounds: 18 };
    Chat.summary = '玩家昨晚在港口收到一封舊信。';
    Chat.summarizedUntil = 2;
    Chat.usageLedger = [{ kind: 'story', model: 'mock-context-model', input: 32000, output: 1200, cached: 8000, at: new Date().toISOString() }];
    App.renderChatShell(false);
    App.showView('chat');
    window.BAOContextHealth.injectEntry();
  });

  const trigger = page.locator('[data-open-context-health]');
  await expect(trigger).toBeVisible();
  await expect(trigger).toContainText('上下文 50%');
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: '上下文狀態' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('充足');
  await expect(dialog).toContainText('32,000 tok');
  await expect(dialog).toContainText('64,000 tok');
  await expect(dialog).toContainText('目前故事層');
  await expect(dialog).toContainText('不假裝估算每一層的精確 Token 佔比');
  await expect(dialog).toContainText('Prompt Cache');
  await expect(dialog).toContainText('命中 8,000 tok');

  await dialog.getByRole('button', { name: /回到故事控制台/ }).click();
  const control = page.getByRole('dialog', { name: '本故事控制台' });
  await expect(control).toBeVisible();
  await expect(control).toContainText('上下文狀態');
  await expect(control).toContainText('充足 · 50%');
});
