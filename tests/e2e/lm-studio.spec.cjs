const { test, expect } = require('@playwright/test');

test('LM Studio model discovery, no-key story request and resume', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#api-type option[value="lmstudio"]')).toHaveCount(1);
  await page.evaluate(() => {
    const original = window.fetch.bind(window);
    window.__lmStudioCalls = [];
    window.fetch = (input, init = {}) => {
      const url = String(input?.url || input);
      if (!url.startsWith('http://localhost:1234/v1/')) return original(input, init);
      window.__lmStudioCalls.push({ url, headers: init.headers || {}, body: init.body || '' });
      const result = url.endsWith('/models')
        ? { data: [{ id: 'gemma4-26b-a4b' }] }
        : { choices: [{ message: { content: '本地模型回覆成功' } }], usage: { prompt_tokens: 9, completion_tokens: 8, total_tokens: 17 } };
      return Promise.resolve(new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    };
    const character = App.characters.find(item => item.id === 'linchenfeng') || App.characters[0];
    App.activeCharacter = character;
    App.openBuilder();
    App.setStep(4);
  });
  await page.locator('#api-type').selectOption('lmstudio');
  await expect(page.locator('#bao-lm-builder')).toBeVisible();
  await expect(page.locator('#base-url')).toHaveValue('http://localhost:1234/v1/chat/completions');
  await page.getByRole('button', { name: '讀取本機模型' }).click();
  await expect(page.locator('#bao-lm-models option[value="gemma4-26b-a4b"]')).toHaveCount(1);
  await expect(page.locator('#model-id')).toHaveValue('gemma4-26b-a4b');
  await expect(page.locator('#api-key')).toHaveValue('');
  await page.evaluate(() => App.setStep(5));
  await page.locator('#start-story').click();
  await expect(page.locator('#user-input')).toBeVisible();
  await expect(page.locator('#bao-lm-chat-button')).toBeVisible();
  await page.locator('#user-input').fill('你好，本地 AI');
  await page.locator('#chat-view .composer button.primary').click();
  await expect(page.locator('#chat-stream')).toContainText('本地模型回覆成功');
  const before = await page.evaluate(() => ({
    key: App.config.api.key,
    savedKey: Storage.loadStory()?.config?.api?.key || '',
    savedRoute: Storage.loadStory()?.config?.api?.route,
    calls: window.__lmStudioCalls
  }));
  expect(before.key).toBe('BAO_LOCAL_NO_AUTH');
  expect(before.savedKey).toBe('');
  expect(before.savedRoute).toBe('local');
  expect(before.calls.some(call => call.url.endsWith('/chat/completions'))).toBe(true);
  expect(before.calls.every(call => !call.headers.Authorization)).toBe(true);
  await page.evaluate(() => Storage.flush());
  await page.reload();
  await expect(page.locator('#home-continue')).toBeVisible();
  await expect(page.locator('#api-type option[value="lmstudio"]')).toHaveCount(1);
  await page.locator('#home-continue').click();
  await expect(page.locator('#bao-chat-api-backdrop')).toHaveCount(0);
  await expect(page.locator('#chat-stream')).toContainText('本地模型回覆成功');
  const restored = await page.evaluate(() => ({ key: App.config.api.key, route: App.config.api.route }));
  expect(restored).toEqual({ key: 'BAO_LOCAL_NO_AUTH', route: 'local' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#bao-lm-chat-button').click();
  await expect(page.getByRole('dialog', { name: '連接 LM Studio 本地 AI' })).toBeVisible();
  const widths = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(widths.content).toBeLessThanOrEqual(widths.viewport);
});
