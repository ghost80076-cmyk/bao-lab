const { test, expect } = require('@playwright/test');

test('home has one continue action; the same topbar action returns on other pages', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryEntryVisibility && window.App && App.characters?.length));
  await expect(page.locator('#home-view')).toHaveClass(/active/);
  await expect(page.locator('#continue-story')).toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#continue-story').evaluate(node => node.style.display)).toBe('none');
  // No click handler, save payload or API setting is replaced by the visibility helper.
  await page.evaluate(() => App.showView('explore'));
  await expect(page.locator('#continue-story')).not.toHaveAttribute('aria-hidden', 'true');
  expect(await page.locator('#continue-story').evaluate(node => node.style.display)).toBe('');
  await page.evaluate(() => App.showView('home'));
  await expect(page.locator('#continue-story')).toHaveAttribute('aria-hidden', 'true');
});
