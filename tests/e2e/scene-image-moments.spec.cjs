const { test, expect } = require('@playwright/test');

async function openDemoStory(page) {
  await page.goto('/');
  await page.locator('#home-view button[data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOStoryImageMoments))).toBe(true);
}

test('scene images only use the selected historical moment; upload stays in IndexedDB', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openDemoStory(page);
  await page.evaluate(() => {
    window.__imageCalls = [];
    Chat.messages.push({ id: 'scene-old', role: 'assistant', content: '舊場景在公園。' });
    Chat.messages.push({ id: 'scene-new', role: 'assistant', content: '新場景在咖啡館。' });
    App.activeCharacter.image_prompt_profile = '固定藍色外套';
    App.config.api = { key: 'test-only', model: 'fake-model', baseUrl: 'https://example.invalid' };
    window.API.send = async (config, messages) => {
      window.__imageCalls.push(messages);
      return { text: '固定藍色外套的人物' };
    };
    BAOStoryImageMoments.openPlayer(Chat.messages.length - 2);
  });
  const dialog = page.getByRole('dialog', { name: '劇情配圖' });
  await expect(dialog).toBeVisible();
  expect(await page.evaluate(() => window.__imageCalls.length)).toBe(0);
  await dialog.getByRole('button', { name: '用我的文字模型分析此場景' }).click();
  await expect(dialog.getByRole('textbox', { name: /可修改的生圖提示詞/ })).toHaveValue('固定藍色外套的人物');
  const first = await page.evaluate(() => window.__imageCalls[0][1].content);
  expect(first).toContain('舊場景在公園');
  expect(first).not.toContain('新場景在咖啡館');
  await dialog.getByRole('button', { name: '關閉' }).click();
  await page.evaluate(() => BAOStoryImageMoments.openPlayer(Chat.messages.length - 1));
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: '用我的文字模型分析此場景' }).click();
  const second = await page.evaluate(() => window.__imageCalls[1][1].content);
  expect(second).toContain('新場景在咖啡館');
  const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAaX2RUAAAAAASUVORK5CYII=', 'base64');
  await dialog.getByLabel('選擇要存入本機圖集的圖片').setInputFiles({ name: 'scene.png', mimeType: 'image/png', buffer: imageBytes });
  await expect(dialog.getByRole('status')).toContainText('圖片已存入這台裝置');
  await expect(dialog.getByAltText('scene.png')).toHaveCount(1);
  await dialog.getByRole('button', { name: '關閉' }).click();
  await page.evaluate(() => BAOStoryImageMoments.openPlayer(Chat.messages.length - 2));
  await expect(dialog.getByAltText('scene.png')).toHaveCount(1);
  expect(await page.evaluate(() => window.__imageCalls.length)).toBe(2);
});
