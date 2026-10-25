const { test, expect } = require('@playwright/test');

test.use({ serviceWorkers: 'block' });

const postsFor = page => {
  const posts = [];
  page.on('request', req => { if (req.method() === 'POST') posts.push(req.url()); });
  return posts;
};

test('slow core story hook blocks send until the full extension chain is ready', async ({ page }) => {
  const posts = postsFor(page);
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/js/prompt-orchestrator.js*', async route => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      Boolean(document.querySelector('script[src^="js/prompt-orchestrator.js"]')) &&
      window.BAOExtensionLoadHealth?.snapshot().story === 'loading'
    , null, { timeout: 35000 });
    await page.locator('#user-input').fill('READINESS_GUARD_TEST');
    const before = await page.evaluate(() => Chat.messages.length);
    await page.evaluate(async () => { await App.sendMessage(); });
    expect(await page.locator('#user-input').inputValue()).toBe('READINESS_GUARD_TEST');
    expect(await page.evaluate(() => Chat.messages.length)).toBe(before);
    await expect(page.locator('#bao-feedback-toast')).toContainText('故事核心功能仍在載入');
    expect(posts).toEqual([]);
  } finally {
    release();
  }
  await page.waitForFunction(() => window.BAOExtensionLoadHealth.snapshot().story === 'ready', null, { timeout: 35000 });
  expect(await page.evaluate(() => Boolean(window.BAORequestLedger && window.BAOSettingsEffects))).toBe(true);
  expect(posts).toEqual([]);
});

test('missing core prompt hook fails closed and never sends with a partial prompt stack', async ({ page }) => {
  const posts = postsFor(page);
  let injected = 0;
  await page.route('**/js/prompt-orchestrator.js*', route => {
    injected += 1;
    return route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* intentional core hook failure */' });
  });
  await page.goto('/');
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === 'unavailable', null, { timeout: 35000 });
  expect(injected).toBeGreaterThanOrEqual(1);
  await page.locator('#user-input').fill('MUST_NOT_SEND_PARTIAL_PROMPT');
  const before = await page.evaluate(() => Chat.messages.length);
  await page.evaluate(async () => { await App.sendMessage(); });
  expect(await page.evaluate(() => Chat.messages.length)).toBe(before);
  expect(await page.locator('#user-input').inputValue()).toBe('MUST_NOT_SEND_PARTIAL_PROMPT');
  await expect(page.locator('#bao-feedback-toast')).toContainText('故事核心模組載入不完整');
  await page.evaluate(() => App.showView('chat'));
  await expect(page.locator('#bao-feedback-toast')).toContainText('本次已停止送出');
  expect(posts).toEqual([]);
});

test('normal boot marks the story extension chain ready without creating an error notice', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === 'ready', null, { timeout: 35000 });
  const state = await page.evaluate(() => ({
    health: window.BAOExtensionLoadHealth.snapshot(),
    ledger: Boolean(window.BAORequestLedger),
    settings: Boolean(window.BAOSettingsEffects),
    warning: document.getElementById('bao-feedback-toast')?.textContent || ''
  }));
  expect(state.health.story).toBe('ready');
  expect(state.ledger).toBe(true);
  expect(state.settings).toBe(true);
  expect(state.warning).not.toContain('故事核心模組載入不完整');
});
