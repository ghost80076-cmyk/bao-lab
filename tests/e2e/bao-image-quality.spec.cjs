const { test, expect } = require('@playwright/test');

for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
  test(`mascot introduction avoids enlarging thumbnail artwork at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/bao-mascot.html');
    const stage = page.locator('.bao-mascot-page .visual');
    const portrait = stage.locator('img.human');
    await expect.poll(() => portrait.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const native = await portrait.evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
    if (native.width < 640 || native.height < 800) {
      await expect(stage).toHaveClass(/bao-image-lowres/);
      await expect(stage.locator('img.bun')).toBeVisible();
      await expect(stage.locator('.bao-quality-note')).toContainText('低解析預覽');
      expect((await portrait.boundingBox()).width).toBeLessThanOrEqual(96);
    } else {
      await expect(stage).not.toHaveClass(/bao-image-lowres/);
    }
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewport.width);
  });

  test(`homepage uses vector mascot when the portrait is only a thumbnail at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const card = page.locator('#bao-home-portrait');
    await expect(card).toBeVisible();
    const portrait = card.locator('img:not(.bao-portrait-bun)');
    await expect.poll(() => portrait.evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const native = await portrait.evaluate(img => ({ width: img.naturalWidth, height: img.naturalHeight }));
    if (native.width < 640 || native.height < 800) {
      await expect(card).toHaveClass(/bao-image-lowres/);
      await expect(card.locator('img.bao-portrait-bun')).toBeVisible();
      expect((await portrait.boundingBox()).width).toBeLessThanOrEqual(88);
      expect((await portrait.boundingBox()).height).toBeLessThanOrEqual(117);
    } else {
      await expect(card).not.toHaveClass(/bao-image-lowres/);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}

test('full resolution artwork restores human hero without SVG fallback', async ({ page }) => {
  await page.route('**/assets/bao-human-v2.webp', route => route.fulfill({
    status: 200,
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="1280" viewBox="0 0 960 1280"><rect width="960" height="1280" fill="#efc4db"/></svg>'
  }));
  await page.goto('/bao-mascot.html');
  const stage = page.locator('.bao-mascot-page .visual');
  await expect.poll(() => stage.locator('img.human').evaluate(img => img.naturalWidth)).toBe(960);
  await expect(stage).not.toHaveClass(/bao-image-lowres/);
  await expect(stage.locator('.bao-quality-note')).toBeHidden();
});
