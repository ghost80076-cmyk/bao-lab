const { test, expect } = require('@playwright/test');

for (const width of [1280, 390]) {
  test(`worldbook mode UI and story-local persistence (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => window.YoruWorldbookLibrary && window.BAOLorebook);
    await page.evaluate(() => {
      GameState.current = { location: '中央商業區', npcs: [], events: [], worldbookLibrary: {
        version: 1, enabled: ['sunrise-geography-demo'], installed: [], pinned: {}
      } };
      App.saveStory = () => { window.recallSaved = JSON.stringify(GameState.current); };
      YoruWorldbookLibrary.open();
    });
    const mode = page.getByRole('combobox', { name: '世界書召回模式' });
    await expect(mode).toHaveValue('auto');
    await expect(page.getByText('通用世界模擬器｜冒險題材參考', { exact: true })).toBeVisible();
    await expect(page.getByText('通用世界模擬器｜都市與競技參考', { exact: true })).toBeVisible();
    await mode.selectOption('off');
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.recallMode)).toBe('off');
    await page.getByRole('button', { name: '關閉', exact: true }).click();
    await page.evaluate(() => {
      const saved = JSON.parse(window.recallSaved);
      saved.worldbookLibrary = CharacterEngine.normalizeWorldbookLibrary(saved.worldbookLibrary);
      GameState.current = saved;
      YoruWorldbookLibrary.open();
    });
    await expect(mode).toHaveValue('off');
    await mode.selectOption('scene');
    expect(await page.evaluate(() => GameState.current.worldbookLibrary.recallMode)).toBe('scene');
    expect(await page.evaluate(() => {
      const api = YoruWorldbookLibrary;
      const old = GameState.current;
      GameState.current = { location: '', npcs: [], events: [] };
      return { stale: api.setRecallMode('off', old), other: GameState.current.worldbookLibrary };
    })).toEqual({ stale: false, other: undefined });
    await page.getByRole('button', { name: '關閉', exact: true }).click();
    await page.evaluate(() => YoruWorldbookLibrary.open());
    await expect(mode).toHaveValue('auto');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
  });
}
