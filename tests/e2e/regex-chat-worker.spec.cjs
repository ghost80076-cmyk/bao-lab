const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

async function startStory(page, content) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAORegexChat && window.BAORegex && App.characters?.length));
  await page.evaluate(async text => {
    await App.openCharacter(App.characters[0].id);
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    Chat.add('assistant', text);
    App.renderChatShell(false);
    App.showView('chat');
  }, content);
  return page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble');
}

test('legacy and author regex run off the UI thread and preserve saved story', async ({ page }) => {
  const bubble = await startStory(page, 'NPC: 你好');
  const original = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }));
  await page.evaluate(() => {
    const id = String(App.activeCharacter.id);
    localStorage.setItem('bao-lab:author-regex:v1:' + encodeURIComponent(id), JSON.stringify({
      enabled: true,
      rules: [{ name: '稱呼', pattern: 'NPC', replacement: '同伴', flags: 'g', enabled: true }]
    }));
    BAORegex.save({ active: true, rules: [{ pattern: '同伴', replacement: '角色', flags: 'g' }] });
    BAORegexChat.schedule();
  });
  await expect(bubble).toHaveText('角色: 你好');
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }))).toBe(original);
  await page.evaluate(() => {
    const id = String(App.activeCharacter.id);
    const key = 'bao-lab:author-regex:v1:' + encodeURIComponent(id);
    const settings = JSON.parse(localStorage.getItem(key));
    settings.enabled = false;
    localStorage.setItem(key, JSON.stringify(settings));
    BAORegex.save({ active: false, rules: [] });
    BAORegexChat.schedule();
  });
  await expect(bubble).toHaveText('NPC: 你好');
});

test('catastrophic author regex is terminated and leaves chat interactive', async ({ page }) => {
  const originalText = 'a'.repeat(8000) + '!';
  const bubble = await startStory(page, originalText);
  const original = await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }));
  const failure = page.waitForEvent('console', {
    predicate: item => item.text().includes('BAO/LAB regex timed out or failed'),
    timeout: 12000
  });
  await page.evaluate(() => {
    const id = String(App.activeCharacter.id);
    localStorage.setItem('bao-lab:author-regex:v1:' + encodeURIComponent(id), JSON.stringify({
      enabled: true, rules: [{ name: '慢速匹配', pattern: '(a+)+$', replacement: 'X', flags: 'g' }]
    }));
    BAORegexChat.schedule();
  });
  await page.locator('#user-input').fill('仍可輸入');
  await expect(page.locator('#user-input')).toHaveValue('仍可輸入');
  await failure;
  await expect(bubble).toHaveText(originalText);
  expect(await page.evaluate(() => JSON.stringify({ messages: Chat.messages, usage: Chat.usage }))).toBe(original);
});

test('mobile dialogue can apply plain regex without changing the raw assistant message', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const bubble = await startStory(page, 'ROLE: mobile');
  await page.evaluate(() => {
    BAORegex.save({ active: true, rules: [{ pattern: 'ROLE:', replacement: '角色：' }] });
    BAORegexChat.schedule();
  });
  await expect(bubble).toHaveText('角色： mobile');
  expect(await page.evaluate(() => Chat.messages.at(-1).content)).toBe('ROLE: mobile');
});
