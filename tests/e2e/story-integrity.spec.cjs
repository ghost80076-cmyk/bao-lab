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

test('Android keeps full-height story visible, Enter inserts newline, in-tab top button jumps back', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Android mobile emulation is tested in Chromium');
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ANDROID, hasTouch: true, isMobile: true });
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
        stream.append(line);
      }
      GameState.addEvent('玩家與 林沉風 完成一輪互動。');
      GameState.applyUpdate({ new_events: ['林沉風離開房間。', '林沉風返回客廳。'] });
      GameState.applyUpdate({ new_events: ['林沉風離開房間。', '林沉風返回客廳。'] });
    });
    await expect.poll(() => page.evaluate(() => {
      const stream = document.getElementById('chat-stream');
      const layout = document.querySelector('#chat-view .chat-layout');
      return getComputedStyle(stream).maxHeight === 'none' &&
        stream.scrollHeight - stream.clientHeight < 30 &&
        layout.getBoundingClientRect().height > window.innerHeight * 2 &&
        document.scrollingElement.scrollHeight > window.innerHeight * 2 &&
        !document.getElementById('bao-chat-jump');
    }), { timeout: 7000 }).toBe(true);
    expect(await page.evaluate(() => GameState.current.events.filter(item => item.text === '林沉風離開房間。').length)).toBe(1);
    const top = page.locator('#chat-view .ui-tabs #bao-chat-top');
    await expect(top).toBeVisible();
    await expect(top).toHaveText('↑ 置頂');
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5000 }).toBeGreaterThan(500);
    await top.click();
    await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById('chat-stream').getBoundingClientRect().top -
      (document.querySelector('.topbar')?.getBoundingClientRect().height || 0) - 8)), { timeout: 5000 }).toBeLessThan(25);
  } finally { await context.close().catch(() => {}); }
});

test('resuming shows saved main, state and memory model metadata; only keys need reentry', async ({ page }) => {
  await startStory(page);
  await page.evaluate(async () => {
    App.config.cost ||= {};
    App.config.memory ||= {};
    App.config.cost.stateApi = { model: 'state-model', protocol: 'openai', baseUrl: 'https://state.invalid/v1', key: 'SECRET_STATE_BEFORE_RELOAD' };
    App.config.memory.summaryApi = { model: 'memory-model', protocol: 'openai', baseUrl: 'https://memory.invalid/v1', key: 'SECRET_MEMORY_BEFORE_RELOAD' };
    GameState.current.time = '民國115年9月19日晚上';
    GameState.current.config = App.config;
    App.saveStory(false);
    await Storage.flush();
  });
  await page.reload();
  await page.waitForFunction(() => Storage.status().ready && !!window.BAOChatAPISettings?.restore, null, { timeout: 15000 });
  await page.locator('#continue-story').click();
  const dialog = page.getByRole('dialog', { name: '故事 API 設定' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('input[name=model]')).toHaveValue('local-browser-test');
  await expect(dialog.locator('input[name=baseUrl]')).toHaveValue('https://main.invalid/v1');
  const helper = dialog.locator('.bao-helper-reconnect fieldset');
  await expect(helper).toHaveCount(2);
  await expect(helper.nth(0).locator('select').first()).toHaveValue('separate');
  await expect(helper.nth(1).locator('select').first()).toHaveValue('separate');
  await expect(helper.nth(0).locator('input[type=text]')).toHaveValue('state-model');
  await expect(helper.nth(0).locator('input[type=url]')).toHaveValue('https://state.invalid/v1');
  await expect(helper.nth(1).locator('input[type=text]')).toHaveValue('memory-model');
  await expect(helper.nth(1).locator('input[type=url]')).toHaveValue('https://memory.invalid/v1');
  await dialog.locator('input[name=key]').fill('MAIN_NEW_KEY');
  await helper.nth(0).locator('input[type=password]').fill('STATE_NEW_KEY');
  await helper.nth(1).locator('input[type=password]').fill('MEMORY_NEW_KEY');
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => [App.config.api.key, App.config.cost.stateApi.key, App.config.memory.summaryApi.key].join(',')))
    .toBe('MAIN_NEW_KEY,STATE_NEW_KEY,MEMORY_NEW_KEY');
  expect(await page.evaluate(() => GameState.current.time)).toBe('民國115年9月19日晚上');
  await page.evaluate(async () => Storage.flush());
  const serialized = await page.evaluate(() => JSON.stringify(Storage.loadStory()));
  for (const secret of ['MAIN_NEW_KEY', 'STATE_NEW_KEY', 'MEMORY_NEW_KEY', 'SECRET_STATE_BEFORE_RELOAD', 'SECRET_MEMORY_BEFORE_RELOAD'])
    expect(serialized).not.toContain(secret);
  for (const metadata of ['local-browser-test', 'https://main.invalid/v1', 'state-model', 'https://state.invalid/v1', 'memory-model', 'https://memory.invalid/v1'])
    expect(serialized).toContain(metadata);
});

test('same-provider helper model is restored without requesting a second key', async ({ page }) => {
  await startStory(page);
  await page.evaluate(async () => {
    App.config.cost ||= {};
    App.config.cost.stateModel = 'state-on-main-provider';
    App.config.cost.stateApiMode = 'same';
    App.config.cost.stateApi = null;
    GameState.current.config = App.config;
    App.saveStory(false);
    await Storage.flush();
  });
  await page.reload();
  await page.waitForFunction(() => Storage.status().ready && !!window.BAOChatAPISettings?.restore);
  await page.locator('#continue-story').click();
  const dialog = page.getByRole('dialog', { name: '故事 API 設定' });
  const state = dialog.locator('.bao-helper-reconnect fieldset').first();
  await expect(state.locator('select').first()).toHaveValue('same');
  await expect(state).toContainText('state-on-main-provider');
  await dialog.locator('input[name=key]').fill('ONE_MAIN_KEY');
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  await expect.poll(() => page.evaluate(() => [App.config.api.key, App.config.cost.stateModel, App.config.cost.stateApiMode].join('|')))
    .toBe('ONE_MAIN_KEY|state-on-main-provider|same');
  expect(await page.evaluate(() => App.config.cost.stateApi)).toBe(null);
});