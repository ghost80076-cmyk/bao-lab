const { test, expect } = require('@playwright/test');

test('story quick commands fill the composer without sending and persist custom commands in story state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOStoryQuickCommands &&
    window.BAOMobileReadingLayout &&
    window.BAOStoryControlCenter &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      greeting: '港口的燈還亮著。',
      quick_commands: [
        { id: 'author-wait', label: '靜候變化', text: '先不主動干預，觀察場景中的人物如何自行行動。' }
      ]
    };
    App.config = {
      persona: { name: '旅人', identity: '記者', relationship: '舊識' },
      narrativeMode: 'world',
      displayMode: 'ui',
      api: { model: 'mock-quick-command', baseUrl: 'https://example.invalid', key: 'EPHEMERAL_TEST_KEY' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
    window.BAOMobileReadingLayout.sync();
  });

  const beforeMessages = await page.evaluate(() => Chat.messages.length);
  const plus = page.locator('#bao-mobile-composer-tools');
  await expect(plus).toBeVisible();
  await plus.click();

  const drawer = page.getByRole('dialog', { name: '故事功能選單' });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button', { name: '⌁ 快捷指令' })).toBeVisible();
  await drawer.getByRole('button', { name: '⌁ 快捷指令' }).click();

  let dialog = page.getByRole('dialog', { name: '快捷指令' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('常用');
  await expect(dialog).toContainText('作品提供');
  await expect(dialog.getByRole('button', { name: /靜候變化/ })).toBeVisible();

  await dialog.getByRole('button', { name: /NPC 自主行動/ }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#user-input')).toHaveValue(/NPC/);
  expect(await page.evaluate(() => Chat.messages.length)).toBe(beforeMessages);

  await page.evaluate(() => { document.getElementById('user-input').value = ''; });
  await page.evaluate(() => window.BAOStoryQuickCommands.open());
  dialog = page.getByRole('dialog', { name: '快捷指令' });
  await dialog.getByText('＋ 新增我的快捷指令').click();
  await dialog.locator('input[name="label"]').fill('慢慢推進');
  await dialog.locator('textarea[name="text"]').fill('放慢節奏，多寫人物反應，不替我做決定。');
  await dialog.getByRole('button', { name: '儲存快捷指令' }).click();

  dialog = page.getByRole('dialog', { name: '快捷指令' });
  await expect(dialog.getByRole('button', { name: /慢慢推進/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => GameState.current.quickCommands?.length || 0)).toBe(1);
  await expect.poll(() => page.evaluate(() => GameState.current.quickCommands?.[0]?.text || ''))
    .toBe('放慢節奏，多寫人物反應，不替我做決定。');

  await dialog.getByRole('button', { name: /慢慢推進/ }).click();
  await expect(page.locator('#user-input')).toHaveValue('放慢節奏，多寫人物反應，不替我做決定。');
  expect(await page.evaluate(() => Chat.messages.length)).toBe(beforeMessages);

  await page.evaluate(() => window.BAOStoryControlCenter.open());
  const control = page.getByRole('dialog', { name: '本故事控制台' });
  await expect(control).toContainText('快捷指令');
  await expect(control).toContainText('作品 1');
  await expect(control).toContainText('我的 1');
});
