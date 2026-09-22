const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOMobileReadingLayout))).toBe(true);
  await expect(page.locator('#user-input')).toBeVisible();
}

async function assertReadingGeometry(page) {
  const boxes = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect();
    const view = rect('#chat-view');
    const header = rect('.topbar');
    const main = rect('#chat-view .chat-main');
    const stream = rect('#chat-stream');
    const composer = rect('#chat-view .composer');
    const tab = rect('#bao-mobile-tools-tab');
    return {
      screenHeight: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      screenWidth: innerWidth,
      viewTop: view.top, viewBottom: view.bottom,
      headerBottom: header.bottom,
      mainHeight: main.height,
      streamTop: stream.top, streamBottom: stream.bottom, streamHeight: stream.height,
      composerTop: composer.top, composerBottom: composer.bottom,
      tabTop: tab.top, tabBottom: tab.bottom
    };
  });
  expect(Math.abs(boxes.viewTop - boxes.headerBottom)).toBeLessThanOrEqual(3);
  expect(Math.abs(boxes.viewBottom - boxes.screenHeight)).toBeLessThanOrEqual(4);
  expect(boxes.mainHeight).toBeGreaterThan(boxes.screenHeight * 0.5);
  expect(boxes.streamHeight).toBeGreaterThan(145);
  expect(Math.abs(boxes.streamBottom - boxes.composerTop)).toBeLessThanOrEqual(4);
  expect(Math.abs(boxes.composerBottom - boxes.screenHeight)).toBeLessThanOrEqual(4);
  expect(boxes.tabTop).toBeGreaterThanOrEqual(0);
  expect(boxes.tabBottom).toBeLessThanOrEqual(boxes.screenHeight);
  expect(boxes.scrollWidth).toBeLessThanOrEqual(boxes.screenWidth + 1);
}

for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }, { width: 320, height: 568 }]) {
  test(`mobile ${viewport.width}x${viewport.height}: reading fills screen and composer returns to bottom`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openDemoStory(page);
    await assertReadingGeometry(page);
    await page.locator('#user-input').focus();
    await page.locator('#user-input').fill('測試鍵盤收合後排版');
    await page.locator('#user-input').blur();
    await page.evaluate(() => window.BAOMobileReadingLayout.sync());
    await expect.poll(() => page.evaluate(() => document.getElementById('chat-view').style.getPropertyValue('--bao-mobile-viewport-height'))).toBe('100dvh');
    await assertReadingGeometry(page);
  });
}
