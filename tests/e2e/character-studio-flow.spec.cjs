const { test, expect } = require('@playwright/test');
test.use({ reducedMotion: 'reduce' });

test('character studio defaults to a focused creation flow and keeps the full workbench available', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudioFlow && window.BAOCharacterStudio));

  const flow = page.locator('#studio-flow-shell');
  const workspace = page.locator('.studio-flow-workspace');
  const panels = page.locator('[data-studio-flow-panel]');
  const doneEditing = page.getByRole('button', { name: '完成編輯' });

  await expect(flow).toBeVisible();
  await expect(panels).toHaveCount(6);
  await expect(page.locator('[data-studio-flow-panel="basic"]')).toBeVisible();
  await expect(page.locator('[data-studio-flow-panel="core"]')).toBeHidden();
  await expect(page.locator('.studio-phone-settings')).toBeHidden();
  await expect(page.locator('#studio-flow-progress')).toHaveText('必填 2/4 · 還有 2 項');

  const creationRoutes = page.locator('.studio-actions [data-creation-route]');
  await expect(creationRoutes).toHaveCount(5);
  await expect(creationRoutes).toHaveText(['＋ 角色作品', '＋ 世界作品', '故事開場', '世界書', '匯入作品']);
  await expect(flow.locator('[data-flow-step]')).toHaveCount(6);
  await expect(page.locator('.studio-heading .eyebrow')).toBeHidden();
  await expect(page.locator('.studio-heading p')).toBeHidden();

  const mobileLayout = await page.evaluate(() => {
    const nav = document.querySelector('.studio-flow-nav');
    const label = document.querySelector('.studio-flow-step b');
    const controls = document.querySelector('.studio-flow-controls');
    return {
      navOverflow: getComputedStyle(nav).overflowX,
      stepFont: parseFloat(getComputedStyle(label).fontSize),
      controlsHeight: controls.getBoundingClientRect().height,
      documentOverflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  expect(['auto', 'scroll']).toContain(mobileLayout.navOverflow);
  expect(mobileLayout.stepFont).toBeGreaterThanOrEqual(11);
  expect(mobileLayout.controlsHeight).toBeGreaterThanOrEqual(44);
  expect(mobileLayout.documentOverflow).toBeLessThanOrEqual(1);

  const allFields = page.getByRole('button', { name: '全部欄位' });
  await allFields.click();
  await expect(workspace).toHaveAttribute('data-show-all', 'true');
  await expect(panels).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) await expect(panels.nth(index)).toBeVisible();
  await expect(page.locator('[name="system_prompt"]')).toBeVisible();
  await expect(page.locator('.studio-flow-controls')).toBeHidden();
  await page.getByRole('button', { name: '專注模式' }).click();
  await expect(workspace).toHaveAttribute('data-show-all', 'false');
  await expect(page.locator('[data-studio-flow-panel="basic"]')).toBeVisible();
  await expect(page.locator('[data-studio-flow-panel="core"]')).toBeHidden();

  await page.getByRole('button', { name: '＋ 世界作品' }).click();
  await expect(page.locator('[name="mode"]')).toHaveValue('world');
  await page.getByRole('button', { name: '＋ 角色作品' }).click();
  await expect(page.locator('[name="mode"]')).toHaveValue('immersive');

  await page.locator('[data-creation-route="opening"]').click();
  await expect(flow.locator('[data-flow-step="opening"]')).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('[name="greeting"]')).toBeVisible();
  await expect(page.locator('[name="name"]')).toBeHidden();

  await page.locator('[data-creation-route="lorebook"]').click();
  await expect(page.locator('[data-studio-flow-panel="world"]')).toBeVisible();
  await expect(page.locator('.studio-advanced').first()).toHaveAttribute('open', '');
  await expect(page.locator('[name="lore"]')).toBeVisible();

  await flow.getByRole('button', { name: /基本資料/ }).click();
  const nameField = page.locator('[name="name"]');
  await nameField.focus();
  await expect(page.locator('.studio-editor')).toHaveClass(/studio-editing/);
  await expect(flow).toBeHidden();
  await expect(doneEditing).toBeVisible();
  await nameField.fill('雨港創作測試');
  await page.locator('[name="id"]').fill('studio-flow-rain-port');
  await doneEditing.click();
  await expect(flow).toBeVisible();

  await flow.getByRole('button', { name: /角色／世界核心/ }).click();
  await expect(page.locator('[name="system_prompt"]')).toBeVisible();
  await page.locator('[name="system_prompt"]').fill('角色依自己的資訊與動機行動。');
  await expect(doneEditing).toBeVisible();
  await doneEditing.click();

  await flow.getByRole('button', { name: /故事開場/ }).click();
  await page.locator('[name="greeting"]').fill('凌晨的港口仍有一盞燈。');
  await expect(doneEditing).toBeVisible();
  await doneEditing.click();

  await expect(page.locator('#studio-flow-progress')).toHaveText('必填 4/4 · 可以預覽與試玩');
  await expect(flow.locator('[data-flow-step="basic"]')).toHaveAttribute('data-state', 'complete');
  await expect(flow.locator('[data-flow-step="core"]')).toHaveAttribute('data-state', 'complete');
  await expect(flow.locator('[data-flow-step="opening"]')).toHaveAttribute('data-state', 'complete');
  await expect(flow.locator('[data-flow-step="finish"]')).toHaveAttribute('data-state', 'ready');

  await flow.getByRole('button', { name: /人物與世界/ }).click();
  await expect(page.locator('.studio-advanced').first()).toHaveAttribute('open', '');
  await page.locator('[name="world"]').fill('一座終年多雨的港口城市。');
  await expect(doneEditing).toBeVisible();
  await doneEditing.click();
  await expect(flow.locator('[data-flow-step="world"]')).toHaveAttribute('data-state', 'complete');

  await flow.getByRole('button', { name: /互動 UI/ }).click();
  await expect(page.locator('.studio-phone-settings')).toBeVisible();
  await expect(page.locator('[name="greeting"]')).toBeHidden();

  await flow.getByRole('button', { name: /預覽與完成/ }).click();
  await expect(page.locator('#studio-preview-button')).toBeVisible();
  await page.getByRole('button', { name: '預覽', exact: true }).click();
  await expect(page.locator('#studio-preview')).toBeVisible();
  await expect(page.locator('#studio-preview-name')).toHaveText('雨港創作測試');

  expect(await page.locator('[name="system_prompt"]').inputValue()).toContain('角色依自己的資訊');
  expect(await page.locator('[name="greeting"]').inputValue()).toContain('港口仍有一盞燈');
});

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 1280, height: 900 }]) {
  test(`review content stays in review and invalidates after editing at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('./character-studio.html');
    await page.waitForFunction(() => window.BAOCharacterStudioFlow && window.BAOCharacterStudioLifecycle);
    const flow = page.locator('#studio-flow-shell');
    const lifecycle = page.locator('#studio-lifecycle');
    const preview = page.locator('#studio-preview');
    await expect(lifecycle).toBeHidden();
    await expect(page.locator('#studio-drafts')).toContainText('角色作品');
    await expect(page.locator('.topbar nav a')).toHaveCount(1);
    await page.locator('[name="name"]').fill('旅程驗收作品');
    if (viewport.width <= 530) await page.getByRole('button', { name: '完成編輯' }).click();
    await flow.locator('[data-flow-step="finish"]').click();
    await expect(lifecycle).toBeVisible();
    await page.locator('#studio-preview-button').click();
    await expect(preview).toBeVisible();
    await expect(preview.locator('#studio-preview-name')).toHaveText('旅程驗收作品');
    await flow.locator('[data-flow-step="basic"]').click();
    await expect(preview).toBeHidden();
    await expect(lifecycle).toBeHidden();
    await page.locator('[name="name"]').fill('修改後的作品');
    if (viewport.width <= 530) await page.getByRole('button', { name: '完成編輯' }).click();
    await flow.locator('[data-flow-step="finish"]').click();
    await expect(preview).toBeHidden();
    await page.locator('#studio-preview-button').click();
    await expect(preview.locator('#studio-preview-name')).toHaveText('修改後的作品');
    await flow.getByRole('button', { name: '全部欄位', exact: true }).click();
    await expect(lifecycle).toBeVisible();
    await page.locator('[name="name"]').fill('全部欄位中的修改');
    await expect(preview).toBeHidden();
    if (viewport.width <= 530) await page.getByRole('button', { name: '完成編輯' }).click();
    await flow.getByRole('button', { name: '專注模式', exact: true }).click();
    await expect(lifecycle).toBeHidden();
    const rail = await page.locator('.studio-flow-nav').boundingBox();
    const current = await flow.locator('[aria-current="step"]').boundingBox();
    expect(current.x).toBeGreaterThanOrEqual(rail.x - 1);
    expect(current.x + current.width).toBeLessThanOrEqual(rail.x + rail.width + 1);
    if (viewport.width <= 530) {
      const mode = flow.locator('[data-studio-flow-all]');
      expect((await mode.boundingBox()).height).toBeGreaterThanOrEqual(44);
      expect((await flow.locator('[data-flow-step="basic"]').boundingBox()).height).toBeGreaterThanOrEqual(44);
    }
    if (viewport.height <= 600) {
      expect(await flow.evaluate(node => getComputedStyle(node).position)).toBe('static');
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    await page.screenshot({ path: `test-results/studio-journey-${viewport.width}.png`, fullPage: false });
  });
}


test('deferred step focus cannot override a later manual edit', async ({page}) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudioFlow);
  const result=await page.evaluate(async()=>{
    const flow=BAOCharacterStudioFlow;
    flow.go('finish',true);
    flow.setShowAll(true);
    const input=document.querySelector('[name="name"]');input.focus();
    await new Promise(resolve=>setTimeout(resolve,300));
    flow.setShowAll(false);
    return {focus:document.activeElement===input,step:document.querySelector('[aria-current="step"]').dataset.flowStep,reviewHidden:document.querySelector('[data-studio-flow-panel="finish"]').hidden};
  });
  expect(result).toEqual({focus:true,step:'basic',reviewHidden:true});
});
