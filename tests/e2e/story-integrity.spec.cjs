const { test, expect } = require('@playwright/test');

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

async function startStory(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && Storage.status().ready, null, { timeout: 15000 });
  await page.getByRole('button', { name: '探索作品' }).click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://main.invalid/v1');
  await page.locator('#api-key').fill('MAIN_UNSAVED_BROWSER_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await page.waitForFunction(() => !!window.BAOStoryIntegrity && !!window.BAOStateTrackerRepairs, null, { timeout: 15000 });
}

test('Android Enter inserts a newline, long chat scrolls internally and event history stays deduplicated', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, userAgent: ANDROID,
    hasTouch: true, isMobile: true
  });
  const page = await context.newPage();
  try {
    await startStory(page);
    await page.evaluate(() => {
      window.__unexpectedSendCount = 0;
      App.sendMessage = () => { window.__unexpectedSendCount++; return Promise.resolve(); };
    });
    const input = page.locator('#user-input');
    await input.fill('第一行');
    await input.press('Enter');
    await expect(input).toHaveValue('第一行\n');
    await input.press('Shift+Enter');
    await expect(input).toHaveValue('第一行\n\n');
    expect(await page.evaluate(() => window.__unexpectedSendCount)).toBe(0);
    await page.evaluate(() => {
      const stream = document.getElementById('chat-stream');
      for (let i = 0; i < 90; i++) {
        const line = document.createElement('p');
        line.textContent = `長篇故事測試第 ${i} 段。`.repeat(15);
        stream.appendChild(line);
      }
      GameState.addEvent('玩家與 林沉風 完成一輪互動。');
      GameState.applyUpdate({ new_events: ['林沉風離開房間。', '林沉風返回客廳。'] });
      GameState.applyUpdate({ new_events: ['林沉風離開房間。', '林沉風返回客廳。'] });
    });
    await expect.poll(() => page.evaluate(() => {
      const stream = document.getElementById('chat-stream');
      return stream.scrollHeight > stream.clientHeight && getComputedStyle(stream).overflowY === 'auto';
    })).toBe(true);
    expect(await page.evaluate(() => GameState.current.events.filter(item => item.text === '林沉風離開房間。').length)).toBe(1);
    await page.locator('#bao-chat-jump button').filter({ hasText: '回到最新' }).click();
    await expect.poll(() => page.evaluate(() => {
      const stream = document.getElementById('chat-stream');
      return stream.scrollHeight - stream.scrollTop - stream.clientHeight;
    })).toBeLessThan(30);
  } finally { await context.close(); }
});

test('restore reconnects separate state and memory keys without exporting any key', async ({ page }) => {
  await startStory(page);
  await page.evaluate(async () => {
    App.config.cost ||= {};
    App.config.memory ||= {};
    App.config.cost.stateApi = { model: 'state-model', protocol: 'openai', baseUrl: 'https://state.invalid/v1', key: 'SECRET_STATE_BEFORE_RELOAD' };
    App.config.memory.summaryApi = { model: 'memory-model', protocol: 'openai', baseUrl: 'https://memory.invalid/v1', key: 'SECRET_MEMORY_BEFORE_RELOAD' };
    GameState.current.config = App.config;
    App.saveStory(false);
    await Storage.flush();
  });
  await page.reload();
  await page.waitForFunction(() => Storage.status().ready && !!window.BAOChatAPISettings?.restore, null, { timeout: 15000 });
  await page.locator('#continue-story').click();
  const dialog = page.getByRole('dialog', { name: '故事 API 設定' });
  await expect(dialog).toBeVisible();
  const helper = dialog.locator('.bao-helper-reconnect fieldset');
  await expect(helper).toHaveCount(2);
  await expect(helper.nth(0).locator('select').first()).toHaveValue('separate');
  await expect(helper.nth(1).locator('select').first()).toHaveValue('separate');
  await dialog.locator('input[name=key]').fill('MAIN_NEW_KEY');
  await helper.nth(0).locator('input[type=password]').fill('STATE_NEW_KEY');
  await helper.nth(1).locator('input[type=password]').fill('MEMORY_NEW_KEY');
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => [App.config.api.key, App.config.cost.stateApi.key, App.config.memory.summaryApi.key].join(',')))
    .toBe('MAIN_NEW_KEY,STATE_NEW_KEY,MEMORY_NEW_KEY');
  await page.evaluate(async () => Storage.flush());
  const serialized = await page.evaluate(() => JSON.stringify(Storage.loadStory()));
  for (const secret of ['MAIN_NEW_KEY', 'STATE_NEW_KEY', 'MEMORY_NEW_KEY', 'SECRET_STATE_BEFORE_RELOAD', 'SECRET_MEMORY_BEFORE_RELOAD'])
    expect(serialized).not.toContain(secret);
  expect(serialized).toContain('state-model');
  expect(serialized).toContain('memory-model');
});
