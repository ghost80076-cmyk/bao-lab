const { test, expect } = require('@playwright/test');

test('desktop story uses a readable viewport and larger assistant text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(document.querySelector('link[href="css/chat-desktop-reading.css"]')?.sheet));
  await page.evaluate(() => {
    App.showView('chat');
    document.getElementById('chat-stream').innerHTML = '<div class="message assistant"><div class="bubble">閱讀測試文字</div></div>';
  });
  const measure = await page.locator('#chat-view').evaluate(root => {
    const stream = root.querySelector('.chat-stream');
    const bubble = root.querySelector('.message.assistant .bubble');
    return {
      fontSize: parseFloat(getComputedStyle(bubble).fontSize),
      lineHeight: parseFloat(getComputedStyle(bubble).lineHeight),
      streamHeight: stream.getBoundingClientRect().height,
      streamClientWidth: stream.clientWidth,
      scrollWidth: stream.scrollWidth,
      bubbleWidth: bubble.getBoundingClientRect().width
    };
  });
  expect(measure.fontSize).toBeGreaterThanOrEqual(16);
  expect(measure.fontSize).toBeLessThanOrEqual(17);
  expect(measure.lineHeight).toBeGreaterThanOrEqual(30);
  expect(measure.streamHeight).toBeGreaterThan(500);
  expect(measure.streamHeight).toBeLessThanOrEqual(900);
  expect(measure.scrollWidth).toBeLessThanOrEqual(measure.streamClientWidth + 1);
  expect(measure.bubbleWidth).toBeLessThanOrEqual(850);
});

test('phone retains its existing compact text and viewport layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(document.querySelector('link[href="css/chat-desktop-reading.css"]')?.sheet));
  await page.waitForFunction(() => Boolean(window.BAOMobileReadingLayout));
  await page.evaluate(() => {
    App.showView('chat');
    BAOMobileReadingLayout.sync();
    document.getElementById('chat-stream').innerHTML = '<div class="message assistant"><div class="bubble">手機閱讀測試</div></div>';
  });
  const font = await page.locator('#chat-view .message.assistant .bubble').evaluate(node => parseFloat(getComputedStyle(node).fontSize));
  expect(font).toBeLessThanOrEqual(16);
  await expect(page.locator('#bao-mobile-composer-tools')).toBeVisible();
});


test('wide desktop keeps story information in the right rail and restores the game UI below the breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOChatExperience && window.GameState && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0] };
    App.config = {
      persona: { name: '旅人', identity: '記者', relationship: '舊識' },
      narrativeMode: 'world',
      displayMode: 'ui',
      api: { model: 'mock-desktop-info', baseUrl: 'https://example.invalid', key: 'EPHEMERAL_TEST_KEY' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(false);
    App.showView('chat');
    BAOChatExperience.sync();
  });

  const rail = page.locator('#bao-reading-status');
  await expect(rail).toBeVisible();
  await expect(rail).toHaveAttribute('aria-label', '故事資訊');
  await expect(rail.getByRole('heading', { name: '故事資訊' })).toBeVisible();
  await expect(rail.locator('.bao-story-info-current-head')).toContainText('現況');
  await expect(rail.locator('.bao-story-info-detail')).toContainText('詳細資訊');

  const desktopLayout = await page.evaluate(() => ({
    gameUiParent: document.getElementById('game-ui')?.parentElement?.className || '',
    gameUiInMain: Boolean(document.querySelector('#chat-view .chat-main > #game-ui')),
    gameUiInRail: Boolean(document.querySelector('#bao-reading-status .bao-story-info-detail > #game-ui')),
    expanded: document.getElementById('bao-reading-status-toggle')?.getAttribute('aria-expanded')
  }));
  expect(desktopLayout.gameUiInMain).toBe(false);
  expect(desktopLayout.gameUiInRail).toBe(true);
  expect(desktopLayout.gameUiParent).toContain('bao-story-info-detail');
  expect(desktopLayout.expanded).toBe('true');

  // Generic navigation cleanup must not collapse the persistent wide-desktop rail.
  await page.evaluate(() => BAOChatExperience.closeStatus());
  await expect(rail).toBeVisible();
  await expect(page.locator('#bao-reading-status-toggle')).toHaveAttribute('aria-expanded', 'true');

  await rail.getByRole('button', { name: '關閉故事資訊' }).click();
  await expect(page.locator('#chat-view .chat-layout')).toHaveClass(/bao-status-collapsed/);
  await expect(page.locator('#bao-reading-status-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => BAOChatExperience.openStatus());
  await expect(page.locator('#bao-reading-status-toggle')).toHaveAttribute('aria-expanded', 'true');

  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => page.evaluate(() => Boolean(document.querySelector('#chat-view .chat-main > #game-ui')))).toBe(true);
  expect(await page.evaluate(() => Boolean(document.querySelector('#bao-reading-status .bao-story-info-detail > #game-ui')))).toBe(false);
});
