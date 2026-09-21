const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const rules = { regex_scripts: [{
  scriptName: '常駐介面', findRegex: '【常駐開屏】',
  replaceString: `<section id="persistent-card"><span id="author-state">等待狀態</span><button onclick="BAOAuthor.draft('打開圖鑑')">打開圖鑑</button><script>window.__kept=1;window.addEventListener('bao:statechange',function(e){var s=e.detail;document.getElementById('author-state').textContent=s.time+'｜'+s.location+'｜'+(s.characterStatuses['阿花']||{}).trust;});</script></section>`
}] };

async function story(page) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && App.characters?.length));
  await page.evaluate(() => {
    App.openCharacter(App.characters[0].id);
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
  await panel.locator('summary').click();
  await panel.locator('input[type=file]').setInputFiles({ name: 'author-regex.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rules)) });
  await expect(panel).toContainText('已保存 1 條原始正則');
  await panel.getByLabel('在這張角色卡啟用作者介面').check();
  return panel;
}

test('author UI survives turns, updates from the same world state, and cannot send an API request', async ({ page }) => {
  const panel = await story(page);
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許作者腳本（需自行信任來源）').check();
  await panel.getByLabel('跨回合常駐作者介面（不必每輪重建）').check();
  const dock = page.locator('#bao-author-dock');
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(dock).toHaveCount(1);
  await expect(frame.locator('#persistent-card')).toBeVisible();
  await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
  await page.evaluate(() => {
    GameState.current.characterStatuses = { '阿花': { trust: 7 } };
    GameState.applyUpdate({ time: '星期一 早晨', location: '廣場', npcs: [{ name: '阿花', mood: '開心', presence: 'present' }] });
  });
  await expect(frame.locator('#author-state')).toHaveText('星期一 早晨｜廣場｜7');
  const frameIdentity = await frame.locator('#persistent-card').evaluate(node => {
    node.dataset.testIdentity = 'original-frame';
    return node.ownerDocument.defaultView.__kept;
  });
  expect(frameIdentity).toBe(1);
  await page.evaluate(() => {
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
  await page.evaluate(() => { Chat.reset(); GameState.create(App.activeCharacter, App.config); App.renderChatShell(true); });
  await expect(dock).toHaveCount(0); // Same card, but a different story must not inherit its previous UI.
});

test('persistent script-based interface is not executed by default and can be disabled', async ({ page }) => {
  const panel = await story(page);
  await panel.getByLabel('跨回合常駐作者介面（不必每輪重建）').check();
  await expect(page.locator('#bao-author-dock')).toHaveCount(0);
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toContainText('【常駐開屏】');
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許作者腳本（需自行信任來源）').check();
  await expect(page.locator('#bao-author-dock')).toHaveCount(1);
  await panel.getByLabel('在這張角色卡啟用作者介面').uncheck();
  await expect(page.locator('#bao-author-dock')).toHaveCount(0);
  expect(await page.evaluate(() => window.__testApiCalls)).toBe(0);
});
