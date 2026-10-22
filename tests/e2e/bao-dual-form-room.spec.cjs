const { test, expect } = require('@playwright/test');

test('mascot entry opens the dual-form room and keeps controls and frames in sync', async ({ page }) => {
  await page.goto('/bao-mascot.html');
  await page.getByRole('link', { name: '進入雙型態互動室：變身、表情與聊天 →' }).click();
  await expect(page).toHaveURL(/\/bao-room\/$/);
  await page.locator('[data-form="human"]').click();
  await expect(page.locator('#state-label')).toContainText('人類型態');
  await expect(page.locator('[data-form="human"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-mood="2"]').click();
  await expect(page.locator('#sprite')).toHaveCSS('background-position', '100% 0%');
  await page.locator('#reading').check();
  await expect(page.locator('#character')).toBeHidden();
  await page.locator('#restore').click();
  await expect(page.locator('#character')).toBeVisible();
  await expect(page.locator('#reading')).not.toBeChecked();
});

test('mobile room stays within viewport, preserves literal input and reduces motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/bao-room/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await expect(page.locator('#reduce')).toBeChecked();
  await expect(page.locator('#sprite')).toHaveCSS('animation-name', 'none');
  const payload = '<img src=x onerror=alert(1)>';
  await page.locator('#message').fill(payload);
  await page.getByRole('button', { name: '送出 ↗' }).click();
  await expect(page.locator('#chatlog')).toContainText(payload);
  await expect(page.locator('#chatlog img')).toHaveCount(0);
  await expect(page.locator('#bubble')).toContainText('還沒有接上 AI');
  await page.getByRole('button', { name: '我想讀故事', exact: true }).click();
  await expect(page.locator('#character')).toBeHidden();
  await page.getByRole('button', { name: '說聲晚安', exact: true }).click();
  await expect(page.locator('#character')).toBeVisible();
  await expect(page.locator('#state-label')).toContainText('睡覺中');
});

test('both transparent sprite sheets load and the room sends no chat requests', async ({ page }) => {
  const requests = [];
  page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
  await page.goto('/bao-room/');
  for (const name of ['bun', 'human']) {
    const response = await page.request.get('/bao-room/assets/' + name + '.png');
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('image/png');
    await page.locator('[data-form="' + name + '"]').click();
    await page.locator('#character').click();
  }
  await page.getByRole('button', { name: '兩種型態？', exact: true }).click();
  await expect(page.locator('#chatlog')).toContainText('未來會共用');
  expect(requests).toEqual([]);
});
