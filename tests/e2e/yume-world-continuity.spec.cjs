const { test, expect } = require('@playwright/test');

test('Yume offscreen records use the current timeline and existing NPC presence', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOYumeArchive && window.BAOYumeArchiveCore && window.App?.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], id: 'yume-test', name: '黑羽ゆめ', system_prompt: '原角色設定' };
    App.config = { narrativeMode: 'world', displayMode: 'text', persona: { name: '玩家' }, memory: { mode: 'rounds', maxRounds: 10 }, api: {} };
    GameState.current = { time: '星期六', location: 'Club Rose', npcs: [{ name: 'りな', presence: 'away', location: '未知' }], events: [] };
    Chat.messages = [{ role: 'assistant', id: 'a', content: '[OFFSCREEN:rina]玩家收到訊息，確認りな已離開。[/OFFSCREEN]' }];
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('chat-view').classList.add('active');
    BAOYumeArchive.refresh();
  });
  const panel = page.locator('#bao-yume-archive');
  await expect(panel).toBeVisible();
  await panel.locator('.y-head').click();
  await panel.getByRole('button', { name: '離場／世界進展' }).click();
  await panel.getByRole('button', { name: 'りな' }).click();
  await expect(panel).toContainText('玩家收到訊息，確認りな已離開。');
  await expect(panel).toContainText('在場狀態：已離場');
  await expect(panel).not.toContainText('目前位置：未知');
  const prompt = await page.evaluate(() => App.buildSystemPrompt());
  expect(prompt).toContain('原角色設定');
  expect(prompt).toContain('場外連續性');
  await page.evaluate(() => {
    Chat.messages = [{ role: 'assistant', content: '[OFFSCREEN:misaki]美咲已出發。[/OFFSCREEN]' }];
    GameState.current = { time: '星期天', location: '車站', npcs: [], events: [] };
    BAOYumeArchive.refresh();
  });
  await panel.locator('.y-head').click();
  await panel.getByRole('button', { name: '離場／世界進展' }).click();
  await panel.getByRole('button', { name: '美咲' }).click();
  await expect(panel).toContainText('美咲已出發。');
  await expect(panel).not.toContainText('玩家收到訊息，確認りな已離開。');
  await page.evaluate(() => { App.activeCharacter.name = '其他角色'; BAOYumeArchive.refresh(); });
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => App.buildSystemPrompt())).not.toContain('場外連續性');
});