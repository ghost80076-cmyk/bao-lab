const { test, expect } = require('@playwright/test');
for (const width of [390, 1280]) {
  test(`existing story retries automatic memory and saves coverage (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOMemoryWorkbenchSimple && App.characters?.length);
    await page.evaluate(() => {
      App.activeCharacter = { ...App.characters[0] };
      App.config = { api: { key: 'mock', model: 'mock' }, memory: { mode: 'smart', maxRounds: 20 } };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      for (let i=0;i<91;i++) { Chat.add('user', `行動${i}`); Chat.add('assistant', `已完成結果${i}`); }
      Chat.memoryHealth = { phase:'failed', message:'記憶輸出已截斷' };
      window.recoverySaves = [];
      App.saveStory = async () => { recoverySaves.push(Chat.summarizedUntil); };
      API.send = async () => ({ text: JSON.stringify({ events:['已確認的劇情結果'] }), finishReason:'STOP' });
      BAOMemoryWorkbench.open();
    });
    const retry = page.locator('[data-retry-auto-memory]');
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.locator('.memory-health-card')).toContainText('已整理');
    const result = await page.evaluate(() => ({ cursor:Chat.summarizedUntil, messages:Chat.messages.length, saves:recoverySaves, notes:BAOMemoryWorkbench.readSlots().filter(x=>x.text).length }));
    expect(result.cursor).toBe(174);
    expect(result.messages).toBe(182);
    expect(result.saves).toEqual([174]);
    expect(result.notes).toBe(0);
  });
}
