const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOMobileReadingLayout))).toBe(true);
  await expect(page.locator('#user-input')).toBeVisible();
}

for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
  test(`mobile ${viewport.width}px reading remains usable and tools open from left`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDemoStory(page);
    const tab = page.locator('#bao-mobile-tools-tab');
    await expect(tab).toBeVisible();
    const exit = page.getByRole('button', { name: '離開故事' });
    await expect(exit).toBeVisible();
    await expect(page.locator('#bao-mobile-support')).toHaveCount(0);
    await expect(page.locator('#bao-chat-tool-shortcuts')).toBeHidden();
    await expect(page.locator('#bao-chat-api-toolbar')).toBeHidden();
    const boxes = await page.evaluate(() => {
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      const composer = document.querySelector('#chat-view .composer').getBoundingClientRect();
      return { stream: stream.height, composerTop: composer.top, composerBottom: composer.bottom,
        pageWidth: document.documentElement.scrollWidth, viewport: innerWidth, screenHeight: innerHeight };
    });
    expect(boxes.stream).toBeGreaterThan(150);
    expect(boxes.composerTop).toBeGreaterThan(0);
    expect(boxes.composerBottom).toBeLessThanOrEqual(boxes.screenHeight + 2);
    expect(boxes.pageWidth).toBeLessThanOrEqual(boxes.viewport + 1);

    await tab.click();
    await expect(page.getByRole('dialog', { name: '故事功能選單' })).toBeVisible();
    await expect(page.getByRole('link', { name: /投餵肉包/ })).toBeVisible();
    await expect(tab).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'API／切換模型' })).toBeVisible();
    await page.getByRole('button', { name: 'API／切換模型' }).click();
    await expect(page.getByRole('heading', { name: '目前故事的 AI 連線設定' })).toBeVisible();
    await page.locator('[data-api-close]').click();

    await tab.click();
    await page.getByRole('button', { name: '◈ 世界狀態' }).click();
    await expect(page.locator('#bao-reading-status')).toHaveClass(/is-open/);
    await page.locator('.bao-status-close').click();
    await tab.click();
    await page.getByRole('button', { name: '人物／事件／記憶' }).click();
    await expect(page.locator('#game-ui')).toBeVisible();
    await tab.click();
    await page.getByRole('button', { name: '人物／事件／記憶' }).click();
    await expect(page.locator('#game-ui')).toBeHidden();

    await page.locator('#user-input').fill('手機版閱讀測試');
    await page.locator('#chat-view .composer [data-send-message]').click();
    await expect(page.locator('#chat-stream .message.assistant[data-message-index]').last()).toBeVisible();
    const actions = page.locator('#chat-stream .message.assistant[data-message-index]').last().locator('.story-message-tools');
    await expect(actions.locator('[data-edit]')).toBeVisible();
    await expect(actions.locator('[data-rewrite]')).toBeVisible();
    await expect(actions.locator('[data-regenerate]')).toBeVisible();
    await expect(actions.locator('[data-create-branch]')).toHaveCount(1);
    await expect(actions.locator('[data-story-rollback]')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

test('desktop keeps the original full-size tools and reading columns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openDemoStory(page);
  await expect(page.locator('#bao-mobile-tools-tab')).toBeHidden();
  await expect(page.locator('#bao-mobile-exit')).toBeHidden();
  await expect(page.locator('#bao-chat-api-toolbar')).toBeVisible();
  await expect(page.locator('#bao-reading-status-toggle')).toBeVisible();
  await expect(page.locator('#user-input')).toBeVisible();
});

test('mobile exit asks first, then leaves through the existing auto-save flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStory(page);
  const exit = page.getByRole('button', { name: '離開故事' });
  page.once('dialog', dialog => dialog.dismiss());
  await exit.click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  page.once('dialog', dialog => dialog.accept());
  await exit.click();
  await expect(page.locator('#detail-view')).toHaveClass(/active/);
  await expect.poll(() => page.evaluate(() => Boolean(Storage.loadStory()))).toBe(true);
});
