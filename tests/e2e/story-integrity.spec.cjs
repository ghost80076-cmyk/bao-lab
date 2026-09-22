const { test, expect } = require('@playwright/test');

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

async function startStory(page, displayMode = 'text') {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && Storage.status().ready, null, { timeout: 15000 });
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  if (displayMode === 'ui') {
    // The radio is deliberately visually hidden; players click its visible label card.
    await page.locator('.builder-step[data-step-panel="2"] label.choice-card').filter({ has: page.locator('input[name="display-mode"][value="ui"]') }).click();
    await expect(page.locator('input[name="display-mode"][value="ui"]')).toBeChecked();
  }
  for (let step = 1; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://main.invalid/v1');
  await page.locator('#api-key').fill('MAIN_UNSAVED_BROWSER_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await page.waitForFunction(() => !!window.BAOStoryIntegrity && !!window.BAOStateTrackerRepairs && !!window.BAOChatExperienceRepairs && !!window.BAOMobileReadingLayout, null, { timeout: 15000 });
}

test('Android long story scrolls within the fixed reader; Enter inserts newline and drawer top returns to start', async ({ browser }, testInfo) => {
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
    const metrics = await page.evaluate(() => {
      const stream = document.getElementById('chat-stream');
      const layout = document.querySelector('#chat-view .chat-layout');
      const last = stream.lastElementChild;
      return { viewport: innerHeight, documentHeight: document.scrollingElement.scrollHeight,
        streamHeight: stream.getBoundingClientRect().height, streamMaxHeight: getComputedStyle(stream).maxHeight,
        streamOverflow: getComputedStyle(stream).overflowY, streamContentHeight: stream.scrollHeight,
        layoutHeight: layout.getBoundingClientRect().height, layoutOverflow: getComputedStyle(layout).overflowY,
        lastVisible: last.getBoundingClientRect().height > 0 && last.textContent.includes('長篇故事測試第 89 段'),
        oldJump: !!document.getElementById('bao-chat-jump') };
    });
    console.log('Android long-story layout:', JSON.stringify(metrics));
    expect(metrics.streamMaxHeight).toBe('none');
    expect(metrics.streamOverflow).toBe('auto');
    expect(metrics.layoutOverflow).toBe('hidden');
    expect(metrics.streamHeight).toBeGreaterThan(200);
    expect(metrics.streamHeight).toBeLessThan(metrics.viewport);
    expect(metrics.streamContentHeight).toBeGreaterThan(metrics.viewport * 2);
    expect(metrics.layoutHeight).toBeLessThanOrEqual(metrics.viewport + 20);
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewport + 20);
    expect(metrics.lastVisible).toBe(true);
    expect(metrics.oldJump).toBe(false);
    expect(await page.evaluate(() => GameState.current.events.filter(item => item.text === '林沉風離開房間。').length)).toBe(1);
    await expect(page.locator('#bao-mobile-tools-tab')).toBeVisible();
    await page.evaluate(() => { document.getElementById('chat-stream').scrollTop = document.getElementById('chat-stream').scrollHeight; });
    await expect.poll(() => page.evaluate(() => document.getElementById('chat-stream').scrollTop), { timeout: 5000 }).toBeGreaterThan(500);
    await page.locator('#bao-mobile-tools-tab').click();
    const drawer = page.locator('#bao-chat-tool-drawer');
    await expect(drawer).toBeVisible();
    const top = drawer.locator('.bao-mobile-quick button').filter({ hasText: '↑ 置頂' });
    await expect(top).toBeVisible();
    await top.click();
    await expect.poll(() => page.evaluate(() => document.getElementById('chat-stream').scrollTop), { timeout: 5000 }).toBeLessThan(30);
  } finally { await context.close().catch(() => {}); }
});

test('both reading modes share bottom floating top and donation controls', async ({ page }) => {
  await startStory(page, 'ui');
  const floating = page.locator('#bao-chat-floating-actions');
  await expect(floating.getByRole('button', { name: '跳至目前故事開頭' })).toBeVisible();
  await expect(floating.getByRole('link', { name: '投餵肉包' })).toBeVisible();
  await expect(page.locator('#bao-chat-top')).toBeHidden();
  await page.evaluate(() => { App.config.displayMode = 'text'; App.renderChatShell(false); });
  await expect(page.locator('#game-ui')).toBeHidden();
  await expect(floating.getByRole('button', { name: '跳至目前故事開頭' })).toBeVisible();
  await expect(floating.getByRole('link', { name: '投餵肉包' })).toHaveAttribute('href', /ko-fi\.com/);
  expect(await page.locator('#bao-chat-floating-actions button').count()).toBe(1);
});

test('a failed Gemini-like send preserves the draft and does not corrupt historical renderers', async ({ page }) => {
  await startStory(page);
  await page.evaluate(() => {
    Chat.add('user', '前一次的玩家訊息');
    Chat.add('assistant', '<b>已保存的歷史敘事</b>');
    App.renderChatShell(false);
    BAOSceneHTML.prefs.mode = 'free';
    BAOSceneHTML.refresh();
    API.send = async () => { throw new Error('測試 429：請求太頻繁或額度不足'); };
  });
  await expect(page.locator('#chat-stream .message.assistant .bubble b')).toContainText('已保存的歷史敘事');
  const before = await page.locator('#chat-stream > .message').count();
  await page.locator('#user-input').fill('這則訊息應在失敗後返回輸入框');
  await page.locator('#chat-view .composer button.primary').click();
  await expect(page.locator('#user-input')).toHaveValue('這則訊息應在失敗後返回輸入框');
  await expect(page.locator('#bao-chat-send-feedback')).toContainText('測試 429');
  await expect(page.locator('#chat-stream > .message')).toHaveCount(before);
  await page.evaluate(() => BAOSceneHTML.refresh());
  await expect(page.locator('#chat-stream .message.assistant .bubble b')).toContainText('已保存的歷史敘事');
  expect(await page.evaluate(() => Chat.messages.map(m => m.content))).toEqual(['前一次的玩家訊息', '<b>已保存的歷史敘事</b>']);
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
  const dialog = page.getByRole('dialog', { name: '目前故事的 AI 連線設定' });
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
  const dialog = page.getByRole('dialog', { name: '目前故事的 AI 連線設定' });
  const state = dialog.locator('.bao-helper-reconnect fieldset').first();
  await expect(state.locator('select').first()).toHaveValue('same');
  await expect(state).toContainText('state-on-main-provider');
  await dialog.locator('input[name=key]').fill('ONE_MAIN_KEY');
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  await expect.poll(() => page.evaluate(() => [App.config.api.key, App.config.cost.stateModel, App.config.cost.stateApiMode].join('|')))
    .toBe('ONE_MAIN_KEY|state-on-main-provider|same');
  expect(await page.evaluate(() => App.config.cost.stateApi)).toBe(null);
});

test('resumed story can edit output tokens and budget without resetting messages or storing keys', async ({ page }) => {
  await startStory(page);
  await page.locator('#bao-chat-cost-open').click();
  const form = page.locator('#bao-chat-cost-form');
  await expect(form).toBeVisible();
  await form.locator('[name="maxOutputTokens"]').fill('2048');
  await form.locator('[name="budgetTwd"]').fill('70');
  await form.locator('[name="maxContext"]').fill('24000');
  await form.getByRole('button', { name: '儲存到目前故事' }).click();
  await expect(page.locator('#bao-chat-cost-backdrop')).toHaveCount(0);
  await page.evaluate(async () => { await Storage.flush(); });
  const saved = await page.evaluate(() => ({
    active: App.config.cost.maxOutputTokens, maxContext: App.config.memory.maxContext,
    story: Storage.loadStory()?.config?.cost?.maxOutputTokens,
    key: Storage.loadStory()?.config?.api?.key || ''
  }));
  expect(saved).toEqual({ active: 2048, maxContext: 24000, story: 2048, key: '' });
  await page.reload();
  await page.locator('#home-continue').click();
  const api = page.getByRole('dialog', { name: '目前故事的 AI 連線設定' });
  await api.locator('input[name="key"]').fill('A_SESSION_ONLY_KEY');
  await api.getByRole('button', { name: '套用到目前故事' }).click();
  await page.locator('#bao-chat-cost-open').click();
  await expect(page.locator('#bao-chat-cost-form [name="maxOutputTokens"]')).toHaveValue('2048');
  await expect(page.locator('#bao-chat-cost-form [name="budgetTwd"]')).toHaveValue('70');
  await expect(page.locator('#bao-chat-cost-form [name="maxContext"]')).toHaveValue('24000');
});
