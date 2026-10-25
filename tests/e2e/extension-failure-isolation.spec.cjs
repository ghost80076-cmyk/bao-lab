const { test, expect } = require('@playwright/test');

// Real HTTP failures, no model calls, and no persistence mutation in this suite.
// Confirm an optional tool 404 does not cut off later story extensions.
const ready = page => page.waitForFunction(() => Boolean(
  window.BAOStoryReader && window.BAOStoryControlCenter &&
  window.BAOSettingsEffects && window.BAORequestLedger
), null, { timeout: 35000 });

for (const width of [390, 1280]) {
  for (const [group, path] of [
    ['google-drive', 'google-drive-config.js'],
    ['conversation-search', 'conversation-search-core.js'],
    ['inspiration-copy', 'inspiration-copy.js'],
    ['story-quick-commands', 'story-quick-commands-core.js'],
    ['mobile-reading-layout', 'mobile-reading-layout.js'],
    ['avatar-chat', 'avatar-chat.js'],
    ['context-diagnostics', 'context-inspector.js']
  ]) {
    test(`optional ${group} 404 keeps the story tool chain running at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      const posts = [];
      page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
      await page.route(`**/js/${path}*`, route =>
        route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* injected not found */' }));
      await page.goto('/');
      await ready(page);
      const observed = await page.evaluate(name => ({
        health: window.BAOExtensionLoadHealth.snapshot(),
        reader: Boolean(window.BAOStoryReader),
        settings: Boolean(window.BAOSettingsEffects),
        tools: Boolean(window.BAOStoryControlCenter),
        ledger: Boolean(window.BAORequestLedger),
        library: Boolean(window.BAOStoryLibrary),
        backup: Boolean(window.BAOStoryBackup)
      }), group);
      expect(observed.health.optional[group]).toBe('unavailable');
      expect(observed.health.world).toBe('ready');
      for (const key of ['reader', 'settings', 'tools', 'ledger', 'library', 'backup']) {
        expect(observed[key], key).toBe(true);
      }
      await page.evaluate(() => App.showView('chat'));
      await expect(page.locator('#chat-view')).toHaveClass(/active/);
      expect(posts).toEqual([]);
    });
  }

  test(`world engine 404 is not reported as healthy at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const posts = [];
    page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
    await page.route('**/js/world-state.js*', route =>
      route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* injected world failure */' }));
    await page.goto('/');
    await ready(page);
    expect(await page.evaluate(() => window.BAOExtensionLoadHealth.snapshot().world)).toBe('unavailable');
    await page.evaluate(() => App.showView('chat'));
    await expect(page.locator('#bao-feedback-toast')).toContainText('世界狀態模組載入不完整');
    expect(posts).toEqual([]);
  });
}

test('successful load does not display a world failure warning', async ({ page }) => {
  await page.goto('/');
  await ready(page);
  const health = await page.evaluate(() => window.BAOExtensionLoadHealth.snapshot());
  expect(health.world).toBe('ready');
  for (const key of ['google-drive', 'conversation-search', 'inspiration-copy']) {
    expect(health.optional[key], key).toBe('ready');
  }
  await page.evaluate(() => App.showView('chat'));
  const unexpectedWarning = await page.evaluate(() =>
    document.getElementById('bao-feedback-toast')?.textContent?.includes('世界狀態模組載入不完整') || false
  );
  expect(unexpectedWarning).toBe(false);
});
