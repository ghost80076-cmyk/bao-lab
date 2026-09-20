const { test, expect } = require('@playwright/test');

for (const width of [390, 1440]) {
  test(`RP reading theme stays neutral at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => [...document.styleSheets].some(sheet => sheet.href?.includes('bao-brand-v2.css')));
    await expect(page.locator('#home-view .brand-hero')).toBeVisible();
    await expect(page.locator('#home-view #bao-home-portrait')).toBeVisible();

    // Brand artwork may contain rose, but the page and functional controls do not.
    expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(14, 17, 23)');
    expect(await page.locator('.brand-actions .brand-first-run').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(168, 191, 215)');
    expect(await page.locator('#bao-home-portrait').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(34, 42, 53)');

    await page.waitForFunction(() => window.BAOQuickSetup && App.characters?.length);
    await page.evaluate(() => {
      const character = App.characters.find(c => c.id !== 'autonomous-npc-world');
      if (!character) throw new Error('Ordinary character missing');
      App.openCharacter(character.id);
      App.openBuilder();
    });
    await expect(page.locator('#bao-setup-choice')).toBeVisible();
    expect(await page.locator('#builder-view .builder-panel').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(27, 34, 44)');
    await page.locator('#api-key').fill('visual-only-not-a-real-api-key');
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    expect(await page.locator('#chat-view .chat-stream').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(18, 24, 33)');
    expect(await page.locator('#chat-view .composer').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(29, 38, 49)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}
