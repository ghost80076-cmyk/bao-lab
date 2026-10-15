const { test, expect } = require('@playwright/test');

async function startMockStory(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.BAOChatToolNavigation && window.BAONarrativeSettings &&
    window.BAOStoryActors && window.BAOStoryControlCenter &&
    window.BAOMobileReadingLayout && App.characters?.length
  ));
  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      greeting: '夜灣的燈還亮著。'
    };
    App.config = {
      persona: { name: '玩家', identity: '旅人' },
      narrativeMode: 'immersive', displayMode: 'ui',
      api: { model: 'test-story-model', baseUrl: 'https://example.invalid', key: 'LOCAL_TEST_ONLY' },
      memory: { maxRounds: 20, maxContext: 32000 }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
    window.BAOChatToolNavigation.sync();
  });
  await expect.poll(() => page.evaluate(() => Boolean(
    document.querySelector('#bao-chat-tool-groups [data-chat-tool-body="world"] #bao-actor-entry') &&
    document.querySelector('#bao-chat-tool-groups [data-chat-tool-body="settings"] #bao-long-instructions-entry')
  ))).toBe(true);
}

for (const width of [390, 1280]) {
  test(`story navigation at ${width}px groups people, memory and instructions by intent`, async ({ page }) => {
    await startMockStory(page, width);
    const sidebar = page.locator('#chat-view .chat-layout > aside');
    const bodies = sidebar.locator('[data-chat-tool-body]');
    await expect(bodies.filter({ has: page.locator('#bao-actor-entry') })).toHaveAttribute('data-chat-tool-body', 'world');
    await expect(bodies.filter({ has: page.locator('[data-bao-open="memory"]') })).toHaveAttribute('data-chat-tool-body', 'story');
    await expect(bodies.filter({ has: page.locator('[data-bao-open="appearance"]') })).toHaveAttribute('data-chat-tool-body', 'scene');
    await expect(bodies.filter({ has: page.locator('#bao-long-instructions-entry') })).toHaveAttribute('data-chat-tool-body', 'settings');
    const groupNames = await sidebar.locator('#bao-chat-tool-groups > details > summary').allTextContents();
    expect(groupNames).toEqual([
      '◇ 人物與世界', '▤ 故事與記憶', '⚙ AI 與指令', '◈ 畫面與操作', '其他與支援'
    ]);

    await page.evaluate(() => {
      BAOChatToolNavigation.openDrawer();
      if (innerWidth < 900) BAOMobileReadingLayout.enhanceDrawer();
    });
    const drawer = page.locator('#bao-chat-tool-drawer');
    await expect(drawer).toBeVisible();
    const groups = drawer.locator('.bao-chat-tool-dialog-body > details[data-chat-tool-group]');
    const drawerNames = await groups.locator(':scope > summary').allTextContents();
    expect(drawerNames).toEqual(groupNames);
    const search = drawer.locator('#bao-tool-search');
    await search.fill('prompt');
    // The drawer uses a live proxy, never a copied instruction store.
    const direct = drawer.locator('[data-chat-tool-group="settings"] .bao-chat-tool-proxy').filter({ hasText: '長期指令' });
    await expect(direct).toBeVisible();
    await expect(drawer.locator('[data-chat-tool-group="world"]')).toBeHidden();
    await direct.click();
    await expect(drawer).toHaveCount(0);
    const modal = page.getByRole('dialog', { name: '敘事與描寫設定' });
    await expect(modal).toBeVisible();
    await expect(page.locator('.narrative-instructions-focused #bao-narrative-instructions')).toBeVisible();
    const focusedId = await page.evaluate(() => document.activeElement?.getAttribute('data-add-instruction') !== null ||
      document.activeElement?.hasAttribute('data-instruction-text'));
    expect(focusedId).toBe(true);
    await modal.locator('[data-add-instruction]').click();
    await modal.locator('[data-instruction-text]').last().fill('保持角色之間的資訊邊界。');
    await modal.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => App.config?.narrative?.customInstructions?.[0]?.text)).toBe('保持角色之間的資訊邊界。');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}

test('story overview links to the same long-term instruction editor', async ({ page }) => {
  await startMockStory(page, 1280);
  await page.evaluate(() => BAOStoryControlCenter.open());
  const overview = page.getByRole('dialog', { name: '故事總覽' });
  await expect(overview).toBeVisible();
  await overview.locator('.story-control-more > summary').click();
  await overview.locator('[data-story-control-action="instructions"]').click();
  await expect(overview).toHaveCount(0);
  await expect(page.locator('.narrative-instructions-focused #bao-narrative-instructions')).toBeVisible();
});
