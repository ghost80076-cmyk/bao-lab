const { test, expect } = require('@playwright/test');

// UI-only admin checks: never send credentials or mutations to production.
// The network responses below are synthetic and stay inside Playwright routes.
for (const width of [320, 390, 1280]) {
  test(`admin workbench shortcuts, roster keyboard scroll and safe selection at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
    const calls = [];
    await page.route('https://api.yorubay.com/**', async route => {
      const request = route.request();
      const pathname = new URL(request.url()).pathname;
      calls.push({ method: request.method(), pathname });
      const payload = pathname === '/admin/players'
        ? { players:[{
          id: 'synthetic-player-1', public_id:'YR-1111-2222',
          username:'harbor-demo', display_name:'測試玩家',
          enabled:1, wallet_enabled:1, wallet_balance_usd:5,
          created_at:'2026-10-31T10:00:00Z'
        }] }
        : pathname === '/admin/provider-control'
          ? { providers:[], routes:[] }
          : { error:'not_found' };
      await route.fulfill({
        status: pathname === '/admin/players' || pathname === '/admin/provider-control' ? 200 : 404,
        contentType:'application/json',
        headers:{'access-control-allow-origin':'*'},
        body: JSON.stringify(payload)
      });
    });
    await page.goto('./admin-wallet.html');
    const nav = page.getByRole('navigation', { name:'管理頁快速導覽' });
    await expect(nav).toBeVisible();
    for (const [label,target] of [
      ['管理員登入','admin-login'],
      ['玩家查詢','admin-players'],
      ['點數加值','admin-topup'],
      ['作品上架','character-publish-admin'],
      ['使用統計','admin-usage-signals']
    ]) {
      await expect(nav.getByRole('link', { name: label })).toHaveAttribute('href', '#' + target);
      await expect(page.locator('#' + target)).toBeAttached();
    }
    await expect(page.locator('#admin-jump-provider')).toBeHidden();
    for (const id of ['connect-message', 'player-message', 'topup-message', 'publish-message']) {
      await expect(page.locator('#' + id)).toHaveAttribute('role','status');
      await expect(page.locator('#' + id)).toHaveAttribute('aria-live','polite');
    }
    const initialWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(initialWidth).toBeLessThanOrEqual(width + 1);
    const shortcuts = await nav.evaluate(node => ({
      client:node.clientWidth, scroll:node.scrollWidth,
      linkHeight:node.querySelector('a').getBoundingClientRect().height
    }));
    expect(shortcuts.linkHeight).toBeGreaterThanOrEqual(44);
    if (width <= 390) expect(shortcuts.scroll).toBeGreaterThan(shortcuts.client);

    await nav.getByRole('link', { name:'作品上架' }).click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#character-publish-admin');
    await expect(page.locator('#character-publish-admin')).toBeVisible();
    await expect(page.locator('#character-publish-admin > p.note').first()).toContainText('角色卡創作室');
    await page.locator('#admin-token').fill('synthetic-token-not-a-secret');
    await page.getByRole('button', { name:'驗證並載入玩家' }).click();
    await expect(page.locator('#connect-message')).toContainText('驗證成功');
    await expect(page.locator('#player-list-area')).toBeVisible();
    await expect(page.locator('#admin-jump-provider')).toBeVisible();
    await expect(page.locator('#provider-control-card')).toBeVisible();

    const roster = page.locator('#player-list-area .player-list-scroll');
    await expect(roster).toHaveAttribute('tabindex','0');
    await expect(roster).toHaveAttribute('aria-describedby','player-list-scroll-tip');
    await expect(roster).toHaveAttribute('aria-label', /玩家列表/);
    if (width <= 390) await expect(page.locator('#player-list-scroll-tip')).toBeVisible();
    const controls = roster.locator('tbody .player-actions button');
    await expect(controls).toHaveCount(3);
    for (const button of await controls.all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    if (width <= 390) {
      const dims = await roster.evaluate(el => ({client:el.clientWidth,scroll:el.scrollWidth}));
      expect(dims.scroll).toBeGreaterThan(dims.client);
      await roster.focus();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => roster.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    }
    await controls.first().click();
    await expect(page.locator('#player-card')).toBeVisible();
    await expect(page.locator('#p-user')).toHaveText('harbor-demo');
    await expect(page.locator('#player-message')).toContainText('已選取');
    expect(calls.every(call => call.method === 'GET')).toBe(true);
    expect(calls.map(call=>call.pathname)).toEqual(['/admin/players','/admin/provider-control']);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    await page.screenshot({ path:`test-results/admin-workbench-${width}.png`, animations:'disabled' });
  });
}
