const { test, expect } = require('@playwright/test');

async function waitForApp(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && App.characters?.length > 0 && typeof Storage.status === 'function' && Storage.status().ready && typeof window.BAOChatAPISettings?.restore === 'function', null, { timeout: 15000 });
}

async function startBYOKStory(page) {
  await waitForApp(page);
  await page.getByRole('button', { name: '探索作品' }).click();
  const card = page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#model-id').fill('mobile-entry-test-model');
  await page.locator('#base-url').fill('https://example.invalid/v1/chat/completions');
  await page.locator('#api-key').fill('UNSAVED_MOBILE_TEST_KEY');
  await page.getByRole('button', { name: '下一步' }).click();
  await expect(page.locator('.builder-step[data-step-panel="5"]')).toBeVisible();
  await expect(page.locator('#start-story')).toBeVisible();
  await page.locator('#start-story').click();
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await expect(page.locator('#user-input')).toBeVisible();
  await page.evaluate(async () => { await Storage.flush(); });
}

for (const width of [390, 375]) {
  test(`mobile ${width}px: step 5 starts a BYOK story and both resume entries work`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await startBYOKStory(page);
      await page.reload();
      await expect(page.locator('#continue-story')).toBeVisible();
      await page.locator('#continue-story').click();
      await expect(page.locator('#chat-view')).toHaveClass(/active/);
      await expect(page.getByRole('dialog', { name: '故事 API 設定' })).toBeVisible();
      await page.reload();
      await expect(page.locator('#home-continue')).toBeVisible();
      await page.locator('#home-continue').click();
      await expect(page.locator('#chat-view')).toHaveClass(/active/);
      await expect(page.getByRole('dialog', { name: '故事 API 設定' })).toBeVisible();
      expect(await page.evaluate(() => Storage.loadStory()?.config?.api?.key || '')).toBe('');
      expect(errors).toEqual([]);
    } finally {
      console.log('Mobile entry page errors:', JSON.stringify(errors));
      console.log('Mobile entry diagnostics:', JSON.stringify(await page.evaluate(() => ({ view: document.querySelector('.view.active')?.id, storage: Storage.status(), appReady: !!App.activeCharacter, apiReady: !!window.BAOChatAPISettings, startVisible: !!document.getElementById('start-story')?.offsetParent })).catch(error => ({ diagnosticError: error.message }))));
    }
  });
}
