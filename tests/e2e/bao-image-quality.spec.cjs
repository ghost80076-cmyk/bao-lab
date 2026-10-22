const { test, expect } = require('@playwright/test');

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`introduction uses approved sprites in the main stage at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/bao-mascot.html');
    const stage = page.locator('.bao-native-stage');
    await expect(stage).toBeVisible();
    await expect(stage.locator('img')).toHaveCount(0);
    await expect(stage.locator('.bao-quality-note')).toHaveCount(0);
    await page.locator('[data-bao-page-form=human]').click();
    await expect(stage.locator('.bao-character-frame')).toHaveCSS('background-image', /bao-room\/assets\/human\.png/);
    expect((await page.locator('#bao-page-character').boundingBox()).width).toBeGreaterThan(250);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });

  test(`homepage uses approved sprites in both original positions at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const entry = page.locator('#bao-home-portrait');
    await expect(entry).toBeVisible();
    await expect(entry.locator('img')).toHaveCount(0);
    await expect(entry.locator('.bao-character-frame')).toHaveCSS('background-image', /bao-room\/assets\/bun\.png/);
    await expect(page.locator('#home-closing .bao-character')).toHaveCount(1);
    await expect(page.locator('#home-closing img')).toHaveCount(0);
    await page.locator('#bao-mascot-launch').click();
    await page.locator('#bao-mascot-transform').click();
    await expect(entry.locator('.bao-character')).toHaveAttribute('data-bao-form', 'human');
    await page.locator('#bao-mascot-motion').click();
    await expect(entry.locator('.bao-character-frame')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('#home-closing .bao-character-frame')).toHaveCSS('animation-name', 'none');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
