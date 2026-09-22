const { test, expect } = require('@playwright/test');

test.use({ viewport: { width: 390, height: 844 } });

test('MOD editor and controls remain usable on a narrow screen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '探索角色' }).click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOModPacks))).toBe(true);

  const group = page.locator('[data-chat-tool-group="world"]');
  await expect(group).toBeAttached();
  if (!await group.evaluate(node => node.open)) await group.locator('summary').click();
  await group.locator('[data-open-world-manager]').click();
  await expect(page.locator('.world-manager-backdrop')).toBeVisible();
  await page.locator('[data-world-add]').click();
  const card = page.locator('.world-custom-card').last();
  await card.locator('[data-custom-prop="label"]').fill('手機模組');
  await card.locator('[data-mod-add]').click();
  await card.locator('[data-mod-prop="key"]').fill('mobile_note');
  await card.locator('[data-mod-prop="defaultRaw"]').fill('手機測試');

  const geometry = await page.evaluate(() => {
    const modal = document.querySelector('.world-manager-modal').getBoundingClientRect();
    const fields = document.querySelector('.bao-mod-fields').getBoundingClientRect();
    return { viewport: innerWidth, modalLeft: modal.left, modalRight: modal.right, fieldsRight: fields.right };
  });
  expect(geometry.modalLeft).toBeGreaterThanOrEqual(-1);
  expect(geometry.modalRight).toBeLessThanOrEqual(geometry.viewport + 1);
  expect(geometry.fieldsRight).toBeLessThanOrEqual(geometry.viewport + 1);
  await expect(page.locator('[data-mod-export]')).toBeVisible();
  await expect(page.locator('[data-mod-import]')).toBeVisible();
  await page.locator('[data-world-save]').click();
  await expect.poll(() => page.evaluate(() => GameState.current.modules.custom_module?.mobile_note)).toBe('手機測試');
});
