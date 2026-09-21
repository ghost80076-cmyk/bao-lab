const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const rules = { regex_scripts: [
  { scriptName: '開屏樣式', findRegex: '【開屏】', replaceString: '<style>.author-panel{color:rgb(255,0,0)}</style>' },
  { scriptName: '開屏互動', findRegex: '【開屏1】', replaceString: '<div class="author-panel"><button onclick="BAOAuthor.draft(\'查看照片\')">開啟照片</button></div>' }
] };

test('per-card authored HTML, CSS and JS stay in an iframe and only draft player text', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorRegexCore && document.querySelector('#bao-author-regex-panel') && App.characters?.length));
  await page.getByRole('button', { name: '探索作品' }).click();
  await page.locator('article').first().click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.evaluate(() => {
    Chat.add('user', '請開啟畫面');
    Chat.add('assistant', '【開屏】【開屏1】');
    App.renderChatShell(false);
  });
  const before = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }));
  const panel = page.locator('#bao-author-regex-panel');
  await panel.locator('summary').click();
  await panel.locator('input[type=file]').setInputFiles({ name: 'author-regex.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rules)) });
  await expect(panel).toContainText('已保存 2 條原始正則');
  await panel.getByLabel('在這張角色卡啟用作者介面').check();
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許作者腳本（需自行信任來源）').check();
  await panel.locator('select').selectOption('latest');
  await panel.getByRole('button', { name: '開啟隔離介面預覽' }).click();
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
