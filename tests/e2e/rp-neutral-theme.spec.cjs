const { test, expect } = require('@playwright/test');

const originalViolet = 'rgb(156, 140, 255)';
const readBackground = locator => locator.evaluate(el => ({
  color: getComputedStyle(el).backgroundColor,
  image: getComputedStyle(el).backgroundImage
}));
const waitForOriginalTheme = page => page.waitForFunction(() => {
  const sheets = [...document.styleSheets].map(sheet => sheet.href || '');
  return sheets.some(href => href.includes('bao-brand-v2.css?v=original-violet-mint-1')) &&
    sheets.some(href => href.includes('explore-zones.css?v=original-violet-mint-1')) &&
    sheets.some(href => href.includes('bao-mascot.css?v=original-violet-mint-1'));
});

for (const width of [390, 1440]) {
  test(`original BAO/LAB violet and mint survive on ${width}px RP UI`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOQuickSetup && App.characters?.length);
    await waitForOriginalTheme(page);
    await expect(page.locator('#home-view .brand-hero')).toBeVisible();
    await expect(page.locator('#home-view #bao-home-portrait')).toBeVisible();

    // The 2026-09-13 original theme: near-black, purple CTA, mint accent.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('#9c8cff');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim())).toBe('#5dd6c0');
    expect((await readBackground(page.locator('.brand-actions .brand-first-run'))).image).toContain(originalViolet);
    expect((await readBackground(page.locator('#bao-home-portrait'))).color).toBe('rgb(29, 34, 48)');

    // A character's category must not turn the 'start story' button pink or red.
    for (const category of ['female', 'r18']) {
      await page.evaluate(category => {
        const base = App.characters.find(c => c.id !== 'autonomous-npc-world');
        if (!base) throw new Error('Ordinary character missing');
        const id = `visual-theme-${category}`;
        if (!App.characters.some(c => c.id === id)) App.characters.push({ ...base, id, category, rating: category === 'r18' ? 'adult' : 'general' });
        App.openCharacter(id);
      }, category);
      await expect(page.locator('#detail-start')).toBeVisible();
      const start = await readBackground(page.locator('#detail-start'));
      expect(start.image).toContain(originalViolet);
      expect(start.image).not.toContain('rgb(199, 106, 184)');
      expect(start.image).not.toContain('rgb(182, 59, 83)');
    }

    await page.locator('#detail-start').click();
    await expect(page.locator('#bao-setup-choice')).toBeVisible();
    await expect(page.locator('#start-story')).toBeVisible();
    expect((await readBackground(page.locator('#start-story'))).image).toContain(originalViolet);
    await page.locator('#api-key').fill('visual-only-not-a-real-api-key');
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    expect((await readBackground(page.locator('#chat-view .chat-stream'))).color).toBe('rgb(12, 15, 21)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('Bao mascot controls are dark while the mascot image stays intact', async ({ page }) => {
  await page.goto('./');
  await waitForOriginalTheme(page);
  await expect(page.locator('#bao-home-portrait img')).toBeVisible();
  await expect(page.locator('.bao-mascot-launch')).toBeVisible();
  expect((await readBackground(page.locator('.bao-mascot-launch'))).color).toBe('rgb(29, 34, 48)');
  await page.locator('.bao-mascot-launch').click();
  await expect(page.locator('.bao-mascot-panel')).toBeVisible();
  expect((await readBackground(page.locator('.bao-mascot-panel'))).color).toBe('rgb(17, 20, 27)');
});
