const { test, expect } = require('@playwright/test');

async function demo(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '班長。' })).toBeVisible();
  await page.getByRole('button', { name: '探索作品' }).click();
  const card = page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' });
  await card.click();
  await page.getByRole('button', { name: '開始故事' }).click();
  for (let n = 0; n < 3; n++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOModPacks && window.BAOWorldModuleManager))).toBe(true);
}

test('custom field saves and a data-only MOD can be exported and imported into another story', async ({ page }) => {
  await demo(page);
  await page.getByRole('button', { name: /世界模組管理/ }).click();
  await page.locator('[data-world-add]').click();
  const card = page.locator('.world-custom-card').last();
  await card.locator('[data-custom-prop="label"]').fill('戀愛關係');
  await card.locator('[data-mod-add]').click();
  await card.locator('[data-mod-prop="key"]').fill('affinity');
  await card.locator('[data-mod-prop="label"]').fill('好感度');
  await card.locator('[data-mod-prop="type"]').selectOption('meter');
  await card.locator('[data-mod-prop="min"]').fill('0');
  await card.locator('[data-mod-prop="max"]').fill('100');
  await card.locator('[data-mod-prop="defaultRaw"]').fill('15');
  await page.locator('[data-world-save]').click();
  await expect.poll(() => page.evaluate(() => GameState.current.worldModuleCustomization.customModules.find(m => m.label === '戀愛關係')?.fields?.[0]?.key)).toBe('affinity');
  expect(await page.evaluate(() => GameState.current.modules.custom_module.affinity)).toBe(15);
  await page.getByRole('button', { name: /世界模組管理/ }).click();
  page.once('dialog', d => d.accept('測試 MOD'));
  page.once('dialog', d => d.accept('測試作者'));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-mod-export]').click()]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const pack = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(pack.schema).toBe('bao-lab-world-mod-pack');
  expect(pack.modules[0].initial.affinity).toBe(15);
  await page.locator('[data-world-close]').click();
  await page.evaluate(() => {
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
  });
  expect(await page.evaluate(() => GameState.current.worldModuleCustomization.customModules.length)).toBe(0);
  await page.getByRole('button', { name: /世界模組管理/ }).click();
  page.once('dialog', d => d.accept());
  await page.locator('[data-mod-file]').setInputFiles({ name: 'test.bao-mod.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect.poll(() => page.evaluate(() => GameState.current.worldModuleCustomization.customModules.some(m => m.label === '戀愛關係'))).toBe(true);
  expect(await page.evaluate(() => GameState.current.modules.custom_module.affinity)).toBe(15);
});
