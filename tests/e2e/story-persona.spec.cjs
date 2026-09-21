const { test, expect } = require('@playwright/test');

test('player and AI actors can be edited in a story without changing the library or cache prefix', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryActors && App.characters?.length));
  const original = await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {
      persona: { name: '玩家甲', gender: '女性', identity: '旅人', personality: '', relationship: '', extra: '' },
      narrativeMode: 'immersive', displayMode: 'text',
      api: { model: 'mock', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'rounds', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
    return { name: App.characters[0].name, id: App.characters[0].id };
  });
  const before = await page.evaluate(async () => (await App.buildMessages(App.config))[0].content);
  await page.locator('#bao-actor-entry').click();
  await expect(page.getByRole('dialog', { name: '角色與世界 · 本故事' })).toBeVisible();
  await page.locator('#bao-actor-form [name="name"]').fill('玩家乙');
  await page.locator('#bao-actor-form [name="appearance"]').fill('銀髮、黑色外套');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-persona')).toHaveText('玩家乙');
  const playerPrompt = await page.evaluate(async () => App.buildMessages(App.config));
  expect(playerPrompt[0].content).toBe(before);
  expect(playerPrompt[0].content).not.toContain('本輪人物覆寫');
  expect(playerPrompt.at(-1).content).toContain('玩家乙');
  expect(playerPrompt.at(-1).content).toContain('銀髮、黑色外套');

  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('card');
  await page.locator('#bao-actor-form [name="name"]').fill('故事限定角色');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-title')).toHaveText('故事限定角色');
  expect(await page.evaluate(id => App.characters.find(item => item.id === id).name, original.id)).toBe(original.name);

  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('host');
  await page.locator('#bao-actor-form [name="name"]').fill('自創男主');
  await page.locator('#bao-actor-form [name="role"]').selectOption('primary');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-title')).toHaveText('自創男主');
  await page.evaluate(async () => { App.saveStory(false); await Storage.flush(); });
  const saved = await page.evaluate(() => Storage.loadStory());
  expect(saved.state.storyActors.hostedCharacter.name).toBe('自創男主');
  expect(saved.config.persona.name).toBe('玩家乙');
  expect(saved.character.name).toBe('故事限定角色');
  const restore = await page.evaluate(save => {
    App.activeCharacter = App.characters[0];
    const ok = Storage.restoreStory(save);
    App.renderChatShell(false);
    return { ok, card: App.activeCharacter.name, player: App.config.persona.name, host: GameState.current.storyActors.hostedCharacter.name };
  }, saved);
  expect(restore).toEqual({ ok: true, card: '故事限定角色', player: '玩家乙', host: '自創男主' });
});