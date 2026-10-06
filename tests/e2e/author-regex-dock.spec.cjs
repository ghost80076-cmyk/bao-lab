const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

async function setPanelOpen(panel, open) {
  await panel.evaluate((el, value) => { el.open = value; }, open);
}

async function setLabeledCheckbox(panel, labelText, checked) {
  await panel.evaluate((root, args) => {
    const label = [...root.querySelectorAll('label')].find(node =>
      String(node.textContent || '').includes(args.labelText)
    );
    const input = label?.querySelector('input[type="checkbox"]');
    if (!input) throw new Error('checkbox not found: ' + args.labelText);
    if (input.checked === args.checked) return;
    input.checked = args.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, { labelText, checked });
}

const rules = { regex_scripts: [{
  scriptName: '常駐介面', findRegex: '【常駐開屏】',
  replaceString: `<section id="persistent-card"><span id="author-state">等待狀態</span><button onclick="BAOAuthor.draft('打開圖鑑')">打開圖鑑</button><script>window.__kept=1;window.addEventListener('bao:statechange',function(e){var s=e.detail;document.getElementById('author-state').textContent=s.time+'｜'+s.location+'｜'+(s.characterStatuses['阿花']||{}).trust;});</script></section>`
}] };

async function story(page, source = rules) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && App.characters?.length));
  await page.evaluate(async () => {
    await App.openCharacter(App.characters[0].id);
    App.activeCharacter = {
      ...App.activeCharacter,
      character_status: { enabled: true, fields: [
        { key: 'trust', label: '信任', type: 'number', default: 0 }
      ] }
    };
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('assistant', '【常駐開屏】');
    App.renderChatShell(false); App.showView('chat');
    window.__testApiCalls = 0;
    API.send = () => { window.__testApiCalls++; throw new Error('UI must not call API'); };
  });
  await expect(page.locator('#bao-author-regex-panel')).toHaveCount(1);
  const panel = page.locator('#bao-author-regex-panel');
  await setPanelOpen(panel, true);
  await panel.locator('input[type=file]').setInputFiles({ name: 'author-regex.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source)) });
  await expect(panel).toContainText('已保存 1 條原始正則');
  await setLabeledCheckbox(panel, '啟用自訂介面', true);
  return panel;
}

test('author UI survives turns, updates from consented world state, and cannot send an API request', async ({ page }) => {
  const panel = await story(page);
  await page.evaluate(() => GameState.applyUpdate({ time: '啟動畫面', location: '開始地點' }));
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許讀取故事狀態', true);
  await setLabeledCheckbox(panel, '保留互動介面', true);
  const dock = page.locator('#bao-author-dock');
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(dock).toHaveCount(1);
  await expect(frame.locator('#persistent-card')).toBeVisible();
  await expect(frame.locator('#author-state')).toHaveText('啟動畫面｜開始地點｜undefined');
  await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
  await page.evaluate(async () => {
    GameState.applyUpdate({ time: '星期一 早晨', location: '廣場', npcs: [{ name: '阿花', mood: '開心', presence: 'present' }], character_statuses: { '阿花': { trust: 7 } } });
  });
  await expect(frame.locator('#author-state')).toHaveText('星期一 早晨｜廣場｜7');
  const frameIdentity = await frame.locator('#persistent-card').evaluate(node => {
    node.dataset.testIdentity = 'original-frame';
    return node.ownerDocument.defaultView.__kept;
  });
  expect(frameIdentity).toBe(1);
  await page.evaluate(async () => {
    Chat.add('user', '繼續'); Chat.add('assistant', '新一輪劇情，沒有開屏標記。');
    App.renderChatShell(false);
  });
  await expect(frame.locator('#persistent-card')).toHaveAttribute('data-test-identity', 'original-frame');
  await expect(frame.locator('#author-state')).toHaveText('星期一 早晨｜廣場｜7');
  await page.evaluate(() => GameState.applyUpdate({ time: '星期一 中午', location: '圖書館' }));
  await expect(frame.locator('#author-state')).toHaveText('星期一 中午｜圖書館｜7');
  const before = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }));
  await frame.getByRole('button', { name: '打開圖鑑' }).click();
  await expect(page.locator('#user-input')).toHaveValue('打開圖鑑');
  expect(await page.evaluate(() => window.__testApiCalls)).toBe(0);
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }))).toBe(before);
  await page.evaluate(async () => { Chat.reset(); GameState.create(App.activeCharacter, App.config); App.renderChatShell(true); });
  await expect(dock).toHaveCount(0);
});

test('static persistent view keeps HTML but cannot execute JS until separately allowed', async ({ page }) => {
  const panel = await story(page);
  await setLabeledCheckbox(panel, '保留互動介面', true);
  const dock = page.locator('#bao-author-dock');
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#persistent-card')).toBeVisible();
  expect(await frame.locator('#persistent-card').evaluate(node => ({
    ran: node.ownerDocument.defaultView.__kept, bridge: typeof node.ownerDocument.defaultView.BAOAuthor
  }))).toEqual({ ran: undefined, bridge: 'undefined' });
  await frame.getByRole('button', { name: '打開圖鑑' }).click();
  await expect(page.locator('#user-input')).toHaveValue('');
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  await expect.poll(async () => frame.locator('#persistent-card').evaluate(node => node.ownerDocument.defaultView.__kept)).toBe(1);
  await expect(frame.locator('#author-state')).toHaveText('等待狀態');
  await setLabeledCheckbox(panel, '啟用自訂介面', false);
  await expect(dock).toHaveCount(0);
  expect(await page.evaluate(() => window.__testApiCalls)).toBe(0);
});

test('author script receives no world state without separate consent; revocation destroys old state', async ({ page }) => {
  const panel = await story(page);
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  await setLabeledCheckbox(panel, '保留互動介面', true);
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#persistent-card')).toBeVisible();
  await page.evaluate(() => GameState.applyUpdate({ time: '私密時間', location: '秘密房間' }));
  await expect(frame.locator('#author-state')).toHaveText('等待狀態');
  expect(await frame.locator('#persistent-card').evaluate(node => node.ownerDocument.defaultView.BAOAuthor.getState())).toEqual({});
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許讀取故事狀態', true);
  await expect(frame.locator('#author-state')).toHaveText('私密時間｜秘密房間｜undefined');
  expect(await frame.locator('#persistent-card').evaluate(node => node.ownerDocument.defaultView.BAOAuthor.getState())).toMatchObject({ time: '私密時間' });
  await setLabeledCheckbox(panel, '允許讀取故事狀態', false);
  await expect(frame.locator('#author-state')).toHaveText('等待狀態');
  expect(await frame.locator('#persistent-card').evaluate(node => node.ownerDocument.defaultView.BAOAuthor.getState())).toEqual({});
  await page.evaluate(() => GameState.applyUpdate({ time: '再次更新', location: '不公開' }));
  await expect(frame.locator('#author-state')).toHaveText('等待狀態');
  expect(await page.evaluate(() => window.__testApiCalls)).toBe(0);
});

test('external images are blocked until separate per-card permission is granted', async ({ page }) => {
  const media = { regex_scripts: [{ scriptName: '媒體權限', findRegex: '【常駐開屏】',
    replaceString: '<div id="media-card">靜態圖片<img src="https://assets.example.test/tracker.png?private=not-for-server"></div>' }] };
  let requests = 0;
  await page.route('https://assets.example.test/**', route => {
    requests++;
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLttAAAAABJRU5ErkJggg==', 'base64') });
  });
  const panel = await story(page, media);
  await setLabeledCheckbox(panel, '保留互動介面', true);
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#media-card')).toBeVisible();
  expect(requests).toBe(0);
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許外部圖片、字型與媒體', true);
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect(frame.locator('img')).toHaveJSProperty('naturalWidth', 1);
  expect(await page.evaluate(() => Boolean(window.GameState.current))).toBe(true);
});
