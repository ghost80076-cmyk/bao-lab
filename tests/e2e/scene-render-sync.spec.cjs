const { test, expect } = require('@playwright/test');

async function start(page, mode) {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.length && Storage.status().ready, null, { timeout: 15000 });
  await page.getByRole('button', { name: '探索作品' }).click();
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
  await page.waitForFunction(() => Boolean(window.BAOSceneHTML?.render && window.BAOSceneChat?.paint && window.BAOStoryReader?.decorateStream), null, { timeout: 15000 });
}

for (const displayMode of ['text', 'ui']) {
  test(`${displayMode}: scene template never displays SCENE or NARRATION control tags`, async ({ page }) => {
    await start(page, displayMode);
    await page.evaluate(() => {
      BAOSceneHTML.prefs.mode = 'efficient';
      BAOSceneChat.prefs.enabled = true;
      Chat.add('user', '請描述照片');
      Chat.add('assistant', '[SCENE:realistic]\n[NARRATION]\n凌晨的照片被放大。\n[/NARRATION]\n[STATUS]\n時間：01:28\n[/STATUS]');
      App.renderChatShell(false);
    });
    const bubble = page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
    await expect(bubble.locator('.bao-scene-body')).toContainText('凌晨的照片被放大。');
    await expect(bubble).not.toContainText('[SCENE:realistic]');
    await expect(bubble).not.toContainText('[NARRATION]');
    await expect(bubble).not.toContainText('[STATUS]');
    // Story-reader's delayed decoration used to overwrite the final scene.
    await page.evaluate(() => BAOStoryReader.decorateStream());
    await expect.poll(() => bubble.locator('.bao-scene-body').count(), { timeout: 3000 }).toBe(1);
    await expect(bubble).not.toContainText('[SCENE:realistic]');
  });

  test(`${displayMode}: disabling scene template restores canonical narration after late redraw`, async ({ page }) => {
    await start(page, displayMode);
    await page.evaluate(() => {
      BAOSceneHTML.prefs.mode = 'native';
      BAOSceneChat.prefs.enabled = true;
      Chat.add('user', '繼續');
      Chat.add('assistant', '[SCENE:realistic]\n[NARRATION]\n完整原始敘事。\n[/NARRATION]');
      App.renderChatShell(false);
    });
    const bubble = page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
    await expect(bubble.locator('.bao-scene-body')).toContainText('完整原始敘事。');
    await page.evaluate(() => {
      BAOSceneChat.prefs.enabled = false;
      BAOSceneChat.paint();
      BAOStoryReader.decorateStream();
    });
    await expect.poll(() => bubble.textContent(), { timeout: 3000 }).toBe('完整原始敘事。');
    await expect(bubble).not.toContainText('[NARRATION]');
  });
}
