const { test, expect } = require('@playwright/test');

async function demo(page) {
  await page.goto('/');
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator('article').filter({ hasText: '林沉風 - 見過黑暗的人' });
  await card.click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let n = 0; n < 3; n++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOModPacks && window.BAOWorldModuleManager))).toBe(true);
  // Play is deliberately reader-first and hides the desktop sidebar. MOD editing
  // belongs to the explicit Studio surface, where the existing sidebar controls remain usable.
  await expect(page.locator('#bao-surface-mode-toggle')).toBeVisible();
  await page.locator('#bao-surface-mode-toggle').click();
  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-surface', 'studio');
}

async function openWorldManager(page) {
  const group = page.locator('[data-chat-tool-group="world"]');
  await expect(group).toBeAttached();
  if (!await group.evaluate(node => node.open)) await group.locator('summary').click();
  await group.locator('[data-open-world-manager]').click();
  await expect(page.locator('.world-manager-backdrop')).toBeVisible();
}

test('custom field saves and a data-only MOD can be exported and imported into another story', async ({ page }) => {
  await demo(page);
  await openWorldManager(page);
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

  await openWorldManager(page);
  page.on('dialog', dialog => dialog.accept(dialog.message().includes('MOD 名稱') ? '測試 MOD' : dialog.message().includes('作者名稱') ? '測試作者' : ''));
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-mod-export]').click()]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const pack = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  expect(pack.schema).toBe('bao-lab-world-mod-pack');
  expect(pack.modules[0].fields).toMatchObject([{ key: 'affinity', type: 'meter', min: 0, max: 100 }]);
  expect(pack.modules[0].initial.affinity).toBe(15);

  await page.locator('[data-world-close]').click();
  await page.evaluate(() => {
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
  });
  expect(await page.evaluate(() => GameState.current.worldModuleCustomization.customModules.length)).toBe(0);
  await openWorldManager(page);
  await page.locator('[data-mod-file]').setInputFiles({ name: 'test.bao-mod.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await expect.poll(() => page.evaluate(() => GameState.current.worldModuleCustomization.customModules.some(m => m.label === '戀愛關係'))).toBe(true);
  expect(await page.evaluate(() => GameState.current.modules.custom_module.affinity)).toBe(15);
});

test('retained MOD data blocks ID reuse, invalid imports are atomic, and a valid MOD survives reload', async ({ page }) => {
  await demo(page);
  const makePack = (id, initial = 15) => ({
    schema: 'bao-lab-world-mod-pack', version: 1,
    meta: { name: '資料保護測試', author: 'Test', release: '1.0.0' },
    modules: [{ id, label: '關係', kind: 'object', tracking: 'manual', context: 'ui_only',
      triggers: [], fields: [{ key: 'affinity', label: '好感', type: 'meter', min: 0, max: 100 }],
      initial: { affinity: initial } }]
  });
  await page.evaluate(() => {
    GameState.current.modules.archived_mod = { affinity: 77 };
    GameState.current.modPackDefaults = { archived_mod: { affinity: 33 } };
    App.saveStory(false);
  });
  const snapshot = () => page.evaluate(() => JSON.stringify({
    customization: GameState.current.worldModuleCustomization,
    modules: GameState.current.modules,
    defaults: GameState.current.modPackDefaults,
    installations: GameState.current.modPackInstallations
  }));
  const before = await snapshot();
  await openWorldManager(page);
  const dialogs = [];
  page.on('dialog', async dialog => { dialogs.push(dialog.message()); await dialog.accept(); });
  const picker = page.locator('[data-mod-file]');
  const upload = pack => picker.setInputFiles({
    name: 'test.bao-mod.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack))
  });

  await upload(makePack('archived_mod'));
  await expect.poll(() => dialogs.length).toBe(2);
  expect(dialogs[1]).toContain('仍保有舊故事資料');
  expect(await snapshot()).toBe(before);
  await expect(page.locator('.world-manager-backdrop')).toBeVisible();

  await upload(makePack('fresh_mod', 101));
  await expect.poll(() => dialogs.length).toBe(3);
  expect(dialogs[2]).toContain('超出設定範圍');
  expect(await snapshot()).toBe(before);

  await upload(makePack('fresh_mod'));
  await expect.poll(() => page.evaluate(() => GameState.current.modules.fresh_mod?.affinity)).toBe(15);
  expect(await page.evaluate(() => GameState.current.modules.archived_mod.affinity)).toBe(77);
  await page.evaluate(() => Storage.flush());
  await page.reload();
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  const restored = await page.evaluate(async () => {
    await Storage.ready();
    const save = Storage.loadStory();
    if (!save || !Storage.restoreStory(save)) throw new Error('MOD story save did not restore');
    return {
      savedApiKey: save.config.api.key,
      oldValue: GameState.current.modules.archived_mod?.affinity,
      value: GameState.current.modules.fresh_mod?.affinity,
      defaultValue: GameState.current.modPackDefaults.fresh_mod?.affinity,
      field: GameState.current.worldModuleCustomization.customModules.find(m => m.id === 'fresh_mod')?.fields[0]?.key
    };
  });
  expect(restored).toEqual({ savedApiKey: '', oldValue: 77, value: 15, defaultValue: 15, field: 'affinity' });
});
