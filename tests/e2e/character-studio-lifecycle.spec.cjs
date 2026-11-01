const { test, expect } = require('@playwright/test');

test('character studio separates draft, local test version and public lifecycle state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(
    window.BAOCharacterStudioLifecycle &&
    window.BAOCharacterStudio &&
    window.BAOCharacterStudioFlow &&
    window.CharacterEngine
  ));
  await page.getByRole('button', { name: '全部欄位' }).click();

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

  await page.locator('#studio-save-draft').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="draft"] [data-lifecycle-value]').textContent())
    .toBe('草稿已儲存');
  const draftCard = page.locator('.studio-draft-row[data-draft-id] .studio-draft');
  await expect(draftCard.locator('.studio-draft-status')).toHaveText(['草稿']);

  await page.locator('#studio-install').click();
  await expect(page.locator('#studio-status')).toContainText('已加入這台裝置的角色庫');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="test"] [data-lifecycle-value]').textContent())
    .toBe('本機試玩版本已同步');
  await expect(draftCard.locator('.studio-draft-status')).toHaveText(['草稿', '本機已同步']);
  await expect(page.locator('#studio-install')).toBeVisible();

  await page.locator('[name="system_prompt"]').fill('更新後：角色依自己的資訊、目標與場景限制行動，不替玩家做決定。');
  await expect.poll(() => lifecycle.locator('[data-lifecycle-stage="test"] [data-lifecycle-value]').textContent())
    .toBe('本機試玩版本較舊');
  await expect(lifecycle.locator('[data-lifecycle-stage="draft"]')).toContainText('尚未儲存修改');

  await page.locator('#studio-save-draft').click();
  await expect(draftCard.locator('.studio-draft-status')).toHaveText(['草稿', '本機待更新']);
  await expect.poll(() => lifecycle.locator('[data-lifecycle-next-label]').textContent())
    .toBe('更新本機試玩版本');
  const nextAction = lifecycle.locator('[data-lifecycle-next-action]');
  await expect(nextAction).toHaveAttribute('data-lifecycle-action', 'install');
  page.once('dialog', dialog => dialog.accept());
  await nextAction.click();

  await expect.poll(
    () => page.evaluate(() => CharacterEngine.loadCustom()
      .find(item => item.id === 'creator-lifecycle-e2e')?.system_prompt || ''),
    { timeout: 12000 }
  ).toContain('更新後');
  await expect.poll(
    () => lifecycle.locator('[data-lifecycle-stage="test"] [data-lifecycle-value]').textContent(),
    { timeout: 12000 }
  ).toBe('本機試玩版本已同步');

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
  await page.locator('[data-flow-step="finish"]').click();
  await expect(page.locator('#studio-lifecycle')).toContainText('公開作品');
});

test('draft archive is reversible and does not delete the draft immediately', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudioLifecycle && window.BAOCharacterStudio && window.BAOCharacterStudioFlow));
  await page.getByRole('button', { name: '全部欄位' }).click();

  await page.locator('[name="name"]').fill('封存測試作品');
  await page.locator('[name="id"]').fill('creator-archive-e2e');
  await page.locator('[name="system_prompt"]').fill('角色依自己的資訊與動機行動。');
  await page.locator('[name="greeting"]').fill('港口的燈亮了。');
  await page.locator('#studio-save-draft').click();

  const archive = page.getByRole('button', { name: '封存草稿 封存測試作品' });
  page.once('dialog', dialog => dialog.accept());
  await archive.click();
  await expect(page.locator('#studio-status')).toContainText('草稿已封存');
  await expect(page.locator('#studio-drafts .studio-draft-row')).toHaveCount(0);
  await expect(page.locator('#studio-toggle-archived')).toHaveText('查看封存 (1)');

  await page.locator('#studio-toggle-archived').click();
  const archived = page.locator('#studio-drafts .studio-draft-row');
  await expect(archived).toHaveCount(1);
  await expect(archived.locator('.studio-draft-status')).toContainText('已封存');
  await archived.getByRole('button', { name: '還原草稿 封存測試作品' }).click();
  await expect(page.locator('#studio-status')).toContainText('草稿已還原');
  await expect(page.locator('#studio-toggle-archived')).toHaveText('查看封存 (0)');
  await expect(page.locator('#studio-drafts .studio-draft')).toContainText('封存測試作品');
});


for (const width of [320, 390]) {
  test(`creator mobile review and draft actions remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:width === 320 ? 568 : 844 });
    await page.goto('./character-studio.html');
    await page.waitForFunction(() => Boolean(
      window.BAOCharacterStudioLifecycle && window.BAOCharacterStudioFlow && window.BAOCharacterStudio
    ));
    await expect(page.locator('link[href^="css/character-studio.css?"]')).toHaveCount(1);
    await expect(page.locator('link[href="css/character-studio-lifecycle.css?v=2"]')).toHaveCount(1);
    await page.getByRole('button', { name:'全部欄位' }).click();
    const lifecycle = page.locator('#studio-lifecycle');
    await expect(lifecycle).toBeVisible();
    await expect(lifecycle.locator('.studio-lifecycle-stages article')).toHaveCount(4);

    const layout = await lifecycle.evaluate(node => {
      const stages = node.querySelector('.studio-lifecycle-stages');
      const boxes = [...stages.querySelectorAll('article')].map(item => {
        const rect = item.getBoundingClientRect();
        return { x:rect.x, y:rect.y, right:rect.right, width:rect.width };
      });
      const summaries = [...node.querySelectorAll('details > summary')].map(item => ({
        height:item.getBoundingClientRect().height,
        display:getComputedStyle(item).display
      }));
      return { columns:getComputedStyle(stages).gridTemplateColumns.split(' ').length, boxes, summaries };
    });
    expect(layout.columns).toBe(2);
    expect(layout.boxes[0].y).toBeCloseTo(layout.boxes[1].y, 0);
    expect(layout.boxes[2].y).toBeGreaterThan(layout.boxes[0].y);
    expect(layout.boxes.every(box => box.width > 100 && box.right <= width + 1)).toBe(true);
    expect(layout.summaries.every(item => item.height >= 44 && item.display === 'list-item')).toBe(true);

    await page.locator('#studio-publication-guide > summary').click();
    await expect(page.locator('#studio-publication-guide')).toHaveAttribute('open', '');
    await page.locator('#studio-publication-guide > summary').click();

    await page.locator('[name="name"]').fill('手機草稿操作驗收');
    await page.locator('[name="id"]').fill('creator-mobile-review-' + width);
    await page.locator('[name="system_prompt"]').fill('角色依自己的資訊和目標行動，不代演玩家。');
    await page.locator('[name="greeting"]').fill('清晨的碼頭還亮著一盞燈。');
    const next = lifecycle.locator('[data-lifecycle-next-action]');
    await expect(next).toBeVisible();
    expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await page.locator('#studio-save-draft').click();
    await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
    const archive = page.getByRole('button', { name:'封存草稿 手機草稿操作驗收' });
    await expect(archive).toBeVisible();
    expect((await archive.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await archive.evaluate(node => parseFloat(getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
    page.once('dialog', dialog => dialog.accept());
    await archive.click();
    await expect(page.locator('#studio-status')).toContainText('草稿已封存');
    const archivedToggle = page.locator('#studio-toggle-archived');
    expect((await archivedToggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await archivedToggle.click();
    const restore = page.getByRole('button', { name:'還原草稿 手機草稿操作驗收' });
    const permanent = page.getByRole('button', { name:'永久刪除 手機草稿操作驗收' });
    await expect(restore).toBeVisible();
    expect((await restore.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect((await permanent.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await restore.click();
    await expect(page.locator('#studio-status')).toContainText('草稿已還原');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await page.screenshot({ path:`test-results/creator-mobile-review-${width}.png`, animations:'disabled' });
  });
}
