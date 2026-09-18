const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

for (const width of [390, 1440]) {
  test(`blunt style remains opt-in and can be combined at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAONarrativeSettings && document.getElementById('chat-view'));
    await page.evaluate(() => BAONarrativeSettings.set({ stylePacks: [] }));
    expect(await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()))).toBe('');

    await page.evaluate(() => BAONarrativeSettings.open());
    const blunt = page.locator('[data-style-pack="male_blunt"]');
    const visual = page.locator('[data-style-pack="male_visual"]');
    await expect(blunt).toHaveAttribute('aria-pressed', 'false');
    await blunt.click();
    await visual.click();
    await expect(page.locator('#narrative-pack-status')).toContainText('已選 2 個');
    await page.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual(['male_visual', 'male_blunt']);
    const prompt = await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()));
    expect(prompt).toContain('直白粗獷');
    expect(prompt).toContain('視覺凝視取向');
    expect(prompt).toContain('不把拒絕或猶豫擅自改寫成同意');
    await expect(page.locator('#narrative-builder-summary')).toContainText('男性向 · 直白粗獷');

    await page.reload();
    await page.waitForFunction(() => window.BAONarrativeSettings);
    expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual(['male_visual', 'male_blunt']);
    await page.evaluate(() => BAONarrativeSettings.open());
    await expect(page.locator('[data-style-pack="male_blunt"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('[data-narrative-reset]').click();
    expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual([]);
    expect(await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()))).toBe('');
  });
}
