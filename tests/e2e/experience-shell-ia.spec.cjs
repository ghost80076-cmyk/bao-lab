const { test, expect } = require('@playwright/test');

async function openExperienceStory(page, width) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.BAOStorySurface &&
    window.BAOChatToolNavigation &&
    window.BAOStoryControlCenter &&
    window.BAOMobileReadingLayout &&
    App.characters?.length
  ));
  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      gameplay_ui: undefined,
      play_info_surface: undefined,
      greeting: '夜灣 Experience Shell 測試。'
    };
    App.config = {
      persona: { name: '玩家', identity: '旅人' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: {
        type: 'custom',
        model: 'experience-shell-test',
        baseUrl: 'https://example.invalid',
        key: 'LOCAL_TEST_ONLY'
      },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
    BAOStorySurface.sync();
    BAOChatToolNavigation.sync();
  });
}

test('desktop exposes one Story / Stage / Control Center navigation without changing story state', async ({ page }) => {
  await openExperienceStory(page, 1280);

  const controls = page.locator('#bao-surface-controls');
  await expect(controls).toBeVisible();
  await expect(controls).toHaveAttribute('aria-label', '故事、舞臺與控制中心');
  await expect(controls.getByRole('button', { name: '回到故事' })).toHaveText('故事');
  await expect(controls.getByRole('button', { name: /查看舞臺/ })).toHaveText('舞臺');
  await expect(controls.getByRole('button', { name: '開啟控制中心' })).toHaveText('控制中心');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'story');
  await expect(controls.locator('[data-bao-surface-role="story"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#chat-view [data-open-story-control]')).toHaveCount(1);
  await expect(page.locator('#chat-view .usage-bar')).toBeHidden();
  await expect(page.locator('#chat-view #bao-chat-tool-groups')).toBeHidden();
  await expect(page.locator('#bao-chat-tool-shortcuts')).toHaveCount(0);
  await expect(page.locator('#chat-view #game-ui')).toBeHidden();

  const before = await page.evaluate(() => ({
    api: JSON.stringify(App.config.api),
    state: JSON.stringify(GameState.current),
    messages: JSON.stringify(Chat.messages)
  }));

  await controls.locator('[data-bao-surface-role="stage"]').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'stage');
  await expect(controls.locator('[data-bao-surface-role="stage"]')).toHaveAttribute('aria-pressed', 'true');

  await controls.locator('[data-bao-surface-role="story"]').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'story');

  await controls.locator('[data-bao-surface-role="control"]').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'control');
  const drawer = page.getByRole('dialog', { name: '故事總覽' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('header h2')).toHaveText('控制中心');
  await expect(drawer.locator('[data-story-settings-hub]')).toBeVisible();
  await drawer.getByRole('button', { name: '關閉故事總覽' }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'story');

  const after = await page.evaluate(() => ({
    api: JSON.stringify(App.config.api),
    state: JSON.stringify(GameState.current),
    messages: JSON.stringify(Chat.messages)
  }));
  expect(after).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1281);
});

test('mobile keeps Story as the base surface and routes Stage / Control Center on demand', async ({ page }) => {
  await openExperienceStory(page, 390);

  const story = page.locator('#bao-story-surface-story');
  const control = page.locator('#bao-surface-mode-toggle');
  const stage = page.locator('#bao-play-status-toggle');
  await expect(story).toBeHidden();
  await expect(control).toBeHidden();
  await expect(stage).toBeVisible();
  await expect(stage).toHaveText('舞臺');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'story');
  await expect(page.locator('#bao-chat-tool-shortcuts')).toHaveCount(0);

  await stage.click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'stage');

  await page.evaluate(() => window.BAOStorySurface.closeStatus());
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'story');

  const plus = page.locator('#bao-mobile-composer-tools');
  await expect(plus).toHaveAttribute('aria-label', '開啟控制中心');
  await plus.click();

  const drawer = page.getByRole('dialog', { name: '故事功能選單' });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('header h2')).toHaveText('控制中心');
  await expect(drawer.getByRole('button', { name: '目前設定', exact:true })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '舞臺資訊' })).toBeVisible();
  await drawer.getByRole('button', { name: '關閉 ×' }).click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'play');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-experience-surface', 'story');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
for (const width of [390, 900, 1440]) {
  test(`control center at ${width}px isolates keyboard and restores search context`, async ({ page }) => {
    await openExperienceStory(page, width);
    const opener = page.locator(width <= 820 ? '#bao-mobile-composer-tools' : '#bao-surface-mode-toggle');
    const before = await page.evaluate(() => JSON.stringify({ config:App.config, state:GameState.current, messages:Chat.messages }));
    await opener.click();
    const drawer = page.locator('#bao-chat-tool-drawer');
    await expect(drawer).toBeVisible();
    await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
    // Focus must wrap at both ends, including controls added by mobile enhancement.
    const focusEnds = () => page.evaluate(() => {
      const dialog = document.querySelector('#bao-chat-tool-drawer [role="dialog"]');
      const items = [...dialog.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      items[items.length - 1].focus();
    });
    await focusEnds();
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement === document.querySelector('#bao-chat-tool-drawer header button'))).toBe(true);
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => {
      const dialog = document.querySelector('#bao-chat-tool-drawer [role="dialog"]');
      const items = [...dialog.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex]')]
        .filter(node => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
      return document.activeElement === items[items.length - 1];
    })).toBe(true);
    const overview = drawer.locator('[data-story-settings-hub]');
    await drawer.getByRole('button', { name:'目前設定', exact:true }).click();
    const search = drawer.getByRole('searchbox', { name:'搜尋故事工具' });
    await search.fill('prompt');
    await expect(overview).toBeHidden();
    await expect(drawer.locator('[data-chat-tool-group="settings"]')).toBeVisible();
    await search.fill('NO_SUCH_TOOL_0317');
    await expect(drawer.locator('.bao-tool-search-empty')).toBeVisible();
    await expect(overview).toBeHidden();
    await search.fill('');
    await expect(overview).toBeVisible();
    await expect(overview).toHaveAttribute('open', '');
    await page.keyboard.press('Escape');
    await expect(drawer).toHaveCount(0);
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
    await expect(opener).toBeFocused();
    expect(await page.evaluate(() => JSON.stringify({ config:App.config, state:GameState.current, messages:Chat.messages }))).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}

for (const width of [390, 900, 1440]) {
  test(`control center at ${width}px separates settings from tools without reopening`, async ({ page }) => {
    await openExperienceStory(page, width);
    await page.evaluate(() => BAOStoryControlCenter.open());
    const drawer = page.locator('#bao-chat-tool-drawer');
    const dialog = drawer.locator('[role="dialog"]');
    const overview = drawer.locator('[data-story-settings-hub]');
    const groups = drawer.locator('[data-chat-tool-group]');
    const overviewButton = drawer.getByRole('button', { name:'目前設定', exact:true });
    const toolsButton = drawer.getByRole('button', { name:'全部工具', exact:true });
    await expect(dialog).toHaveAttribute('data-control-view', 'overview');
    await expect(overview).toBeVisible();
    await expect(overview.locator(':scope > summary')).toBeHidden();
    for (const group of await groups.all()) await expect(group).toBeHidden();
    await expect(drawer.locator('.bao-mobile-quick')).toBeHidden();
    await expect(drawer.getByRole('button', { name:'目前故事設定', exact:true })).toHaveCount(0);
    // A marker proves switching tasks keeps the same dialog/managers mounted.
    await dialog.evaluate(node => { node.dataset.instance = 'keep'; });
    await overview.locator('.story-control-more > summary').click();
    await toolsButton.click();
    await expect(dialog).toHaveAttribute('data-control-view', 'tools');
    await expect(overview).toBeHidden();
    await expect(groups.first()).toBeVisible();
    if (width <= 820) {
      await expect(drawer.locator('.bao-mobile-quick')).toBeVisible();
    } else {
      await expect(drawer.getByRole('button', { name:'快速儲存', exact:true })).toBeVisible();
    }
    await overviewButton.click();
    await expect(dialog).toHaveAttribute('data-instance', 'keep');
    await expect(overview.locator('.story-control-more')).toHaveAttribute('open', '');
    const search = drawer.getByRole('searchbox', { name:'搜尋故事工具' });
    await search.fill('prompt');
    await expect(toolsButton).toHaveAttribute('aria-pressed', 'true');
    await expect(overview).toBeHidden();
    await search.fill('');
    await expect(overviewButton).toHaveAttribute('aria-pressed', 'true');
    await expect(overview).toBeVisible();
    // External callers use the same presentation route as the visible buttons.
    await toolsButton.click();
    await page.evaluate(() => BAOStoryControlCenter.open({ effects:true }));
    await expect(dialog).toHaveAttribute('data-instance', 'keep');
    await expect(overview).toBeVisible();
    await expect(overview.locator('[data-settings-effects]')).toHaveAttribute('open', '');
    await expect(drawer).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-shell')).not.toHaveAttribute('inert', '');
  });
}

test('help above Control Center returns to the same task without closing it', async ({ page }) => {
  await openExperienceStory(page, 900);
  await page.evaluate(() => BAOStoryControlCenter.open());
  const drawer = page.locator('#bao-chat-tool-drawer');
  await drawer.locator('header .bao-help-button').click();
  const help = page.locator('#bao-feature-help-dialog');
  await expect(help).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[role="dialog"]')).toHaveAttribute('data-control-view', 'overview');
  await expect(drawer.locator('header .bao-help-button')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
});
