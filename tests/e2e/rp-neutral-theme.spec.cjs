const { test, expect } = require('@playwright/test');

const readBackground = locator => locator.evaluate(el => ({
  color: getComputedStyle(el).backgroundColor,
  image: getComputedStyle(el).backgroundImage
}));
const waitForBrandTheme = page => page.waitForFunction(() => {
  const sheets = [...document.styleSheets].map(sheet => sheet.href || '');
  return sheets.some(href => href.includes('/css/bao-brand-v2.css')) &&
    sheets.some(href => href.includes('/css/explore-zones.css')) &&
    sheets.some(href => href.includes('/css/bao-mascot.css'));
});

for (const width of [390, 1440]) {
  test(`YoruBay night harbor and lamplight stay consistent on ${width}px RP UI`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOQuickSetup && App.characters?.length);
    await waitForBrandTheme(page);
    await expect(page.locator('#home-view .brand-hero')).toBeVisible();
    await expect(page.locator('#home-view #bao-home-portrait')).toBeVisible();

    // Brand System 2.0 intentionally uses lamplight as the primary UI accent,
    // retaining muted violet for the secondary atmosphere and dark tools.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary').trim())).toBe('#d6aa73');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim())).toBe('#efc77f');
    expect((await readBackground(page.locator('.brand-actions .brand-first-run'))).color).toBe('rgba(52, 38, 31, 0.58)');
    expect((await readBackground(page.locator('#bao-home-portrait'))).color).toBe('rgba(0, 0, 0, 0)');

    // A character's category must not turn the 'start story' button pink or red.
    let categoryStart;
    for (const category of ['female', 'r18']) {
      await page.evaluate(async category => {
        const entry = App.characters.find(c => c.id !== 'autonomous-npc-world');
        if (!entry) throw new Error('Ordinary character missing');
        const base = await App.loadCharacter(entry.id);
        App.activeCharacter = { ...base, id: `visual-theme-${category}`, category, rating: category === 'r18' ? 'adult' : 'general' };
        App.renderDetail();
        App.showView('detail');
      }, category);
      await expect(page.locator('#detail-start')).toBeVisible();
      const start = await readBackground(page.locator('#detail-start'));
      if (categoryStart) expect(start).toEqual(categoryStart);
      else categoryStart = start;
      expect(start.image).not.toContain('rgb(199, 106, 184)');
      expect(start.image).not.toContain('rgb(182, 59, 83)');
    }

    await page.locator('#detail-start').click();
    await expect(page.locator('#bao-setup-choice')).toBeVisible();
    await expect(page.locator('#start-story')).toBeVisible();
    const builderStart = await readBackground(page.locator('#start-story'));
    expect(builderStart.image).not.toContain('rgb(199, 106, 184)');
    expect(builderStart.image).not.toContain('rgb(182, 59, 83)');
    await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#bao-demo-mode').check();
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--yoru-reading').trim())).toBe('#13161a');
    expect((await readBackground(page.locator('#chat-view .chat-stream'))).color).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('Bao mascot controls are dark while the mascot image stays intact', async ({ page }) => {
  await page.goto('./');
  await waitForBrandTheme(page);
  await expect(page.locator('#bao-home-portrait .bao-character')).toBeVisible();
  await expect(page.locator('.bao-mascot-launch')).toBeVisible();
  expect((await readBackground(page.locator('.bao-mascot-launch'))).color).toBe('rgba(0, 0, 0, 0)');
  await page.locator('.bao-mascot-launch').click();
  await expect(page.locator('.bao-mascot-panel')).toBeVisible();
  expect((await readBackground(page.locator('.bao-mascot-panel'))).color).toBe('rgb(17, 20, 27)');
});
