const { test, expect } = require('@playwright/test');

for (const width of [375, 390]) {
  test(`mobile ${width}px: compact story tools stay inside the mobile header`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/');
    await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && Storage.status().ready, null, { timeout: 15000 });
    await page.locator('#home-view [data-view="explore"]').click();
    await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
    await page.getByRole('button', { name: '查看作品', exact: true }).click();
    await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
    for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#api-advanced-settings > summary').click();
    await page.locator('#model-id').fill('compact-tools-test');
    await page.locator('#base-url').fill('https://example.invalid/v1');
    await page.locator('#api-key').fill('EPHEMERAL_TEST_KEY');
    await page.getByRole('button', { name: '下一步' }).click();
    await page.locator('#start-story').click();
    await expect(page.locator('#chat-view')).toHaveClass(/active/);
    await expect(page.locator('#bao-play-status-toggle')).toHaveText('資訊');
    await expect(page.locator('#bao-play-status-toggle')).toHaveAttribute('aria-label', '查看人物、事件與作品資訊');
    await expect(page.locator('#bao-surface-mode-toggle')).toBeHidden();
    await expect(page.locator('#bao-mobile-status')).toHaveCount(0);
    await expect(page.locator('#bao-mobile-memory')).toHaveCount(0);
    await expect(page.locator('#bao-mobile-support')).toHaveCount(0);
    await expect(page.locator('#bao-mobile-tools-tab')).toHaveCount(0);

    const composerTools = page.locator('#bao-mobile-composer-tools');
    await expect(composerTools).toBeVisible();
    const geometry = await page.evaluate(() => {
      const tools = document.getElementById('bao-mobile-composer-tools').getBoundingClientRect();
      const header = document.querySelector('#chat-view .chat-topline').getBoundingClientRect();
      const surface = document.getElementById('bao-surface-controls').getBoundingClientRect();
      const stream = document.getElementById('chat-stream').getBoundingClientRect();
      return {
        viewport: innerWidth,
        tools: { left: tools.left, right: tools.right, width: tools.width, height: tools.height },
        header: { top: header.top, bottom: header.bottom },
        surface: { left: surface.left, right: surface.right, top: surface.top, bottom: surface.bottom },
        streamTop: stream.top
      };
    });
    expect(geometry.tools.width).toBeLessThanOrEqual(44);
    expect(geometry.tools.height).toBeLessThanOrEqual(54);
    expect(geometry.tools.left).toBeGreaterThanOrEqual(0);
    expect(geometry.tools.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.surface.top).toBeGreaterThanOrEqual(geometry.header.top - 1);
    expect(geometry.surface.bottom).toBeLessThanOrEqual(geometry.header.bottom + 1);
    expect(geometry.header.bottom).toBeLessThanOrEqual(geometry.streamTop + 1);
    expect(geometry.surface.right).toBeLessThanOrEqual(geometry.viewport + 1);
    await composerTools.click();
    await expect(page.locator('#bao-chat-tool-drawer')).toBeVisible();
    await expect(page.locator('#bao-chat-tool-drawer')).toContainText('API／切換模型');

    await page.locator('#bao-chat-tool-drawer header').getByRole('button', { name: '關閉 ×', exact: true }).click();
    await expect(page.locator('#bao-chat-tool-drawer')).toHaveCount(0);

    const panelClose = page.locator('#bao-mobile-panel-close');
    const chatMain = page.locator('#chat-view .chat-main');

    await composerTools.click();
    await page.getByRole('button', { name: '🧠 記憶' }).click();
    await expect(chatMain).toHaveClass(/bao-mobile-panel-open/);
    await expect(page.locator('#chat-view .ui-tab[data-panel="memory"]')).toHaveClass(/active/);
    await expect(panelClose).toBeVisible();
    await expect(panelClose).toHaveAttribute('aria-label', '收起人物、狀態、事件與記憶面板');

    await panelClose.click();
    await expect(chatMain).not.toHaveClass(/bao-mobile-panel-open/);

    await page.locator('#bao-play-status-toggle').click();
    await expect(page.locator('#chat-view')).toHaveClass(/bao-play-status-open/);
    await page.locator('#bao-play-status-close').click();
    await expect(page.locator('#chat-view')).not.toHaveClass(/bao-play-status-open/);
  });
}
