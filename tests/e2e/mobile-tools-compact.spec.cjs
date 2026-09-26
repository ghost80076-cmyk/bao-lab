const { test, expect } = require('@playwright/test');

for (const width of [375, 390]) {
  test(`mobile ${width}px: compact story tools stay inside the mobile header`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && Storage.status().ready, null, { timeout: 15000 });
    await page.locator('#home-view [data-view="explore"]').click();
    await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#model-id').fill('compact-tools-test');
    await page.locator('#base-url').fill('https://example.invalid/v1');
    await page.locator('#api-key').fill('EPHEMERAL_TEST_KEY');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);

    const arrow = page.locator('#chat-view .chat-topline > #bao-mobile-tools-tab');
    await expect(arrow).toBeVisible();
    await expect(arrow).toHaveAttribute('aria-label', '開啟或關閉故事功能表');
    const geometry = await page.evaluate(() => {
      const tab = document.getElementById('bao-mobile-tools-tab').getBoundingClientRect();
      const header = document.querySelector('#chat-view .chat-topline').getBoundingClientRect();
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      return {
        viewport: innerWidth,
        tab: { top: tab.top, bottom: tab.bottom, left: tab.left, right: tab.right, width: tab.width, height: tab.height },
        header: { top: header.top, bottom: header.bottom },
        streamTop: stream.top
      };
    });
    expect(geometry.tab.width).toBeLessThanOrEqual(44);
    expect(geometry.tab.height).toBeLessThanOrEqual(44);
    expect(geometry.tab.top).toBeGreaterThanOrEqual(geometry.header.top - 1);
    expect(geometry.tab.bottom).toBeLessThanOrEqual(geometry.header.bottom + 1);
    expect(geometry.header.bottom).toBeLessThanOrEqual(geometry.streamTop + 1);
    expect(geometry.tab.left).toBeGreaterThanOrEqual(0);
    expect(geometry.tab.right).toBeLessThanOrEqual(geometry.viewport + 1);
    await arrow.click();
    await expect(page.locator('#bao-chat-tool-drawer')).toBeVisible();
    await expect(page.locator('#bao-chat-tool-drawer')).toContainText('API／切換模型');
  });
}
