const { test, expect } = require('@playwright/test');

for (const width of [375, 390]) {
  test(`mobile ${width}px: compact tool arrow sits above composer without covering story`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && Storage.status().ready, null, { timeout: 15000 });
    await page.getByRole('button', { name: '探索角色' }).click();
    await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#model-id').fill('compact-tools-test');
    await page.locator('#base-url').fill('https://example.invalid/v1');
    await page.locator('#api-key').fill('EPHEMERAL_TEST_KEY');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);

    const arrow = page.locator('#chat-view .chat-main > #bao-mobile-tools-tab');
    await expect(arrow).toBeVisible();
    await expect(arrow).toHaveAttribute('aria-label', '開啟或關閉故事功能表');
    const geometry = await page.evaluate(() => {
      const tab = document.getElementById('bao-mobile-tools-tab').getBoundingClientRect();
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      const composer = document.querySelector('#chat-view .composer').getBoundingClientRect();
      return { tab: { top: tab.top, bottom: tab.bottom, width: tab.width, height: tab.height },
        streamBottom: stream.bottom, composerTop: composer.top };
    });
    expect(geometry.tab.width).toBeLessThanOrEqual(40);
    expect(geometry.tab.height).toBeLessThanOrEqual(36);
    expect(geometry.streamBottom).toBeLessThanOrEqual(geometry.tab.top + 1);
    expect(geometry.tab.bottom).toBeLessThanOrEqual(geometry.composerTop + 1);
    await arrow.click();
    await expect(page.locator('#bao-chat-tool-drawer')).toBeVisible();
    await expect(page.locator('#bao-chat-tool-drawer')).toContainText('API／切換模型');
  });
}
