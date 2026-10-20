const { test, expect } = require('@playwright/test');

async function openStory(page, mode) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorInline && window.BAOGameplayUI && typeof App?.loadCharacter === 'function'));
  await page.evaluate(async displayMode => {
    localStorage.removeItem('bao-lab:author-regex:v1:dont-tell-him');
    const character = await App.loadCharacter('dont-tell-him');
    if (!character) throw new Error('card not found in catalog');
    App.activeCharacter = character;
    App.config = {
      narrativeMode: 'world', displayMode,
      persona: { name: '測試玩家', gender: 'female', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(character, App.config);
    Chat.add('assistant', character.greeting);
    App.renderChatShell(true);
    App.showView('chat');
  }, mode);
}

test('native panels keep the identity secret while exposing received messages', async ({ page }) => {
  await openStory(page, 'ui');
  for (const id of ['now', 'people', 'messages', 'clues']) {
    await page.evaluate(id => BAOGameplayUI.renderPanel(id), id);
    const panel = page.locator('#ui-panel');
    await expect(panel).not.toContainText('北風本人');
    await expect(panel).not.toContainText('確認晚星身分');
    await expect(panel).not.toContainText('private_continuity');
  }
  await page.evaluate(() => BAOGameplayUI.renderPanel('messages'));
  await expect(page.locator('#ui-panel')).toContainText('還沒下班？今天那份提案，談得順利嗎？');
  await expect(page.locator('#user-input')).toBeVisible();
});

test('mobile message card preserves text fallback and fits its frame', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openStory(page, 'text');
  const host = page.locator('#chat-stream .bao-author-inline');
  await expect(host).toHaveCount(1);
  const frame = page.frameLocator('iframe[title="聊天內作者隔離介面"]');
  await expect(frame.locator('.yb-dont-tell-message')).toHaveCount(1);
  await expect(frame.locator('.yb-dont-tell-message')).toContainText('北風 · 21:18');
  await expect(frame.locator('body')).toContainText('也可以直接描述妳的行動');
  const overflow = await frame.locator('.yb-dont-tell-message').evaluate(el => el.scrollWidth > el.clientWidth + 1);
  expect(overflow).toBe(false);
  await host.getByRole('button', { name: '查看原文' }).click();
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toContainText('私訊｜21:18');
  await expect(page.locator('#user-input')).toBeVisible();
});
