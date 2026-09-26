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
  await page.waitForFunction(() => Boolean(window.BAOStorySurface));
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await expect(page.locator('#bao-immersive-toggle')).toBeHidden();
  await expect(page.locator('#bao-surface-mode-toggle')).toBeVisible();
  await expect(page.locator('#chat-view .chat-title-copy .eyebrow')).toContainText('包包夜讀書房');
  await expect(page.locator('#user-input')).toHaveAttribute('placeholder', '寫下你的下一句…');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-reading-background', 'image');
  const readingBackground = await page.locator('#chat-view').evaluate(node => ({
    image: node.style.getPropertyValue('--chat-bg-image'),
    opacity: node.style.getPropertyValue('--chat-bg-opacity'),
    blur: node.style.getPropertyValue('--chat-bg-blur')
  }));
  expect(readingBackground.image).toContain('url(');
  expect(readingBackground.opacity).toBe('0.34');
  expect(readingBackground.blur).toBe('6px');
  const backdropOpacity = await page.locator('#chat-view .chat-main').evaluate(node => getComputedStyle(node, '::before').opacity);
  expect(Number(backdropOpacity)).toBeGreaterThan(0.3);
  const streamBackground = await page.locator('#chat-stream').evaluate(node => getComputedStyle(node).backgroundColor);
  expect(streamBackground).not.toBe('rgb(8, 10, 16)');
}

for (const width of [320, 390, 900, 1280]) {
  test(`reading and tools ${width}px keep one mode control and preserve the story`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.addInitScript(() => {
      localStorage.setItem('bao-lab:story-surface-v1', 'studio');
      localStorage.setItem('bao-lab:immersive-reading', 'true');
    });
    await openDemoStory(page);
    const before = await page.evaluate(() => JSON.stringify(Chat.messages));
    await expect(page.locator('#chat-view .usage-bar')).toBeHidden();
    await expect(page.locator('#bao-immersive-toggle, #bao-immersive-exit')).toHaveCount(0);
    await page.locator('#bao-play-status-toggle').click();
    await expect(page.locator('#game-ui')).toBeVisible();
    await expect(page.locator('#bao-play-status-toggle')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('.ui-tab[data-panel="status"]').click();
    await expect(page.locator('#ui-panel .state-grid')).toBeVisible();
    await page.locator('#bao-play-status-close').click();
    await expect(page.locator('#game-ui')).toBeHidden();
    await expect(page.locator('#bao-play-status-toggle')).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#bao-surface-mode-toggle').click();
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
    await expect(page.locator('#user-input')).toHaveAttribute('placeholder', '輸入你的行動或台詞…');
    if (width < 1081) {
      const drawer = page.locator('#bao-chat-tool-drawer');
      await expect(drawer).toBeVisible();
      // A render refresh must not toggle the mobile tools closed or recreate it.
      await page.evaluate(() => { BAOStorySurface.sync(); BAOStorySurface.sync(); });
      await expect(drawer).toBeVisible();
      await drawer.getByRole('button', { name: '關閉 ×' }).click();
      await expect(drawer).toHaveCount(0);
    } else {
      await expect(page.locator('#chat-view .usage-bar')).toBeVisible();
    }
    await page.locator('#bao-surface-mode-toggle').click();
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    await expect(page.locator('#user-input')).toHaveAttribute('placeholder', '寫下你的下一句…');
    await expect(page.locator('#bao-surface-mode-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#chat-view .usage-bar')).toBeHidden();
    await expect(page.locator('#chat-stream')).toBeVisible();
    await expect(page.locator('#user-input')).toBeVisible();
    await expect(page.locator('#game-ui')).toBeHidden();
    await page.locator('#user-input').scrollIntoViewIfNeeded();
    const size = await page.evaluate(() => {
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      const composer = document.querySelector('#chat-view .composer').getBoundingClientRect();
      const toggle = document.getElementById('bao-surface-mode-toggle').getBoundingClientRect();
      const status = document.getElementById('bao-play-status-toggle').getBoundingClientRect();
      return { stream: stream.height, composerTop: composer.top, toggleLeft: toggle.left, statusRight: status.right, toggleRight: toggle.right, pageWidth: document.documentElement.scrollWidth, width: innerWidth };
    });
    expect(size.stream).toBeGreaterThan(100);
    expect(size.composerTop).toBeGreaterThan(0);
    expect(size.statusRight).toBeLessThanOrEqual(size.toggleLeft);
    expect(size.toggleRight).toBeLessThanOrEqual(size.width + 1);
    expect(size.pageWidth).toBeLessThanOrEqual(size.width + 1);
    expect(await page.evaluate(() => JSON.stringify(Chat.messages))).toBe(before);
    await page.evaluate(() => { BAOStorySurface.setMode('studio'); App.showView('home'); App.showView('chat'); });
    await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
    await expect(page.locator('#bao-chat-tool-drawer')).toHaveCount(0);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.BAOStorySurface));
    expect(await page.evaluate(() => window.BAOStorySurface.mode)).toBe('play');
  });
}

test('bookshelf links the active chapter to the existing restore flow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStory(page);
  await page.evaluate(async () => { App.saveStory(false); await BAOStoryLibrary.flush(); App.showView('home'); });
  await expect(page.locator('#home-local-story')).toBeVisible();
  await expect(page.locator('#home-local-story-name')).toContainText('林沉風');
  await expect(page.locator('#home-resume-story')).toBeVisible();
  await expect(page.locator('.topbar nav [data-open-story-library]')).toHaveText('我的故事');
  await page.evaluate(() => BAOStoryTools.openLibrary());
  const shelf = page.locator('.story-library-shell');
  await expect(shelf).toBeVisible();
  await expect(shelf.locator('.bao-shelf-enhanced')).toHaveCount(1);
  await expect(shelf.locator('.bao-shelf-cover')).toHaveCount(1);
  await expect(shelf.locator('.bao-shelf-progress')).toContainText('上次閱讀：第一章');
  await expect(shelf.getByRole('heading', { name: '我的故事' })).toBeVisible();
  await expect(shelf.locator('.bao-shelf-toolbar')).toBeVisible();
  const search = shelf.locator('.bao-shelf-search input');
  await search.fill('不存在的故事');
  await expect(shelf.locator('.bao-shelf-count')).toHaveText('找到 0 本');
  await expect(shelf.locator('.bao-shelf-empty')).toHaveAttribute('data-visible', 'true');
  await search.fill('林沉風');
  await expect(shelf.locator('.bao-shelf-count')).toHaveText('找到 1 本');
  const continueButton = shelf.getByRole('button', { name: '繼續閱讀 →' });
  await expect(continueButton).toBeVisible();
  await continueButton.click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await expect(page.locator('#user-input')).toBeVisible();
});
