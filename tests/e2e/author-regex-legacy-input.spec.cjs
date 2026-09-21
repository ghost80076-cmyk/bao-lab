const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

// Synthetic legacy textarea fixture; do not publish anyone's original character card.
const fixture = { regex_scripts: [{
  scriptName: '舊平台選單', findRegex: '【舊平台選單】',
  replaceString: `<section id="legacy-menu"><button type="button" onclick="const t=document.querySelector('.chatMsgTextarea textarea')||document.querySelector('textarea');if(!t)throw Error('missing legacy input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'查看圖鑑');t.dispatchEvent(new Event('input',{bubbles:true}));">查看圖鑑</button></section>`
}] };

async function start(page) {
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
    Chat.add('assistant', '【舊平台選單】');
    App.renderChatShell(false); App.showView('chat');
    window.__legacyApiCalls = 0;
    API.send = () => { window.__legacyApiCalls++; throw new Error('Author interface must not call API'); };
  });
  const panel = page.locator('#bao-author-regex-panel');
  await panel.locator('summary').click();
  await panel.locator('input[type=file]').setInputFiles({ name: 'legacy-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(panel).toContainText('已保存 1 條原始正則');
  await panel.getByLabel('在這張角色卡啟用作者介面').check();
  await panel.getByLabel('跨回合常駐作者介面（不必每輪重建）').check();
  return panel;
}

test('legacy textarea action drafts only after a player click, no extra API or story writes', async ({ page }) => {
  const panel = await start(page);
  const dock = page.locator('#bao-author-dock');
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#legacy-menu')).toBeVisible();
  await frame.getByRole('button', { name: '查看圖鑑' }).click();
  await expect(page.locator('#user-input')).toHaveValue(''); // Untrusted JS must not run in static view.
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許作者腳本（需自行信任來源）').check();
  await expect(frame.locator('#legacy-menu')).toBeVisible();
  await expect(frame.locator('.bao-author-legacy-input')).toHaveCount(1);
  const before = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }));
  await frame.getByRole('button', { name: '查看圖鑑' }).click();
  await expect(page.locator('#user-input')).toHaveValue('查看圖鑑');
  expect(await page.evaluate(() => window.__legacyApiCalls)).toBe(0);
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }))).toBe(before);
  await panel.getByLabel('在這張角色卡啟用作者介面').uncheck();
  await expect(dock).toHaveCount(0);
});

test('mobile: isolated legacy UI does not shrink the main composer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await start(page);
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許作者腳本（需自行信任來源）').check();
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#legacy-menu')).toBeVisible();
  await panel.locator('summary').click();
  await expect(panel).not.toHaveAttribute('open', '');
  await expect(page.locator('#user-input')).toBeVisible();
  const width = await page.locator('#user-input').evaluate(el => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(100);
  await frame.getByRole('button', { name: '查看圖鑑' }).click();
  await expect(page.locator('#user-input')).toHaveValue('查看圖鑑');
  expect(await page.evaluate(() => window.__legacyApiCalls)).toBe(0);
});
