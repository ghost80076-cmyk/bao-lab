const { test, expect } = require('@playwright/test');

test('Host Club Simulator renders generated cast, setup and economy UI', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.some(c => c.id === 'host-club-simulator') && Storage.status().ready, null, { timeout: 15000 });

  await page.locator('#home-view [data-view="explore"]').click();
  await page.getByRole('button', { name: '男性' }).click();
  const card = page.locator('article.character-card').filter({ hasText: '牛郎模擬器' });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();

  await expect(page.locator('.hostsim-detail')).toBeVisible();
  await expect(page.locator('.hostsim-cast-grid .hostsim-card')).toHaveCount(6);
  const heroImage = page.locator('.hostsim-hero-portrait img');
  await expect(heroImage).toHaveAttribute('src', /hostsim-hero-v2\.webp/);
  await expect.poll(() => heroImage.evaluate(img => img.naturalWidth)).toBeGreaterThanOrEqual(1600);
  const castImages = page.locator('.hostsim-card-photo');
  await expect(castImages).toHaveCount(6);
  await expect(castImages.first()).toHaveAttribute('src', /hostsim-ren-portrait-v3\.webp/);
  await expect.poll(() => castImages.first().evaluate(img => img.naturalWidth)).toBeGreaterThanOrEqual(1100);
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
  await page.locator('#hostsim-money').selectOption('comfortable');
  await page.locator('#hostsim-reason').fill('朋友推薦，想知道牛郎店到底在賣什麼。');

  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#api-advanced-settings > summary').click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();

  await expect(page.locator('.bao-structured-opening.bao-opening-hostsim')).toBeVisible();
  await expect(page.locator('.bao-opening-choice')).toHaveCount(4);
  await expect(page.locator('.hostsim-opening-cast figure')).toHaveCount(6);
  await expect(page.locator('.hostsim-opening-photo').first()).toHaveAttribute('src', /hostsim-ren-portrait-v3\.webp/);

  await page.waitForFunction(() => Boolean(window.BAOWorldModules), null, { timeout: 15000 });
  await page.locator('#bao-play-status-toggle').click();
  await page.getByRole('button', { name: '狀態', exact: true }).click();
  await expect(page.locator('.hostsim-status-shell')).toBeVisible();
  await page.waitForFunction(() => GameState.current?.hostsimInitializedVersion === 2);
  await expect(page.locator('.hostsim-money-row')).toContainText('¥900,000');
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('暫無');

  const setup = await page.evaluate(() => ({
    setup: App.config.hostsimSetup,
    income: GameState.current.modules.work_life.monthly_income,
    ren: GameState.current.characterStatuses.REN
  }));
  expect(setup.setup.age).toBe(27);
  expect(setup.setup.role).toBe('customer');
  expect(setup.setup.economy).toBe('comfortable');
  expect(setup.income).toBe(550000);
  expect(setup.ren.affection).toBe(0);
  expect(setup.ren.visits).toBe(0);

  await page.evaluate(() => {
    GameState.current.modules.host_relation = { host: 'REN', stage: '担当候選' };
    Object.assign(GameState.current.characterStatuses.REN, {
      importance: 48, affection: 37, dependency: 12, guard: 9, visits: 2, spend: 80000, stage: '担当候選'
    });
    App.renderUIPanel('status');
  });
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('REN');
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('48');
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('37');
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('2 次');
  await expect(page.locator('.hostsim-status-card.relation')).toContainText('¥80,000');

  await page.evaluate(() => {
    Chat.add('assistant', '今晚的初回輪桌告一段落。\n\nA. 再點 REN 坐十分鐘。\nB. 先結帳回家。\nC. 問內勤 HARU 明天有沒有班。\nD. 自由輸入');
    window.BAOHostSimUI.mountTurnChoices();
  });
  await expect(page.locator('#hostsim-turn-choices button')).toHaveCount(4);
  await page.locator('#hostsim-turn-choices button[data-hostsim-choice="A"]').click();
  await expect(page.locator('#user-input')).toHaveValue('再點 REN 坐十分鐘。');
});
