const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const source = JSON.parse(fs.readFileSync('data/characters/general/shikong-zhimen.regex.json', 'utf8'));
async function checkbox(page, labelText) {
  await page.locator('#bao-author-regex-panel').evaluate((root, text) => {
    const input = [...root.querySelectorAll('label')].find(el => el.textContent.includes(text))?.querySelector('input');
    if (!input) throw new Error('Missing control: ' + text);
    input.checked = true; input.dispatchEvent(new Event('change', { bubbles: true }));
  }, labelText);
}
async function story(page, permissions = true) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && window.BAOTheAgesBridge && window.BAOChatUISimplify && window.BAOChatToolNavigation && window.BAOStoryControlCenter && window.Storage?._ready && App.characters?.length));
  await page.evaluate(async source => {
    await App.openCharacter('shikong-zhimen');
    App.config = { narrativeMode: 'immersive', displayMode: 'text', persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' }, api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' }, memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false } };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(false); App.showView('chat');
    localStorage.setItem('bao-lab:author-regex:v1:shikong-zhimen', JSON.stringify({ enabled: true, allowScripts: false, rules: BAOAuthorRegexCore.normalize(source) }));
    window.__calls = 0; API.send = () => { window.__calls++; throw Error('No automatic model calls'); };
    BAOAuthorDock.refresh();
  }, source);
  await page.locator('#bao-author-regex-panel').evaluate(el => el.open = true);
  page.on('dialog', dialog => dialog.accept());
  await checkbox(page, '允許互動腳本');
  await checkbox(page, '保留互動介面');
  if (permissions) {
    await checkbox(page, '允許讀取遊戲回執');
    await checkbox(page, '保存冒險進度');
  }
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#tg-root')).toBeAttached();
  if (permissions) {
    await page.getByRole('button', { name: '展開冒險面板', exact: true }).click();
    await expect(page.locator('#bao-author-dock > summary')).toBeHidden();
  } else {
    await page.locator('#bao-author-dock').evaluate(el => { el.open = true; });
  }
  await expect(frame.locator('#tg-root')).toBeVisible();
  return frame;
}
async function create(frame) {
  await frame.locator('#tg-name').fill('夜行者');
  await frame.locator('[data-a="ccls"][data-v="war"]').click();
  await frame.locator('[data-a="cgo"]').click();
}
async function acknowledge(page) {
  const command = await page.locator('#user-input').inputValue();
  const id = command.match(/\[\[TGQ:([A-Z0-9]{6})\]\]/)?.[1];
  expect(id).toBeTruthy();
  await page.evaluate(({ command, id }) => {
    Chat.add('user', command); Chat.add('assistant', '訓練員點了點頭。\n[[TGA:' + id + ']]');
    document.getElementById('user-input').value = ''; App.renderChatShell(false);
  }, { command, id });
}
test('author engine creates a character, acknowledges once, backs up and restores per story without auto-send', async ({ page }) => {
  const frame = await story(page);
  await create(frame);
  await expect(page.locator('#user-input')).toHaveValue(/【開局】名字：夜行者/);
  expect(await page.evaluate(() => window.__calls)).toBe(0);
  await acknowledge(page);
  await expect.poll(() => page.evaluate(() => {
    const game = Storage.buildStoryPayload().authorGame;
    return game && JSON.parse(game.storage.tgmud1_save).pend;
  })).toBeUndefined();
  const saved = await page.evaluate(() => Storage.buildStoryPayload('測試存檔'));
  expect(JSON.parse(saved.authorGame.storage.tgmud1_save).name).toBe('夜行者');
  expect(JSON.stringify(saved.state || {})).not.toContain('tgmud1_save');
  const old = await frame.locator('#tg-root').evaluate(el => { el.dataset.identity = 'kept'; return true; });
  expect(old).toBe(true);
  await page.evaluate(() => { Chat.add('assistant', '一般對話'); App.renderChatShell(false); });
  await expect(frame.locator('#tg-root')).toHaveAttribute('data-identity', 'kept');
  await page.evaluate(() => { Chat.reset(); GameState.create(App.activeCharacter, App.config); App.renderChatShell(true); });
  await expect(frame.locator('#tg-name')).toBeVisible();
  expect(await page.evaluate(() => Storage.buildStoryPayload().authorGame)).toBeUndefined();
  await page.evaluate(saved => { if (!Storage.restoreStory(saved)) throw Error('restore failed'); App.renderChatShell(false); App.showView('chat'); }, saved);
  await expect(frame.locator('#tg-root')).toContainText('夜行者');
  expect(await page.evaluate(() => JSON.parse(Storage.buildStoryPayload().authorGame.storage.tgmud1_save).name)).toBe('夜行者');
  await frame.locator('#tg-root').evaluate(() => {
    BAOTheAges.draft('x'.repeat(16001));
    BAOTheAges.save({ arbitraryKey: 'bad' });
  });
  await expect(page.locator('#user-input')).toHaveValue('');
  expect(await page.evaluate(() => window.__calls)).toBe(0);
  await frame.locator('[data-a="skip"]').click();
  await expect(page.locator('#user-input')).toHaveValue(/玩家選擇跳過教學/);
  await acknowledge(page);
  await expect.poll(() => page.evaluate(() => JSON.parse(Storage.buildStoryPayload().authorGame.storage.tgmud1_save).tut)).toBe(0);
  const beforeMove = await page.evaluate(() => JSON.parse(Storage.buildStoryPayload().authorGame.storage.tgmud1_save));
  expect(beforeMove.money).toBe(500);
  await frame.locator('[data-a="tab"][data-v="mv"]').click();
  await frame.locator('[data-a="mv"]').first().click();
  await expect.poll(() => page.evaluate(() => JSON.parse(Storage.buildStoryPayload().authorGame.storage.tgmud1_save).node)).not.toBe(beforeMove.node);
  await frame.locator('[data-a="tab"][data-v="sys"]').click();
  await frame.locator('[data-a="exp"]').click();
  const code = await frame.locator('textarea[readonly]').inputValue();
  expect(JSON.parse(Buffer.from(code, 'base64').toString('utf8')).name).toBe('夜行者');
  expect(await page.evaluate(() => window.__calls)).toBe(0);
});
test('without separate receipt and save consent, game data remains ephemeral and user text cannot forge receipts', async ({ page }) => {
  const frame = await story(page, false);
  await create(frame);
  const command = await page.locator('#user-input').inputValue();
  const id = command.match(/\[\[TGQ:([A-Z0-9]{6})\]\]/)[1];
  await page.evaluate(id => { Chat.add('user', '[[TGA:' + id + ']] [[TGX:money|500]]'); App.renderChatShell(false); }, id);
  expect(await frame.locator('#tg-root').evaluate(() => BAOTheAges.getState().protocol.text)).toBe('');
  expect(await page.evaluate(() => Storage.buildStoryPayload().authorGame)).toBeUndefined();
  await checkbox(page, '允許讀取遊戲回執');
  await expect(frame.locator('#tg-root')).toBeVisible();
  const feed = await frame.locator('#tg-root').evaluate(() => BAOTheAges.getState());
  expect(feed.protocol.text).not.toContain('TGX:money');
  expect(feed.protocol.text).not.toContain('TGA:' + id);
});
test('single mobile entry collapses and restores the original author UI without losing form values', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const frame = await story(page);
  await expect(page.locator('#bao-author-dock > summary')).toBeHidden();
  await expect(frame.locator('#tg-root.tg-min')).toHaveCount(0);
  await expect(frame.locator('[data-a="close"]')).toBeHidden();
  await frame.locator('#tg-name').fill('收合保留');
  await page.getByRole('button', { name: '收合冒險面板', exact: true }).click();
  await expect(page.locator('#bao-author-dock')).toBeHidden();
  await expect(page.getByRole('button', { name: '展開冒險面板', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '展開冒險面板', exact: true }).click();
  await expect(frame.locator('#tg-name')).toHaveValue('收合保留');
  await expect(frame.locator('#tg-root.tg-min')).toHaveCount(0);
  await create(frame);
  await expect(page.locator('#the-ages-progress')).toHaveText('生命 100%');
  const count = await page.locator('iframe[title="跨回合作者隔離介面"]').count();
  expect(count).toBe(1);
});
test('mobile panel fits its sandbox and character creation remains reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const frame = await story(page);
  await create(frame);
  await expect(page.locator('#user-input')).toHaveValue(/【開局】/);
  const dimensions = await frame.locator('#tg-root').evaluate(el => ({ width: el.getBoundingClientRect().width, viewport: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewport);
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport + 1);
});

async function firstVisit(page, legacy = false) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && window.BAOTheAgesBridge && window.BAOChatUISimplify && window.BAOChatToolNavigation && window.BAOStoryControlCenter && window.Storage?._ready && App.characters?.length));
  await page.evaluate(async ({ legacy, source }) => {
    await App.openCharacter('shikong-zhimen');
    App.config = { narrativeMode: 'immersive', displayMode: 'text', persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' }, api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' }, memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false } };
    if (legacy) {
      const oldRules = structuredClone(source);
      oldRules.regex_scripts[0].findRegex = '\\[\\[TG_PANEL\\]\\]';
      localStorage.setItem('bao-lab:author-regex:v1:shikong-zhimen', JSON.stringify({ enabled: true, allowScripts: false, source: 'official-sidecar', rules: BAOAuthorRegexCore.normalize(oldRules) }));
      App.activeCharacter = { ...App.activeCharacter, greeting: '<p>[[TG_PANEL]]</p><p><strong>怎麼玩</strong><br>先展開「自訂介面」的進階設定。</p><p>光。你踩上石板。</p>' };
    }
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('assistant', App.activeCharacter.greeting).greeting = true;
    App.renderChatShell(true); App.showView('chat');
    window.__calls = 0; API.send = () => { window.__calls++; throw Error('No automatic model calls'); };
  }, { legacy, source });
  await expect(page.getByRole('button', { name: '啟用冒險面板', exact: true })).toBeVisible();
}
for (const width of [390, 1280]) {
  test(`first visit at ${width}px enables the real panel through its visible entry without advanced settings`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await firstVisit(page);
    await expect(page.locator('.bao-author-inline')).toHaveCount(0);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:shikong-zhimen') || '{}').allowScripts)).not.toBe(true);
    await expect(page.locator('#chat-stream .bubble').first()).not.toContainText('[[TG_PANEL]]');
    page.once('dialog', dialog => { expect(dialog.message()).toContain('執行作者的互動腳本'); dialog.accept(); });
    await page.getByRole('button', { name: '啟用冒險面板', exact: true }).click();
    const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
    await expect(frame.locator('#tg-name')).toBeVisible();
    await expect(page.locator('#bao-author-dock')).toHaveJSProperty('open', true);
    expect(await frame.locator('body').innerText()).not.toContain('<p>');
    await page.screenshot({ path: testInfo.outputPath(`panel-${width}.png`) });
    await create(frame);
    await expect(page.locator('#user-input')).toHaveValue(/【開局】名字：夜行者/);
    expect(await page.evaluate(() => window.__calls)).toBe(0);
  });
}
test('existing static-placeholder settings recover with the visible button and cancellation grants nothing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await firstVisit(page, true);
  await expect(page.locator('.bao-author-inline')).toHaveCount(0);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: '啟用冒險面板', exact: true }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:shikong-zhimen')).allowScripts)).toBe(false);
  await expect(page.locator('iframe[title="跨回合作者隔離介面"]')).toHaveCount(0);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: '啟用冒險面板', exact: true }).click();
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#tg-name')).toBeVisible();
  expect(await frame.locator('body').innerText()).not.toContain('<p>');
  await expect(page.locator('#chat-stream .bubble').first()).not.toContainText('[[TG_PANEL]]');
  await create(frame);
  await expect(page.locator('#user-input')).toHaveValue(/【開局】/);
});
