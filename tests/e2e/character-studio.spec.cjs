const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');

const name = '雨港的製卡師';
const roleId = 'e2e-studio-rainport';

test('character studio creates a private draft, previews safely, exports and installs a playable card', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: '探索角色' }).click();
  await expect(page.getByRole('link', { name: '＋ 角色卡創作室' })).toBeVisible();
  await page.getByRole('link', { name: '＋ 角色卡創作室' }).click();
  await expect(page.getByRole('heading', { name: '角色卡創作室' })).toBeVisible();
  await page.locator('[name="name"]').fill(name);
  await page.locator('[name="id"]').fill(roleId);
  await page.locator('[name="description"]').fill('建立在這台裝置的測試角色。');
  await page.locator('[name="system_prompt"]').fill('只扮演雨港的角色，不替玩家行動。');
  await page.locator('[name="greeting"]').fill('<img src=x onerror="window.__cardExecuted = true"> 港口的燈亮了。');
  await page.getByRole('button', { name: '預覽' }).click();
  await expect(page.locator('#studio-preview-greeting')).toContainText('<img src=x onerror=');
  expect(await page.evaluate(() => window.__cardExecuted)).toBeUndefined();
  await page.getByRole('button', { name: '儲存草稿' }).click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  expect(await page.evaluate(() => CharacterEngine.loadCustom().length)).toBe(0);
  const drafts = await page.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open('bao-lab-character-studio', 1);
    request.onsuccess = () => {
      const tx = request.result.transaction('drafts', 'readonly');
      const query = tx.objectStore('drafts').getAll();
      query.onsuccess = () => resolve(query.result);
      query.onerror = () => reject(query.error);
    };
    request.onerror = () => reject(request.error);
  }));
  expect(drafts).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await expect(page.locator('[name="greeting"]')).toHaveValue(/港口的燈亮了/);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 BAO/LAB JSON' }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  expect(exported.meta.id).toBe(roleId);
  expect(exported.content.greeting).toContain('港口的燈亮了');
  expect(exported).not.toHaveProperty('api_key');
  await page.getByRole('button', { name: '加入我的角色' }).click();
  await expect(page.locator('#studio-status')).toContainText('已加入這台裝置的角色庫');
  const installed = await page.evaluate(() => CharacterEngine.loadCustom().find(c => c.id === 'e2e-studio-rainport'));
  expect(installed.system_prompt).toContain('雨港');
  await page.goto('./');
  await page.getByRole('button', { name: '探索角色' }).click();
  await expect(page.locator('article').filter({ hasText: name })).toBeVisible();
  await page.locator('article').filter({ hasText: name }).click();
  await expect(page.getByRole('button', { name: '開始故事' })).toBeVisible();
});

test('studio imports SillyTavern V2 as editable draft without auto publishing', async ({ page }) => {
  await page.goto('./character-studio.html');
  const v2 = { spec: 'chara_card_v2', data: { name: '酒館可編輯角色', description: '小鎮角色', personality: '溫和', scenario: '雨夜', first_mes: '歡迎來到小鎮。' } };
  await page.locator('#studio-file').setInputFiles({ name: 'card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(v2)) });
  await expect(page.locator('#studio-status')).toContainText('酒館 V2 已轉換');
  await expect(page.locator('[name="name"]')).toHaveValue('酒館可編輯角色');
  expect(await page.evaluate(() => CharacterEngine.loadCustom().length)).toBe(0);
  await page.getByRole('button', { name: '儲存草稿' }).click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
});
