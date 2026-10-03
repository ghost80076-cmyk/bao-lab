const { test, expect } = require('@playwright/test');

test('official portable actors join any story and adult actors obey the local content gate', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('yorubay:content-preferences:v1');
  });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryActors && window.BAOContentPreferences && App.characters?.length));

  const original = await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {
      persona: { name:'測試玩家', gender:'未指定', identity:'旅人', personality:'', relationship:'', extra:'' },
      narrativeMode:'immersive', displayMode:'text',
      api: {model:'mock', baseUrl:'https://example.invalid', key:'not-a-real-key'},
      memory: {maxRounds:20, maxContext:32000, mode:'rounds', cache:true}
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
    return {name:App.activeCharacter.name};
  });

  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('host');
  const picker = page.locator('[data-portable-actor-select]');
  await expect(picker.locator('option[value="jingyue"]')).toHaveCount(1);
  await expect(picker.locator('option[value="guchen"]')).toHaveCount(1);
  await expect(picker.locator('option[value="jiuyue"]')).toHaveCount(0);
  await expect(picker.locator('option[value="shuanger"]')).toHaveCount(0);

  await picker.selectOption('jingyue');
  await page.locator('[data-portable-actor-apply]').click();
  const form = page.locator('#bao-actor-form form');
  await expect(form.locator('[name="name"]')).toHaveValue('鏡月');
  await expect(form.locator('[name="relationship"]')).toBeVisible();
  await form.locator('[name="identity"]').fill('魔法學院的轉學生');
  await form.locator('[name="relationship"]').fill('玩家好友的未婚妻');
  await form.locator('[name="personality"]').fill('本場演成天真、對玩家沒有戒心');
  await page.locator('[data-apply]').click();

  let snapshot = await page.evaluate(async () => {
    const messages = await App.buildMessages(App.config);
    return {
      actors: GameState.current.storyActors.hostedCharacters.map(actor => ({name:actor.name, packId:actor.portable?.packId, relationship:actor.relationship})),
      prompt: messages.at(-1)?.content || ''
    };
  });
  expect(snapshot.actors).toEqual([{name:'鏡月', packId:'jingyue', relationship:'玩家好友的未婚妻'}]);
  expect(snapshot.prompt).toContain('官方可攜角色');
  expect(snapshot.prompt).toContain('魔法學院的轉學生');
  expect(snapshot.prompt).toContain('原作品');

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(true, {confirmAge:false}));
  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('host');
  const adultPicker = page.locator('[data-portable-actor-select]');
  await expect(adultPicker.locator('option[value="jiuyue"]')).toHaveCount(1);
  await expect(adultPicker.locator('option[value="shuanger"]')).toHaveCount(1);

  await adultPicker.selectOption('jiuyue');
  await page.locator('[data-portable-actor-apply]').click();
  await expect(page.locator('#bao-actor-form form [name="name"]')).toHaveValue('玖月');
  await page.locator('#bao-actor-form form [name="identity"]').fill('王都劇團的首席演員');
  await page.locator('#bao-actor-form form [name="relationship"]').fill('目前與玩家公開敵對');
  await page.locator('#bao-actor-form form [name="role"]').selectOption('primary');
  await page.locator('[data-apply]').click();
  await expect(page.locator('#chat-title')).toHaveText('玖月');

  snapshot = await page.evaluate(async () => {
    const messages = await App.buildMessages(App.config);
    return {count:GameState.current.storyActors.hostedCharacters.length, prompt:messages.at(-1)?.content || ''};
  });
  expect(snapshot.count).toBe(2);
  expect(snapshot.prompt).toContain('玖月');
  expect(snapshot.prompt).toContain('王都劇團的首席演員');

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(false));
  await expect(page.locator('#chat-title')).toHaveText(original.name);
  snapshot = await page.evaluate(async () => {
    const messages = await App.buildMessages(App.config);
    return {
      count:GameState.current.storyActors.hostedCharacters.length,
      prompt:messages.at(-1)?.content || ''
    };
  });
  expect(snapshot.count).toBe(2);
  expect(snapshot.prompt).toContain('鏡月');
  expect(snapshot.prompt).not.toContain('玖月');

  await page.locator('#bao-actor-entry').click();
  await page.locator('#bao-actor-target').selectOption('host');
  await expect(page.locator('[data-portable-actor-select] option[value="jiuyue"]')).toHaveCount(0);
  await expect(page.locator('#bao-actor-existing')).not.toContainText('玖月');
  await page.getByRole('button', {name:'取消', exact:true}).click();

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(true, {confirmAge:false}));
  snapshot = await page.evaluate(async () => {
    const messages = await App.buildMessages(App.config);
    return {prompt:messages.at(-1)?.content || ''};
  });
  expect(snapshot.prompt).toContain('玖月');
  await expect(page.locator('#chat-title')).toHaveText('玖月');
});
