const { test, expect } = require('@playwright/test');

test('character studio exposes a mobile-friendly creation flow without hiding the existing form', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudioFlow && window.BAOCharacterStudio));

  const flow = page.locator('#studio-flow-shell');
  await expect(flow).toBeVisible();
  await expect(flow.locator('[data-flow-step]')).toHaveCount(6);
  await expect(page.locator('#studio-flow-progress')).toHaveText('必填 2/4 · 還有 2 項');
  await expect(page.locator('.studio-heading .eyebrow')).toBeHidden();
  await expect(page.locator('.studio-heading p')).toBeHidden();

  const mobileDensity = await page.evaluate(() => {
    const flow = document.getElementById('studio-flow-shell').getBoundingClientRect();
    const actions = [...document.querySelectorAll('.studio-actions button')].map(button => button.getBoundingClientRect());
    const drafts = document.querySelector('.studio-drafts');
    return {
      flowHeight: flow.height,
      actionsSameRow: actions.length >= 2 && Math.abs(actions[0].top - actions[1].top) <= 2,
      draftsOverflowX: getComputedStyle(drafts).overflowX
    };
  });
  expect(mobileDensity.flowHeight).toBeLessThanOrEqual(100);
  expect(mobileDensity.actionsSameRow).toBe(true);
  expect(['auto', 'scroll']).toContain(mobileDensity.draftsOverflowX);

  const nameField = page.locator('[name="name"]');
  await nameField.focus();
  await expect(page.locator('.studio-editor')).toHaveClass(/studio-editing/);
  await expect(flow).toBeHidden();
  const doneEditing = page.getByRole('button', { name: '完成編輯' });
  await expect(doneEditing).toBeVisible();
  await doneEditing.click();
  await expect(page.locator('.studio-editor')).not.toHaveClass(/studio-editing/);
  await expect(flow).toBeVisible();

  const navBox = await flow.locator('.studio-flow-nav').evaluate(node => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    overflowX: getComputedStyle(node).overflowX
  }));
  expect(navBox.scrollWidth).toBeGreaterThan(navBox.clientWidth);
  expect(['auto', 'scroll']).toContain(navBox.overflowX);

  await flow.getByRole('button', { name: /故事開場/ }).click();
  await expect(flow.locator('[data-flow-step="opening"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('[name="greeting"]')).toBeVisible();

  await page.locator('[name="name"]').fill('雨港創作測試');
  await page.locator('[name="id"]').fill('studio-flow-rain-port');
  await page.locator('[name="system_prompt"]').fill('角色依自己的資訊與動機行動。');
  await page.locator('[name="greeting"]').fill('凌晨的港口仍有一盞燈。');

  await expect(page.locator('#studio-flow-progress')).toHaveText('必填 4/4 · 可以預覽與試玩');
  await expect(flow.locator('[data-flow-step="basic"]')).toHaveAttribute('data-state', 'complete');
  await expect(flow.locator('[data-flow-step="core"]')).toHaveAttribute('data-state', 'complete');
  await expect(flow.locator('[data-flow-step="opening"]')).toHaveAttribute('data-state', 'complete');
  await expect(flow.locator('[data-flow-step="finish"]')).toHaveAttribute('data-state', 'ready');
  await expect(doneEditing).toBeVisible();
  await doneEditing.click();
  await expect(flow).toBeVisible();

  await flow.getByRole('button', { name: /人物與世界/ }).click();
  await expect(page.locator('.studio-advanced').first()).toHaveAttribute('open', '');
  await page.locator('[name="world"]').fill('一座終年多雨的港口城市。');
  await expect(flow.locator('[data-flow-step="world"]')).toHaveAttribute('data-state', 'complete');
  await expect(doneEditing).toBeVisible();
  await doneEditing.click();
  await expect(flow).toBeVisible();

  await flow.getByRole('button', { name: /預覽與完成/ }).click();
  await page.getByRole('button', { name: '預覽', exact: true }).click();
  await expect(page.locator('#studio-preview')).toBeVisible();
  await expect(page.locator('#studio-preview-name')).toHaveText('雨港創作測試');

  expect(await page.locator('[name="system_prompt"]').inputValue()).toContain('角色依自己的資訊');
  expect(await page.locator('[name="greeting"]').inputValue()).toContain('港口仍有一盞燈');
});
