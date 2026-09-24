const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await page.locator('#home-view button[data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i += 1) await page.locator('#next-step').click();
  await page.locator('#bao-demo-mode').check();
  await page.locator('#next-step').click();
  await page.locator('#start-story').click();
  await expect(page.locator('#user-input')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.BAOStorySurface && window.BAOImmersiveReader));
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await expect(page.locator('#bao-immersive-toggle')).toBeHidden();
  await expect(page.locator('#bao-surface-mode-toggle')).toBeVisible();
}

for (const width of [320, 390, 1280]) {
  test(`immersive reading ${width}px keeps story text and composer usable`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await openDemoStory(page);
    const before = await page.evaluate(() => JSON.stringify(Chat.messages));
    await page.locator('#bao-surface-mode-toggle').click();
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
    if (width <= 820) {
      const drawer = page.locator('#bao-chat-tool-drawer');
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: '關閉 ×' }).click();
      await expect(drawer).toHaveCount(0);
    }
    const button = page.locator('#bao-immersive-toggle');
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveText('退出閱讀');
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chat-stream')).toBeVisible();
    await expect(page.locator('#user-input')).toBeVisible();
    await expect(page.locator('#game-ui')).toBeHidden();
    const size = await page.evaluate(() => {
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      const composer = document.querySelector('#chat-view .composer').getBoundingClientRect();
      const toggle = document.getElementById('bao-immersive-toggle').getBoundingClientRect();
      return { stream: stream.height, composerTop: composer.top, composerBottom: composer.bottom, toggleRight: toggle.right, pageWidth: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight };
    });
    expect(size.stream).toBeGreaterThan(100);
    expect(size.composerTop).toBeGreaterThan(0);
    expect(size.composerBottom).toBeLessThanOrEqual(size.height + 2);
    expect(size.toggleRight).toBeLessThanOrEqual(size.width + 1);
    expect(size.pageWidth).toBeLessThanOrEqual(size.width + 1);
    await button.click();
    await expect(button).toHaveText('沉浸閱讀');
    await expect(button).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#bao-surface-mode-toggle').click();
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    await expect(button).toBeHidden();
    expect(await page.evaluate(() => JSON.stringify(Chat.messages))).toBe(before);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(window.BAOImmersiveReader && window.BAOStorySurface))).toBe(true);
    expect(await page.evaluate(() => window.BAOImmersiveReader.enabled)).toBe(false);
    expect(await page.evaluate(() => window.BAOStorySurface.mode)).toBe('play');
  });
}

test('bookshelf links the active chapter to the existing restore flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStory(page);
  await page.evaluate(async () => { App.saveStory(false); await BAOStoryLibrary.flush(); });
  await expect(page.locator('.topbar nav [data-open-story-library]')).toHaveText('我的故事');
  await page.evaluate(() => BAOStoryTools.openLibrary());
  const shelf = page.locator('.story-library-shell');
  await expect(shelf).toBeVisible();
  await expect(shelf.locator('.bao-shelf-enhanced')).toHaveCount(1);
  await expect(shelf.locator('.bao-shelf-cover')).toHaveCount(1);
  await expect(shelf.locator('.bao-shelf-progress')).toContainText('上次遊玩：第一章');
  await expect(shelf.getByRole('heading', { name: '我的故事' })).toBeVisible();
  const continueButton = shelf.getByRole('button', { name: '繼續故事' });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await expect(page.locator('#user-input')).toBeVisible();
});
