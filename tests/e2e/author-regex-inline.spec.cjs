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

const rules = { regex_scripts: [
  { scriptName: '介面樣式', findRegex: '【開屏】', replaceString: '<style>.author-panel{color:rgb(255,0,0)}</style>' },
  { scriptName: '介面按鈕', findRegex: '【開屏1】', replaceString: '<div class="author-panel"><button onclick="BAOAuthor.draft(\'查看照片\')">查看照片</button><script>window.__authorScriptRan=true</script></div>' }
] };

async function startDemo(page) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorInline && App.characters?.length));
  await page.evaluate(async () => {
    await App.openCharacter(App.characters[0].id);
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true); App.showView('chat');
  });
  await expect(page.locator('#user-input')).toBeVisible();
  await expect(page.locator('#bao-author-regex-panel')).toHaveCount(1);
}

async function importRules(page) {
  const panel = page.locator('#bao-author-regex-panel');
  await setPanelOpen(panel, true);
  await panel.locator('input[type=file]').setInputFiles({ name: 'author-regex.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rules)) });
  await expect(panel).toContainText('已匯入 2 個自訂介面設定');
  await setLabeledCheckbox(panel, '啟用自訂介面', true);
  return panel;
}

test('author card renders inline, can toggle original, and drafts without extra API or state changes', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(async () => {
    Chat.add('user', '顯示開屏'); Chat.add('assistant', '【開屏】【開屏1】');
    App.renderChatShell(false);
  });
  const before = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }));
  const panel = await importRules(page);
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  const host = page.locator('#chat-stream .bao-author-inline');
  await expect(host).toHaveCount(1);
  const frame = page.frameLocator('iframe[title="聊天內作者隔離介面"]');
  await expect(frame.locator('.author-panel')).toBeVisible();
  await expect(frame.locator('.author-panel')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toBeHidden();
  await host.getByRole('button', { name: '查看原文' }).click();
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toBeVisible();
  await host.getByRole('button', { name: '顯示作者介面' }).click();
  await frame.getByRole('button', { name: '查看照片' }).click();
  await expect(page.locator('#user-input')).toHaveValue('查看照片');
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage, state: GameState.current }))).toBe(before);
  await setLabeledCheckbox(panel, '啟用自訂介面', false);
  await expect(host).toHaveCount(0);
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toBeVisible();
});

test('inline static HTML and CSS remain visible without script permission, and JS cannot run', async ({ page }) => {
  await startDemo(page);
  await page.evaluate(async () => { Chat.add('assistant', '【開屏】【開屏1】'); App.renderChatShell(false); });
  const panel = await importRules(page);
  const host = page.locator('#chat-stream .bao-author-inline');
  const frame = page.frameLocator('iframe[title="聊天內作者隔離介面"]');
  await expect(host).toHaveCount(1);
  await expect(frame.locator('.author-panel')).toBeVisible();
  await expect(frame.locator('.author-panel')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toBeHidden();
  expect(await frame.locator('.author-panel').evaluate(node => ({
    scriptRan: node.ownerDocument.defaultView.__authorScriptRan,
    bridge: typeof node.ownerDocument.defaultView.BAOAuthor
  }))).toMatchObject({ scriptRan: undefined, bridge: 'undefined' });
  await frame.getByRole('button', { name: '查看照片' }).click();
  await expect(page.locator('#user-input')).toHaveValue('');
  page.once('dialog', dialog => dialog.accept());
  await setLabeledCheckbox(panel, '允許互動腳本', true);
  // The old static iframe remains visible while the worker prepares the new one.
  // Wait for the permission-triggered remount rather than asserting against it.
  await expect(page.locator('iframe[title="聊天內作者隔離介面"]')).toHaveAttribute('sandbox', 'allow-scripts');
  await expect.poll(async () => frame.locator('.author-panel').evaluate(node => node.ownerDocument.defaultView.__authorScriptRan)).toBe(true);
  const isolation = await frame.locator('.author-panel').evaluate(node => {
    const win = node.ownerDocument.defaultView;
    let parentDocumentAccessible = false;
    let parentStorageAccessible = false;
    try { parentDocumentAccessible = Boolean(win.parent.document.body); } catch (_) { /* Cross-origin. */ }
    try { parentStorageAccessible = Boolean(win.parent.localStorage); } catch (_) { /* Cross-origin. */ }
    return { parentDocumentAccessible, parentStorageAccessible };
  });
  expect(isolation).toEqual({ parentDocumentAccessible: false, parentStorageAccessible: false });
});


test('official community sidecar regex auto-binds and renders without manual import', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorInline && App.characters?.some(c => c.id === 'dual-host-system-mode')));
  await page.evaluate(async () => {
    localStorage.removeItem('bao-lab:author-regex:v1:' + encodeURIComponent('dual-host-system-mode'));
    const character = await App.loadCharacter('dual-host-system-mode');
    if (!character) throw new Error('dual-host-system-mode did not load');
    App.activeCharacter = character;
    App.config = {
      narrativeMode: 'world', displayMode: 'text',
      persona: { name: '未命名玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
  });

  const host = page.locator('#chat-stream .bao-author-inline');
  await expect(host).toHaveCount(1);
  const frame = page.frameLocator('iframe[title="聊天內作者隔離介面"]');
  await expect(frame.locator('body')).toContainText('SYSTEM INITIALIZED');
  await expect(frame.locator('body')).toContainText('SYSTEM KERNEL · DUAL HOST PROTOCOL');

  const stored = await page.evaluate(() => JSON.parse(
    localStorage.getItem('bao-lab:author-regex:v1:' + encodeURIComponent('dual-host-system-mode'))
  ));
  expect(stored.enabled).toBe(true);
  expect(stored.allowScripts).toBe(false);
  expect(stored.source).toBe('official-sidecar');
  expect(stored.rules.length).toBe(6);
  await expect(page.locator('#chat-stream .message.assistant').first().locator(':scope > .bubble')).toBeHidden();
});
