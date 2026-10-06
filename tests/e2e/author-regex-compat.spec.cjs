const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const rules = { regex_scripts: [
  { scriptName: '開屏樣式', findRegex: '【開屏】', replaceString: '<style>.author-panel{color:rgb(255,0,0)}</style>' },
  { scriptName: '開屏互動', findRegex: '【開屏1】', replaceString: '<div class="author-panel"><button onclick="BAOAuthor.draft(\'查看照片\')">開啟照片</button></div>' }
] };

test('per-card authored HTML, CSS and JS stay in an iframe and only draft player text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorRegexCore && document.querySelector('#bao-author-regex-panel') && App.characters?.length));
  await page.evaluate(async () => {
    await App.openCharacter(App.characters[0].id);
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('user', '請開啟畫面');
    Chat.add('assistant', '【開屏】【開屏1】');
    App.renderChatShell(false); App.showView('chat');
    window.BAOChatUISimplify?.sync?.();
  });
  const before = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }));
  const panel = page.locator('#bao-author-regex-panel');
  await panel.locator('input[type=file]').setInputFiles({
    name: 'author-regex.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(rules))
  });
  await page.waitForFunction(() => {
    const id = String(App.activeCharacter?.id || '');
    const saved = JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:' + encodeURIComponent(id)) || 'null');
    return saved?.rules?.length === 2;
  });
  await page.evaluate(() => {
    const id = String(App.activeCharacter?.id || '');
    const key = 'bao-lab:author-regex:v1:' + encodeURIComponent(id);
    const saved = JSON.parse(localStorage.getItem(key));
    saved.enabled = true;
    saved.allowScripts = true;
    localStorage.setItem(key, JSON.stringify(saved));
    const authorPanel = document.getElementById('bao-author-regex-panel');
    const select = authorPanel?.querySelector('select');
    if (select) select.value = 'latest';
    const preview = [...(authorPanel?.querySelectorAll('button') || [])]
      .find(button => button.textContent.trim() === '預覽自訂介面');
    preview?.click();
  });
  const frame = page.frameLocator('iframe[title="作者正則隔離介面"]');
  await expect(frame.locator('.author-panel')).toBeVisible();
  await expect(frame.locator('.author-panel')).toHaveCSS('color', 'rgb(255, 0, 0)');
  await frame.getByRole('button', { name: '開啟照片' }).click();
  await expect(page.locator('#user-input')).toHaveValue('查看照片');
  await expect(page.locator('iframe[title="作者正則隔離介面"]')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }))).toBe(before);
  expect(await page.evaluate(() => document.getElementById('api-key').value)).toBe('');
});

test('scripts remain off until separate consent; regex capture cannot inject DOM', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorRegexCore));
  const value = await page.evaluate(() => {
    const Core = window.BAOAuthorRegexCore;
    const rules = Core.normalize([
      { pattern: 'A', replacement: '<div class="safe">安全</div>' },
      { pattern: 'B', replacement: '<script>window.hacked=1</script>' },
      { pattern: 'RAW=(.+)', replacement: '<p>$1</p>' }
    ]);
    const result = Core.render('AB RAW=<img src=x onerror=alert(1)>', rules, false);
    return { result, raw: rules[2].replacement };
  });
  expect(value.result.matched).toBe(true);
  expect(value.result.blocked).toBe(1);
  expect(value.result.script).toBe(false);
  expect(value.result.html).toContain('&lt;img');
  expect(value.result.html).not.toContain('<img src=x');
  expect(value.raw).toBe('<p>$1</p>');
});
