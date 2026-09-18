const { test, expect } = require('@playwright/test');

test('scene gallery switches templates without modifying narration', async ({ page }) => {
  await page.goto('/scene-module-gallery.html');
  const story = page.locator('#story');
  await story.fill('原始敘事\n角色：「你好。」');
  await page.locator('#type').selectOption('romance');
  await expect(page.locator('#scene')).toHaveAttribute('data-type', 'romance');
  await expect(page.locator('#body')).toHaveText('原始敘事\n角色：「你好。」');
  await page.locator('#mode').selectOption('plain');
  await expect(page.locator('#scene')).toHaveClass(/plain/);
  await expect(page.locator('#body')).toHaveText('原始敘事\n角色：「你好。」');
});

test('narration is text, not executable markup', async ({ page }) => {
  await page.goto('/scene-module-gallery.html');
  await page.locator('#story').fill('<img src=x onerror="window.sceneInjected=true">');
  await expect(page.locator('#body')).toHaveText('<img src=x onerror="window.sceneInjected=true">');
  await expect(page.locator('#body img')).toHaveCount(0);
  expect(await page.evaluate(() => window.sceneInjected)).toBeUndefined();
});
