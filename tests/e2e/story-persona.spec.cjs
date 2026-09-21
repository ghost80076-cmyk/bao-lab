const { test, expect } = require('@playwright/test');

test('author prompt editor is absent and player-owned AI actors survive story save and restore', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryActors && App.characters?.length));
  const original = await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {
      persona: { name:'玩家甲', gender:'女性', identity:'旅人', personality:'', relationship:'', extra:'' },
      narrativeMode:'immersive', displayMode:'text',
      api: {model:'mock', baseUrl:'https://example.invalid', key:'not-a-real-key'},
      memory: {maxRounds:20, maxContext:32000, mode:'rounds', cache:true}
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
    return {name:App.characters[0].name, id:App.characters[0].id};
  });
  await page.locator('#bao-actor-entry').click();
  await expect(page.getByRole('dialog', {name:'本故事的人物設定'})).toBeVisible();
  await expect(page.locator('#bao-actor-target option')).toHaveCount(2);
  await expect(page.locator('#bao-actor-target option[value="card"]')).toHaveCount(0);
  await expect(page.locator('#bao-actor-form [name="system_prompt"]')).toHaveCount(0);
  await expect(page.locator('#bao-actor-form [name="world"]')).toHaveCount(0);
  await page.locator('#bao-actor-form [name="name"]').fill('玩家乙');
  await page.locator('#bao-actor-form [name="appearance"]').fill('銀髮、黑色外套');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-persona')).toHaveText('玩家乙');
  const playerMessages = await page.evaluate(async () => App.buildMessages(App.config));
  expect(playerMessages[0].content).not.toContain('本輪人物覆寫');
  expect(playerMessages.at(-1).content).toContain('玩家乙');
  expect(playerMessages.at(-1).content).toContain('銀髮、黑色外套');

  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('host');
  await page.locator('#bao-actor-form [name="name"]').fill('自創男主');
  await page.locator('#bao-actor-form [name="role"]').selectOption('primary');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-title')).toHaveText('自創男主');
  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('host');
  await page.locator('#bao-actor-form [name="name"]').fill('旅館老闆');
  await page.locator('#bao-actor-form [name="role"]').selectOption('additional');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-title')).toHaveText('自創男主');
  expect(await page.evaluate(id => App.characters.find(item => item.id === id).name, original.id)).toBe(original.name);
  await page.evaluate(async () => {App.saveStory(false); await Storage.flush();});
  const saved = await page.evaluate(() => Storage.loadStory());
  expect(saved.state.storyActors.hostedCharacters.map(actor => actor.name)).toEqual(['自創男主', '旅館老闆']);
  expect(saved.config.persona.name).toBe('玩家乙');
  expect(saved.character.name).toBe(original.name);
  const restore = await page.evaluate(save => {
    App.activeCharacter = App.characters[0];
    const ok = Storage.restoreStory(save);
    App.renderChatShell(false);
    return {ok, card:App.activeCharacter.name, player:App.config.persona.name, hosts:GameState.current.storyActors.hostedCharacters.length};
  }, saved);
  expect(restore).toEqual({ok:true, card:original.name, player:'玩家乙', hosts:2});
});

test('step three allows creating and editing AI characters and additional NPCs', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryActors && App.characters?.length));
  await page.evaluate(() => {App.openCharacter(App.characters[0].id); App.openBuilder(); App.setStep(3);});
  await expect(page.locator('#bao-builder-actors')).toBeVisible();
  await page.locator('#bao-builder-actor-form [name="name"]').fill('玩家託管的 AI');
  await page.locator('#bao-builder-actor-form [name="role"]').selectOption('primary');
  await page.locator('#bao-builder-actor-form button[type="submit"]').click();
  await expect(page.locator('#bao-builder-actor-list')).toContainText('玩家託管的 AI');
  await page.locator('#bao-builder-actor-form [name="name"]').fill('新增的 NPC');
  await page.locator('#bao-builder-actor-form [name="role"]').selectOption('additional');
  await page.locator('#bao-builder-actor-form button[type="submit"]').click();
  await expect(page.locator('#bao-builder-actor-list [data-edit]')).toHaveCount(2);
  await expect(page.locator('#bao-builder-actor-list')).toContainText('新增的 NPC');
  await expect(page.locator('#bao-builder-actors [name="system_prompt"]')).toHaveCount(0);
});