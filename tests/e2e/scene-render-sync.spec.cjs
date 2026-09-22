const { test, expect } = require('@playwright/test');

async function start(page, mode) {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.length && Storage.status().ready, null, { timeout: 15000 });
  await page.getByRole('button', { name: '探索角色' }).click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  if (mode === 'ui') {
    await page.locator('.builder-step[data-step-panel="2"] label.choice-card')
      .filter({ has: page.locator('input[name="display-mode"][value="ui"]') }).click();
  }
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  await page.waitForFunction(() => Boolean(window.BAOSceneHTML?.render && window.BAOSceneRenderIntegrity?.reconcile && window.BAOStoryReader?.decorateStream), null, { timeout: 15000 });
}

const taggedReply = '[SCENE:realistic]\n[NARRATION]\n凌晨的照片被放大。\n[/NARRATION]\n[STATUS]\n時間：01:28\n[/STATUS]';

for (const mode of ['text', 'ui']) {
  test(`${mode}: original story tags are hidden in native reading even after story-reader redraw`, async ({ page }) => {
    await start(page, mode);
    await page.evaluate(reply => {
      BAOSceneHTML.prefs.mode = 'native';
      Chat.add('user', '請描述照片');
      Chat.add('assistant', reply);
      App.renderChatShell(false);
    }, taggedReply);
    const bubble = page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
    await expect(bubble).toContainText('凌晨的照片被放大。');
    await expect(bubble).not.toContainText('[SCENE:realistic]');
    await expect(bubble).not.toContainText('[NARRATION]');
    await expect(bubble).not.toContainText('[STATUS]');
    await page.evaluate(() => BAOStoryReader.decorateStream());
    await expect.poll(() => bubble.textContent(), { timeout: 5000 }).not.toContain('[SCENE:realistic]');
    await expect.poll(() => bubble.textContent(), { timeout: 5000 }).not.toContain('[NARRATION]');
    expect(await page.evaluate(() => Chat.messages.at(-1).content)).toBe(taggedReply);
  });

  test(`${mode}: efficient mode restores scene card after late story-reader rewrite`, async ({ page }) => {
    await start(page, mode);
    await page.evaluate(reply => {
      BAOSceneHTML.prefs.mode = 'efficient';
      Chat.add('user', '繼續');
      Chat.add('assistant', reply);
      App.renderChatShell(false);
    }, taggedReply);
    const bubble = page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
    await expect(bubble.locator('.bao-scene-realistic')).toContainText('凌晨的照片被放大。');
    await page.evaluate(() => BAOStoryReader.decorateStream());
    await expect.poll(() => bubble.locator('.bao-scene-realistic').count(), { timeout: 5000 }).toBe(1);
    await expect(bubble).not.toContainText('[SCENE:realistic]');
    await expect(bubble).not.toContainText('[NARRATION]');
    await expect(bubble).not.toContainText('[STATUS]');
  });

  test(`${mode}: legacy scene appendix is presentation-only and not repeated`, async ({ page }) => {
    await start(page, mode);
    await page.evaluate(() => {
      BAOSceneHTML.prefs.mode = 'native';
      Chat.add('user', '場景');
      Chat.add('assistant', '這是一段完整故事。\n\n當前場景資訊\n時間：凌晨\n地點：房間');
      App.renderChatShell(false);
    });
    const bubble = page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
    await expect.poll(() => bubble.textContent(), { timeout: 5000 }).not.toContain('當前場景資訊');
    await expect(bubble).toContainText('這是一段完整故事。');
    await page.evaluate(() => BAOStoryReader.decorateStream());
    await expect.poll(() => bubble.textContent(), { timeout: 5000 }).not.toContain('當前場景資訊');
  });
}
