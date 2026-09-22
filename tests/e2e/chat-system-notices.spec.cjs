const { test, expect } = require('@playwright/test');

async function startStory(page, mode = 'text') {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && Storage.status().ready, null, { timeout: 15000 });
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  await page.getByRole('button', { name: '下一步' }).click();
  if (mode === 'ui') {
    await page.locator('.builder-step[data-step-panel="2"] label.choice-card')
      .filter({ has: page.locator('input[name="display-mode"][value="ui"]') }).click();
  }
  for (let step = 1; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://main.invalid/v1');
  await page.locator('#api-key').fill('MAIN_UNSAVED_BROWSER_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await page.waitForFunction(() => !!window.BAOChatSystemNotices && !!window.BAOChatExperienceRepairs, null, { timeout: 15000 });
}

async function installGatedStream(page) {
  await page.evaluate(() => {
    App.config.api.type = 'custom';
    App.config.api.protocol = 'openai';
    App.config.api.baseUrl = 'https://main.invalid/v1';
    const originalFetch = window.fetch.bind(window);
    let requestCount = 0;
    window.__baoStreamRequests = () => requestCount;
    window.fetch = async (url, options = {}) => {
      if (String(url) !== 'https://main.invalid/v1') return originalFetch(url, options);
      requestCount++;
      const encoder = new TextEncoder();
      const event = text => encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(event('第一段故事'));
          window.__baoFinishStream = () => {
            controller.enqueue(event('，接著第二段。'));
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          };
          options.signal?.addEventListener('abort', () => {
            controller.error(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        }
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  });
}

test('stream stays in the story while progress and completion remain outside it', async ({ page }) => {
  await startStory(page);
  await installGatedStream(page);
  const notice = page.locator('#bao-chat-system-notices');
  const stream = page.locator('#chat-stream');
  const before = await stream.locator(':scope > .message').count();
  await page.locator('#user-input').fill('推開房門');
  await page.getByRole('button', { name: '送出訊息' }).click();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('正在生成故事');
  await expect(stream.locator(':scope > .message.assistant.is-streaming .bubble')).toContainText('第一段故事');
  expect(await page.evaluate(() => Chat.messages.filter(m => m.role === 'assistant').length)).toBe(0);
  expect(await page.evaluate(() => document.getElementById('chat-stream').contains(document.getElementById('bao-chat-system-notices')))).toBe(false);
  await page.evaluate(() => window.__baoFinishStream());
  await expect(stream.locator(':scope > .message.assistant:last-child .bubble')).toContainText('第一段故事，接著第二段。');
  await expect(notice).toBeHidden();
  await expect(stream.locator(':scope > .message')).toHaveCount(before + 2);
  expect(await page.evaluate(() => Chat.messages.map(m => m.content))).toEqual(['推開房門', '第一段故事，接著第二段。']);
  expect(await page.evaluate(() => window.__baoStreamRequests())).toBe(1);
});

test('cancelled stream restores draft and shows notice without a phantom story message', async ({ page }) => {
  await startStory(page);
  await installGatedStream(page);
  const stream = page.locator('#chat-stream');
  const before = await stream.locator(':scope > .message').count();
  await page.locator('#user-input').fill('取消後應保留的草稿');
  await page.getByRole('button', { name: '送出訊息' }).click();
  await expect(stream.locator(':scope > .message.assistant.is-streaming .bubble')).toContainText('第一段故事');
  await page.getByRole('button', { name: '取消生成' }).click();
  await expect(page.locator('#bao-chat-system-notices')).toContainText('生成已取消');
  await expect(page.locator('#bao-chat-send-feedback')).toContainText('已取消本次生成');
  await expect(page.locator('#user-input')).toHaveValue('取消後應保留的草稿');
  await expect(stream.locator(':scope > .message')).toHaveCount(before);
  expect(await page.evaluate(() => ({ history: Chat.messages.length, pending: App.__requestPending, requests: window.__baoStreamRequests() })))
    .toEqual({ history: 0, pending: false, requests: 1 });
  await expect(stream).not.toContainText('已取消本次生成');
});

test('API failure appears only in the separate notice area in interactive UI mode', async ({ page }) => {
  await startStory(page, 'ui');
  await page.evaluate(() => { API.send = async () => { throw new Error('測試 429：額度不足'); }; });
  const stream = page.locator('#chat-stream');
  const before = await stream.locator(':scope > .message').count();
  await page.locator('#user-input').fill('失敗後可修改');
  await page.getByRole('button', { name: '送出訊息' }).click();
  await expect(page.locator('#bao-chat-system-notices')).toContainText('測試 429');
  await expect(page.locator('#bao-chat-send-feedback')).toContainText('額度不足');
  await expect(stream).not.toContainText('連線失敗');
  await expect(stream.locator(':scope > .message')).toHaveCount(before);
  await expect(page.locator('#user-input')).toHaveValue('失敗後可修改');
  expect(await page.evaluate(() => Chat.messages.length)).toBe(0);
});
