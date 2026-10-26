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
  await expect(drawer.getByRole('button', { name: '目前故事設定' })).toBeVisible();
  await expect(drawer.getByRole('button', { name: '舞臺資訊' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});
