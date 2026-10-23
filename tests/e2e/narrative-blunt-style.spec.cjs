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
    const modal = page.getByRole('dialog', { name: '今晚的故事' });
    await expect(modal).toBeVisible();
    await modal.locator('.tonight-advanced summary').click();
    if (width === 390) {
      await expect(modal.locator('.bao-modal-head .eyebrow')).toBeHidden();
      const help = modal.getByRole('button', { name: '敘事設定說明' });
      await expect(help).toBeVisible();
      const firstCopy = modal.locator('.bao-setting-section').first().locator(':scope > p');
      await expect(firstCopy).toBeHidden();
      const layout = await modal.evaluate(node => ({
        packColumns: getComputedStyle(node.querySelector('.narrative-pack-grid')).gridTemplateColumns.trim().split(/\s+/).length,
        selectColumns: getComputedStyle(node.querySelector('.narrative-select-grid')).gridTemplateColumns.trim().split(/\s+/).length,
        footerPosition: getComputedStyle(node.querySelector('.bao-modal-footer')).position
      }));
      expect(layout).toEqual({ packColumns: 2, selectColumns: 2, footerPosition: 'sticky' });
      await help.click();
      await expect(firstCopy).toBeVisible();
      await expect(modal.locator('.narrative-select-grid small').first()).toBeVisible();
      await help.click();
      await expect(firstCopy).toBeHidden();
    }
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
    await page.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual([]);
    expect(await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()))).toBe('');
  });
}

test('realist subtext style is visible, composable, persisted and resettable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAONarrativeSettings && document.getElementById('chat-view'));
  await page.evaluate(() => BAONarrativeSettings.set({ stylePacks: [] }));
  await page.evaluate(() => BAONarrativeSettings.open());
  const modal = page.getByRole('dialog', { name: '今晚的故事' });
  await modal.locator('.tonight-advanced summary').click();

  const realist = modal.locator('[data-style-pack="realist_subtext"]');
  const natural = modal.locator('[data-style-pack="natural"]');
  await expect(realist).toContainText('寫實留白 · 細膩敘事');
  await expect(realist).toHaveAttribute('aria-pressed', 'false');
  await realist.click();
  await natural.click();
  await expect(modal.locator('#narrative-pack-status')).toContainText('已選 2 個');
  await modal.locator('[data-narrative-save]').click();

  expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual(['natural', 'realist_subtext']);
  const prompt = await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()));
  expect(prompt).toContain('採寫實留白的敘事方式');
  expect(prompt).toContain('自然口語');

  await page.reload();
  await page.waitForFunction(() => window.BAONarrativeSettings);
  await page.evaluate(() => BAONarrativeSettings.open());
  await expect(page.locator('[data-style-pack="realist_subtext"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-narrative-reset]').click();
    await page.locator('[data-narrative-save]').click();
  expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual([]);
  expect(await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()))).toBe('');
});
