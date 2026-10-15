const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test('memory workbench matches site themes and preserves story notes (' + width + 'px)', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => Boolean(
      window.YoruExperience && window.BAOMemoryWorkbenchSimple &&
      window.BAOMemoryWorkbench && App.characters?.length && window.GameState
    ));
    await page.waitForFunction(() => [...document.styleSheets].some(
      sheet => sheet.href?.includes('memory-workbench.css')
    ));
    await page.evaluate(() => {
      App.activeCharacter = { ...App.characters[0], greeting:'燈還亮著。' };
      App.config = {
        persona:{ name:'旅人' }, narrativeMode:'immersive', displayMode:'ui',
        api:{ model:'mock' }, memory:{ mode:'smart', maxRounds:20, maxContext:32000 }
      };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      Chat.add('assistant', '燈還亮著。');
      Chat.add('user', '我翻開港口的筆記。');
      Chat.summary = '旅人曾在碼頭交換一封信。';
      window.BAOMemoryWorkbench.writeSlots([{
        id:'keep-test', title:'碼頭的約定', enabled:true, text:'明天一定要回到港口。'
      }]);
      App.renderChatShell(false);
      App.showView('chat');
    });
    const before = await page.evaluate(() => JSON.stringify(GameState.current));
    for (const [theme, surface, card] of [
      ['mist', 'rgb(255, 250, 243)', 'rgb(255, 250, 244)'],
      ['rose', 'rgb(59, 48, 54)', 'rgb(64, 50, 57)']
    ]) {
      await page.evaluate(value => {
        YoruExperience.choose({ theme:value });
        BAOMemoryWorkbench.open();
      }, theme);
      const desk = page.locator('.memory-desk');
      await expect(desk).toBeVisible();
      await expect(desk).toHaveCSS('background-color', surface);
      await expect(desk).toHaveCSS('color', theme === 'mist' ? 'rgb(69, 59, 52)' : 'rgb(243, 232, 230)');
      await expect(desk.locator('.memory-desk-nav')).toHaveCSS(
        'background-color', theme === 'mist' ? 'rgb(243, 236, 227)' : 'rgb(59, 48, 54)'
      );
      await expect(desk.locator('.memory-health-card')).toHaveCSS('color', theme === 'mist' ? 'rgb(69, 59, 52)' : 'rgb(243, 232, 230)');
      await expect(desk.locator('.memory-note-card').first()).toHaveCSS('background-color', card);
      await expect(desk.locator('.memory-summary-preview')).toHaveCSS('background-color', card);
      await desk.locator('.memory-desk-tab[data-tab="notes"]').click();
      await expect(desk.locator('[data-slot-title]')).toHaveValue('碼頭的約定');
      await expect(desk.locator('[data-slot-text]')).toHaveValue('明天一定要回到港口。');
      expect(await page.evaluate(() => JSON.stringify(GameState.current))).toBe(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      await desk.locator('.memory-desk-close').click();
      await expect(desk).toHaveCount(0);
    }
  });
}
