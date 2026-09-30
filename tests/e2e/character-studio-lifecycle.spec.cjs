const { test, expect } = require('@playwright/test');

test('character studio separates draft, local test version and public lifecycle state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(
    window.BAOCharacterStudioLifecycle &&
    window.BAOCharacterStudio &&
    window.CharacterEngine
  ));

  const lifecycle = page.locator('#studio-lifecycle');
  await expect(lifecycle).toBeVisible();
  await expect(lifecycle).toContainText('作品生命週期');
  await expect(lifecycle.locator('[data-lifecycle-stage]')).toHaveCount(4);
  await expect(lifecycle.locator('[data-lifecycle-stage="publication"]')).toContainText('尚未上架');

  await page.locator('[name="name"]').fill('生命週期測試作品');
  await page.locator('[name="id"]').fill('creator-lifecycle-e2e');
  await page.locator('[name="description"]').fill('測試創作者工作台的作品狀態。');
  await page.locator('[name="system_prompt"]').fill('角色依自己的資訊與目標行動，不替玩家做決定。');
  await page.locator('[name="greeting"]').fill('夜裡的港口還亮著最後一盞燈，你剛走進門。');

  await expect(lifecycle.locator('[data-lifecycle-stage="draft"]')).toContainText('尚未儲存修改');
  await expect(lifecycle.locator('[data-lifecycle-stage="test"]')).toContainText('尚未加入我的角色');

  await page.getByRole('button', { name: '儲存草稿' }).click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="draft"] [data-lifecycle-value]').textContent())
    .toBe('草稿已儲存');

  await page.getByRole('button', { name: '加入我的角色' }).click();
  await expect(page.locator('#studio-status')).toContainText('已加入這台裝置的角色庫');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="test"] [data-lifecycle-value]').textContent())
    .toBe('本機試玩版本已同步');
  await expect(page.getByRole('button', { name: '更新我的角色' })).toBeVisible();

  await page.locator('[name="system_prompt"]').fill('更新後：角色依自己的資訊、目標與場景限制行動，不替玩家做決定。');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="test"] [data-lifecycle-value]').textContent())
    .toBe('本機試玩版本較舊');
  await expect(lifecycle.locator('[data-lifecycle-stage="draft"]')).toContainText('尚未儲存修改');

  await page.getByRole('button', { name: '儲存草稿' }).click();
  await expect.poll(() => lifecycle.locator('[data-lifecycle-next-label]').textContent())
    .toBe('更新本機試玩版本');
  await lifecycle.locator('[data-lifecycle-next-action]').click();

  await expect(page.locator('#studio-status')).toContainText('已加入這台裝置的角色庫');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="test"] [data-lifecycle-value]').textContent())
    .toBe('本機試玩版本已同步');

  const box = await lifecycle.boundingBox();
  expect(box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

test('known public IDs are labeled as public without pretending the draft was published here', async ({ page }) => {
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudioLifecycle));

  await page.locator('[name="id"]').fill('linchenfeng');
  await expect.poll(
    () => page.locator('#studio-lifecycle [data-lifecycle-stage="publication"] [data-lifecycle-value]').textContent(),
    { timeout: 10000 }
  ).toBe('已在公開作品庫');
  await expect(page.locator('#studio-lifecycle')).toContainText('公開作品');
});
