const { test, expect } = require('@playwright/test');

test('Host Club Simulator renders generated cast, setup and economy UI', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.some(c => c.id === 'host-club-simulator') && Storage.status().ready, null, { timeout: 15000 });

  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator('article.character-card').filter({ hasText: '牛郎模擬器' });
  await expect(card).toBeVisible();
  await card.click();

  await expect(page.locator('.hostsim-detail')).toBeVisible();
  await expect(page.locator('.hostsim-cast-grid .hostsim-card')).toHaveCount(6);
  await expect(page.locator('.hostsim-card').filter({hasText:'REN'})).toBeVisible();
  await expect(page.locator('.hostsim-card').filter({hasText:'HARU'})).toBeVisible();
  await expect(page.locator('.hostsim-card').filter({hasText:'REI'})).toBeVisible();
  await expect(page.locator('.hostsim-card').filter({hasText:'SENA'})).toBeVisible();
  await expect(page.locator('.hostsim-card').filter({hasText:'KYO'})).toBeVisible();
  await expect(page.locator('.hostsim-card').filter({hasText:'NAGI'})).toBeVisible();

  await page.locator('[data-hostsim-start]').click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  await expect(page.locator('#hostsim-player-setup')).toHaveCount(1);

  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#hostsim-age').fill('27');
  await page.locator('#hostsim-role').selectOption('customer');
  await page.locator('#hostsim-money').selectOption('normal');
  await page.locator('#hostsim-reason').fill('朋友推薦，想知道牛郎店到底在賣什麼。');

  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();

  await expect(page.locator('.bao-structured-opening.bao-opening-hostsim')).toBeVisible();
  await expect(page.locator('.bao-opening-choice')).toHaveCount(4);

  await page.waitForFunction(() => Boolean(window.BAOWorldModules), null, { timeout: 15000 });
  await page.locator('.ui-tab[data-panel="status"]').click();
  await expect(page.locator('.hostsim-status-shell')).toBeVisible();
  await expect(page.locator('.hostsim-money-row')).toContainText('¥350,000');
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('暫無');

  const setup = await page.evaluate(() => App.config.hostsimSetup);
  expect(setup.age).toBe(27);
  expect(setup.role).toBe('customer');
  expect(setup.economy).toBe('normal');
});
