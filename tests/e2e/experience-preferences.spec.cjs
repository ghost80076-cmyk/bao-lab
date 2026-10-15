const { test, expect } = require('@playwright/test');

test('desktop: theme and experience mode persist without changing story state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience);
  await expect(page.locator('#yoru-experience-open')).toBeVisible();
  const before = await page.evaluate(() => ({
    story: localStorage.getItem('bao-lab:current-story'),
    api: localStorage.getItem('bao-lab:api')
  }));
  await page.locator('#yoru-experience-open').click();
  const modal = page.locator('#yoru-experience-dialog');
  await expect(modal).toBeVisible();
  await modal.locator('label[data-exp-theme="mist"]').click();
  await modal.locator('.yoru-exp-levels label').nth(2).click();
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','mist');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-experience','pro');
  await expect.poll(() => page.locator('html').evaluate(el =>
    getComputedStyle(el).getPropertyValue('--yoru-night').trim())).toBe('#f5f0e9');
  await modal.getByRole('button', { name: '完成' }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.YoruExperience);
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','mist');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-experience','pro');
  const after = await page.evaluate(() => ({
    story: localStorage.getItem('bao-lab:current-story'),
    api: localStorage.getItem('bao-lab:api')
  }));
  expect(after).toEqual(before);
});

test('mobile: new preference dialog is reachable, scrollable and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience);
  const entry = page.locator('#yoru-experience-open');
  await expect(entry).toBeVisible();
  await entry.click();
  const dialog = page.locator('#yoru-experience-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('label[data-exp-theme="rose"]').click();
  await dialog.locator('.yoru-exp-levels label').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','rose');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-experience','easy');
  const sizes = await page.evaluate(() => {
    const rect = document.querySelector('#yoru-experience-dialog').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: innerWidth };
  });
  expect(sizes.left).toBeGreaterThanOrEqual(0);
  expect(sizes.right).toBeLessThanOrEqual(sizes.width+1);
  await dialog.getByRole('button', { name: '完成' }).click();
  await expect(dialog).not.toBeVisible();
});
