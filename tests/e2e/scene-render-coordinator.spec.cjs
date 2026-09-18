const { test, expect } = require('@playwright/test');

async function openStory(page) {
  await page.goto('/');
  await page.getByRole('button', { name: '探索作品' }).click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect(page.locator('#user-input')).toBeVisible();
  await page.waitForFunction(() => Boolean(window.BAOSceneHTML?.render && window.BAOSceneRenderCoordinator?.reconcile));
}

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: scene tags render after a reader rewrite without changing raw history`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openStory(page);
    const raw = '[SCENE:realistic]\n[NARRATION]\n窗外下著雨\n[/NARRATION]';
    await page.evaluate(rawText => {
      window.BAOSceneHTML.prefs.mode = 'efficient';
      Chat.reset();
      Chat.add('user', '快速開始');
      Chat.add('assistant', rawText);
      App.renderChatShell(false);
    }, raw);
    const reply = page.locator('#chat-stream > .message.assistant .bubble').last();
    await expect(reply.locator('.bao-scene-realistic')).toBeVisible();
    await expect(reply).not.toContainText('[SCENE:realistic]');
    await expect(reply).not.toContainText('[NARRATION]');

    await page.evaluate(() => {
      const bubble = document.querySelector('#chat-stream > .message.assistant:last-child .bubble');
      bubble.innerHTML = App.formatMessage(Chat.messages.at(-1).content);
    });
    await expect(reply.locator('.bao-scene-realistic')).toBeVisible();
    expect(await page.evaluate(() => Chat.messages.at(-1).content)).toBe(raw);

    await page.evaluate(() => {
      Chat.messages.at(-1).content = '[SCENE:realistic]\n[NARRATION]\n省略結束標籤';
      App.renderChatShell(false);
    });
    await expect(reply.locator('.bao-scene-realistic')).toContainText('省略結束標籤');
    expect(await page.evaluate(() => Chat.messages.at(-1).content.endsWith('[/NARRATION]'))).toBe(false);

    await page.evaluate(() => {
      window.BAOSceneHTML.prefs.mode = 'native';
      App.renderChatShell(false);
    });
    await expect(reply.locator('.bao-scene-realistic')).toHaveCount(0);
    await expect(reply).not.toContainText('[NARRATION]');
  });
}
