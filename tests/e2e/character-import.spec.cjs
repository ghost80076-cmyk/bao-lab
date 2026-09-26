const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const card = {
  schema_version: '1.5',
  meta: { id: 'e2e-rainport', name: '雨港觀測員', category: 'female', description: '角色卡匯入測試' },
  content: {
    greeting: '雨港的燈剛亮起，觀測員向玩家打招呼。',
    system_prompt: '你是雨港觀測員，只能依已知資訊行動，不得替玩家說話。',
    lore: '港口鐘樓有一段未解的故事。'
  },
  gameplay: { supported_modes: { immersive: true, world: false }, initial_state: { time: '傍晚', location: '雨港', events: [], npcs: [] } },
  presentation: { supported_display: { text: true, ui: false } }
};
const upload = (page, body) => page.locator('#import-character-file').setInputFiles({
  name: 'rainport.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(body))
});

test('BAO character import persists through reload and opens a playable demo story', async ({ page }) => {
  await page.goto('./');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.waitForFunction(() => Boolean(window.BAOCharacterImport && App.characters?.length));
  await expect(page.getByRole('link', { name: '下載基礎角色模板' })).toBeVisible();
  await expect(page.getByRole('link', { name: '下載進階世界模板' })).toBeVisible();
  await upload(page, card);
  await expect(page.locator('#character-import-status')).toContainText('已匯入：雨港觀測員');
  await expect(page.locator('article').filter({ hasText: '雨港觀測員' })).toBeVisible();
  const before = await page.evaluate(() => CharacterEngine.loadCustom().find(item => item.id === 'e2e-rainport'));
  expect(before.system_prompt).toBe(card.content.system_prompt);
  expect(before.greeting).toBe(card.content.greeting);
  expect(before.initial_state.location).toBe('雨港');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.BAOCharacterImport && App.characters?.some(item => item.id === 'e2e-rainport')));
  await page.locator('#home-view [data-view="explore"]').click();
  await page.locator('article').filter({ hasText: '雨港觀測員' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一步' }).click();
  await page.locator('#bao-demo-mode').check();
  await page.getByRole('button', { name: '下一步' }).click();
  await page.getByRole('button', { name: '開始故事' }).click();
  await expect(page.locator('#user-input')).toBeVisible();
  await page.evaluate(async () => {
    Chat.add('user', '請說說鐘樓的故事。');
    Chat.add('assistant', '觀測員指向雨港的鐘樓。');
    App.saveStory(false);
    if (window.BAOStoryLibrary) await BAOStoryLibrary.flush();
  });
  const saved = await page.evaluate(async () => { await Storage.ready(); return Storage.loadStory(); });
  expect(saved.characterId).toBe('e2e-rainport');
  expect(JSON.stringify(saved)).toContain('觀測員指向雨港的鐘樓');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.BAOCharacterImport && App.characters?.some(item => item.id === 'e2e-rainport')));
  const restored = await page.evaluate(async () => {
    await Storage.ready();
    const save = Storage.loadStory();
    const ok = Storage.restoreStory(save);
    if (ok) { App.renderChatShell(false); App.showView('chat'); }
    return { ok, name: App.activeCharacter?.name, count: Chat.messages.length, location: GameState.current?.location };
  });
  expect(restored.ok).toBe(true);
  expect(restored.name).toBe('雨港觀測員');
  expect(restored.count).toBeGreaterThanOrEqual(2);
  expect(restored.location).toBe('雨港');
  await expect(page.locator('#user-input')).toBeVisible();
});

test('bad or conflicting character JSON never changes the local library', async ({ page }) => {
  await page.goto('./');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.waitForFunction(() => Boolean(window.BAOCharacterImport && App.characters?.length));
  const noGreeting = structuredClone(card);
  delete noGreeting.content.greeting;
  await upload(page, noGreeting);
  await expect(page.locator('#character-import-status')).toContainText('缺少必要欄位');
  expect(await page.evaluate(() => CharacterEngine.loadCustom().length)).toBe(0);

  const duplicateBuiltin = structuredClone(card);
  duplicateBuiltin.meta.id = 'linchenfeng';
  await upload(page, duplicateBuiltin);
  await expect(page.locator('#character-import-status')).toContainText('內建作品重複');
  expect(await page.evaluate(() => CharacterEngine.loadCustom().length)).toBe(0);
});

test('SillyTavern V2 JSON opens a conversion preview and saves only after confirmation', async ({ page }) => {
  const v2 = {
    spec: 'chara_card_v2',
    data: {
      name: '酒館轉換測試', description: '可從酒館帶來的角色。', personality: '冷靜。', scenario: '雨夜鐘樓。',
      first_mes: '觀測員把潮汐表推到你面前。', mes_example: '<START>\n觀測員：潮水轉向了。',
      character_book: { entries: [{ keys: ['鐘樓'], content: '鐘樓在午夜鳴響。', enabled: true }] },
      extensions: { regex_scripts: [{ scriptName: 'legacy' }], api_key: 'do-not-keep' }
    }
  };
  await page.goto('./');
  await page.locator('#home-view [data-view="explore"]').click();
  await page.waitForFunction(() => Boolean(window.BAOCharacterImport && CharacterEngine.requestImport));
  await upload(page, v2);
  await expect(page.getByRole('dialog', { name: '角色卡轉換預覽' })).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('世界書 1 條');
  await expect(page.getByRole('dialog')).toContainText('Regex');
  expect(await page.evaluate(() => CharacterEngine.loadCustom().length)).toBe(0);
  await page.getByRole('button', { name: '確認匯入到本機' }).click();
  await expect(page.locator('#character-import-status')).toContainText('已匯入：酒館轉換測試');
  const stored = await page.evaluate(() => CharacterEngine.loadCustom()[0]);
  expect(stored.schema_version).toBe('1.5');
  expect(stored.import_metadata.source_format).toBe('sillytavern-v2');
  expect(stored.import_metadata.preserved_source.data.extensions.api_key).toBe('[REDACTED]');
});
