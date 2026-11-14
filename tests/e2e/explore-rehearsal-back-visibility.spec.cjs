const { test, expect } = require('@playwright/test');

// This small focused suite also runs in Firefox and WebKit PR smoke checks.
// It verifies the real computed style, tab reachability, and both view intents.
for (const viewport of [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 }
]) {
  test('Explore hides author return in player preview and shows it in rehearsal at ' + viewport.width + 'px', async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./');
    await page.waitForFunction(() => Boolean(window.BAOExploreDiscovery && App.characters?.length));
    await page.evaluate(() => App.showView('explore'));

    const card = page.locator('#character-list [data-character-id="night-sky-magic-academy"]');
    await expect(card).toBeVisible();
    await card.locator('.character-image-wrap').click();

    const preview = page.locator('#explore-work-preview');
    const back = preview.locator('[data-explore-rehearsal-back]');
    await expect(preview).toBeVisible();
    await expect(back).toHaveAttribute('hidden', '');
    await expect(back).toHaveCSS('display', 'none');
    await expect(back).toBeHidden();
    await expect(preview.getByRole('link', { name: '返回創作室' })).toHaveCount(0);
    await expect(preview.getByRole('button', { name: '查看作品' })).toBeVisible();

    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab');
      expect(await back.evaluate(node => document.activeElement === node)).toBe(false);
    }

    await preview.getByRole('button', { name: '繼續瀏覽' }).click();
    await expect(preview).toBeHidden();

    // Match the existing rehearsalTarget() query contract on this work ID.
    // The full Studio -> persisted local work -> preview route is covered by
    // character-studio-rehearsal.spec.cjs in the existing Chromium PR suite.
    await page.evaluate(() => history.replaceState(null, '', '?work=night-sky-magic-academy&rehearsal=1'));
    await card.locator('.character-image-wrap').click();

    await expect(preview).toBeVisible();
    await expect(back).not.toHaveAttribute('hidden', '');
    await expect(back).toBeVisible();
    await expect(back).toHaveCSS('display', 'inline-flex');
    await expect(preview.getByRole('button', { name: '進入試演設定' })).toBeVisible();
    await back.click();
    await page.waitForURL(/character-studio\.html(?:$|[?#])/);
  });
}
