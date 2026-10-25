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

test('late story-chain failure also blocks direct auxiliary API sends before transport', async ({ page }) => {
  const posts = postsFor(page);
  let injected = 0;
  await page.route('**/js/settings-effects.js*', route => {
    injected += 1;
    return route.fulfill({ status: 404, contentType: 'text/javascript', body: '/* intentional late hook failure */' });
  });
  await page.route('https://readiness-guard.invalid/**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: 'SHOULD_NOT_REACH' } }] }) }));
  await page.goto('/');
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === 'unavailable', null, { timeout: 35000 });
  expect(injected).toBeGreaterThanOrEqual(1);
  const blocked = await page.evaluate(async () => {
    try {
      await API.send({
        type: 'custom', protocol: 'openai', model: 'guard-test', key: 'fake',
        baseUrl: 'https://readiness-guard.invalid/v1/chat/completions',
        __auxiliaryTask: true, __interpretationTask: 'advisor', retryEnabled: false
      }, [{ role: 'user', content: 'MUST_NOT_LEAVE_BROWSER' }]);
      return { blocked: false, code: '' };
    } catch (error) {
      return { blocked: true, code: error?.code || '', message: error?.message || '' };
    }
  });
  expect(blocked.blocked).toBe(true);
  expect(blocked.code).toBe('BAO_STORY_EXTENSIONS_NOT_READY');
  expect(blocked.message).toContain('已停止模型請求');
  expect(posts).toEqual([]);
});

test('connection test remains available while story extensions are still loading', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/js/prompt-orchestrator.js*', async route => {
    await gate;
    await route.continue();
  });
  let providerPosts = 0;
  await page.route('https://readiness-connection.invalid/**', route => {
    providerPosts += 1;
    return route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }) });
  });
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      Boolean(document.querySelector('script[src^="js/prompt-orchestrator.js"]')) &&
      window.BAOExtensionLoadHealth?.snapshot().story === 'loading'
    , null, { timeout: 35000 });
    const text = await page.evaluate(async () => {
      const result = await API.send({
        type: 'custom', protocol: 'openai', model: 'connection-test', key: 'fake',
        baseUrl: 'https://readiness-connection.invalid/v1/chat/completions',
        __connectionTest: true, retryEnabled: false
      }, [{ role: 'user', content: 'Reply OK' }]);
      return result.text;
    });
    expect(text).toBe('OK');
    expect(providerPosts).toBe(1);
  } finally {
    release();
  }
  await page.waitForFunction(() => window.BAOExtensionLoadHealth.snapshot().story === 'ready', null, { timeout: 35000 });
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
