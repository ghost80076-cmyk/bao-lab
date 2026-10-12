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
    const modal = page.locator('.ylb-modal');
    await expect(modal.getByText('曙光市', { exact: true })).toBeVisible();
    await expect(modal.getByText('三界九域', { exact: true })).toBeVisible();
    const simulator = modal.locator('.ylb-collection').filter({ hasText: '通用世界模擬器' }).first();
    await expect(simulator.getByText('通用世界模擬器', { exact: true })).toBeVisible();
    await expect(simulator.getByText(/0 \/ 6 章已啟用/)).toBeVisible();
    await simulator.getByText('自選章節（6）', { exact: true }).click();
    for (const chapter of ['冒險題材參考','都市與競技參考','人物與關係參考','戀愛與情感題材','身分與權謀題材','校園與成長題材']) {
      await expect(simulator.getByText(chapter, { exact: true })).toBeVisible();
    }
    for (const name of ['通用世界模擬器｜戀愛與情感題材','通用世界模擬器｜身分與權謀題材','通用世界模擬器｜校園與成長題材']) {
      await expect(page.getByRole('checkbox', {name:new RegExp(name)})).not.toBeChecked();
    }
    const relationship = page.getByRole('checkbox', { name: /通用世界模擬器｜人物與關係參考/ });
    await expect(relationship).not.toBeChecked();
    await relationship.check();
    expect(await page.evaluate(() => JSON.parse(window.recallSaved).worldbookLibrary.enabled))
      .toContain('world-simulator-relationship-reference');
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
    await expect(relationship).toBeChecked();
    expect(await page.evaluate(() => GameState.current.worldbookLibrary.pinned['world-simulator-relationship-reference'].entries.length)).toBe(8);
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
