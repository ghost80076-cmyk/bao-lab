const { test, expect } = require('@playwright/test');

const reply = '[SCENE:realistic]\n[NARRATION]\n她輕聲問：「可以嗎？」\n[/NARRATION]\n對方點頭。\n[STATUS]\n時間：晚上\n[/STATUS]';

test('built-in general scene hides protocol regardless of status choice and story redraw', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.length && Storage.status().ready, null, { timeout: 15000 });
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let step = 0; step < 3; step++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#start-story').click();
  await page.waitForFunction(() => Boolean(window.BAOSceneChat?.paint && window.BAOSceneHTML?.render && window.BAOStoryReader?.decorateStream), null, { timeout: 15000 });

  await page.evaluate(source => {
    BAOSceneHTML.prefs.mode = 'efficient';
    BAOSceneHTML.prefs.status = 'author';
    BAOSceneChat.prefs.enabled = true;
    BAOSceneChat.prefs.type = 'general';
    Chat.add('user', '請繼續');
    Chat.add('assistant', source);
    App.renderChatShell(false);
    BAOSceneChat.paint();
  }, reply);

  const bubble = page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
  async function assertCleanScene() {
    await expect(bubble.locator('.bao-scene-heading')).toHaveText('通用');
    await expect(bubble).toContainText('她輕聲問：「可以嗎？」');
    await expect(bubble).toContainText('對方點頭。');
    await expect(bubble).not.toContainText('[SCENE:realistic]');
    await expect(bubble).not.toContainText('[NARRATION]');
    await expect(bubble).not.toContainText('[STATUS]');
    await expect(bubble).not.toContainText('時間：晚上');
  }

  await assertCleanScene();
  await page.evaluate(() => {
    BAOSceneHTML.prefs.status = 'native';
    App.renderChatShell(false);
    BAOStoryReader.decorateStream();
    BAOSceneChat.paint();
  });
  await assertCleanScene();
  await page.evaluate(() => {
    BAOSceneChat.prefs.enabled = false;
    BAOSceneChat.paint();
  });
  await expect(bubble).not.toContainText('[SCENE:realistic]');
  await expect(bubble).not.toContainText('[NARRATION]');
  expect(await page.evaluate(() => Chat.messages.at(-1).content)).toBe(reply);
});
