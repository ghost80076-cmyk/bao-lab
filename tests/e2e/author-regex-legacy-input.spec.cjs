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

// Synthetic legacy textarea fixture; do not publish anyone's original character card.
const fixture = { regex_scripts: [{
  scriptName: '舊平台選單', findRegex: '【舊平台選單】',
  replaceString: `<section id="legacy-menu"><button type="button" onclick="const t=document.querySelector('.chatMsgTextarea textarea')||document.querySelector('textarea');if(!t)throw Error('missing legacy input');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'查看圖鑑');t.dispatchEvent(new Event('input',{bubbles:true}));">查看圖鑑</button></section>`
}] };

async function start(page) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && App.characters?.length));
  await page.evaluate(async () => {
    await App.openCharacter(App.characters[0].id);
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
  await setPanelOpen(panel, true);
  await panel.locator('input[type=file]').setInputFiles({ name: 'legacy-test.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
  await expect(panel).toContainText('已匯入 1 個自訂介面設定');
  await setLabeledCheckbox(panel, '啟用自訂介面', true);
  await setLabeledCheckbox(panel, '保留互動介面', true);
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
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  await expect(frame.locator('#legacy-menu')).toBeVisible();
  await expect(frame.locator('.bao-author-legacy-input')).toHaveCount(1);
  const before = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }));
  await frame.getByRole('button', { name: '查看圖鑑' }).click();
  await expect(page.locator('#user-input')).toHaveValue('查看圖鑑');
  expect(await page.evaluate(() => window.__legacyApiCalls)).toBe(0);
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }))).toBe(before);
  await setLabeledCheckbox(panel, '啟用自訂介面', false);
  await expect(dock).toHaveCount(0);
});

test('mobile: isolated legacy UI does not shrink the main composer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const panel = await start(page);
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  await setPanelOpen(panel, false);
  await expect(panel).not.toHaveAttribute('open', '');

  const dock = page.locator('#bao-author-dock');
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(dock).toHaveCount(1);
  await expect(dock).not.toHaveAttribute('open', '');

  await expect(page.locator('#user-input')).toBeVisible();
  const width = await page.locator('#user-input').evaluate(el => el.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(100);

  await dock.evaluate(el => { el.open = true; el.dispatchEvent(new Event('toggle')); });
  await expect(frame.locator('#legacy-menu')).toBeVisible();
  await frame.getByRole('button', { name: '查看圖鑑' }).click({ force: true });
  await expect(page.locator('#user-input')).toHaveValue('查看圖鑑');
  expect(await page.evaluate(() => window.__legacyApiCalls)).toBe(0);
});
