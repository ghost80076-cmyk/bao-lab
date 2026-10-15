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

  await page.evaluate(() => BAOStoryActors.open('host'));
  await expect(page.getByRole('dialog', {name:'本故事的人物設定'})).toBeVisible();
  const picker = page.locator('[data-portable-actor-select]');
  await expect(picker.locator('option[value="jingyue"]')).toHaveCount(1);
  await expect(picker.locator('option[value="guchen"]')).toHaveCount(1);
  await expect(picker.locator('option[value="jiuyue"]')).toHaveCount(0);
  await expect(picker.locator('option[value="shuanger"]')).toHaveCount(0);

  const formBeforeRecommendation = await page.locator('#bao-actor-form form [name="name"]').inputValue();
  const stateBeforeRecommendation = await page.evaluate(() => JSON.stringify(GameState.current.storyActors));
  await page.locator('[data-portable-actor-query]').fill('鏡月');
  await page.locator('[data-portable-actor-recommend]').click();
  const suggestion = page.locator('[data-portable-actor-result] button').first();
  await expect(suggestion).toContainText('鏡月');
  await suggestion.click();
  await expect(picker).toHaveValue('jingyue');
  await expect(page.locator('#bao-actor-form form [name="name"]')).toHaveValue(formBeforeRecommendation);
  expect(await page.evaluate(() => JSON.stringify(GameState.current.storyActors))).toBe(stateBeforeRecommendation);
  await page.locator('[data-portable-actor-query]').fill('ZZUNMATCHED9283');
  await page.locator('[data-portable-actor-recommend]').click();
  await expect(page.locator('[data-portable-actor-result]')).toContainText('沒有符合');
  await expect(picker).toHaveValue('jingyue');

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
  await page.evaluate(() => BAOStoryActors.open('host'));
  await expect(page.getByRole('dialog', {name:'本故事的人物設定'})).toBeVisible();
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

  await page.evaluate(() => BAOStoryActors.open('host'));
  await expect(page.getByRole('dialog', {name:'本故事的人物設定'})).toBeVisible();
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

test('Three Realms archetypes require explicit apply and persist as independent story actors', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryActors && window.BAOThreeRealmsStoryActorPack && App.characters?.length));
  const sourceName = await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {persona:{name:'旅人'},narrativeMode:'world',displayMode:'text',api:{model:'mock'},memory:{maxRounds:20,maxContext:32000,mode:'rounds'}};
    GameState.create(App.activeCharacter,App.config);
    Chat.reset(); App.renderChatShell(true); App.showView('chat');
    return App.activeCharacter.name;
  });
  await page.evaluate(() => BAOStoryActors.open('host'));
  const before = await page.evaluate(() => JSON.stringify(GameState.current));
  const picker = page.locator('[data-portable-actor-select]');
  await expect(picker.locator('option[value^="three-realms-archetype-"]')).toHaveCount(31);
  await expect(picker.locator('option[value="three-realms-archetype-24"]')).toHaveCount(0);
  await picker.selectOption('three-realms-archetype-14');
  await page.locator('[data-portable-actor-apply]').click();
  expect(await page.evaluate(() => JSON.stringify(GameState.current))).toBe(before);
  const form = page.locator('#bao-actor-form form');
  await expect(form.locator('[name="name"]')).toHaveValue('顧行舟');
  await expect(form.locator('[name="relationship"]')).toHaveValue('');
  await form.locator('[name="name"]').fill('本場同行');
  await form.locator('[name="identity"]').fill('商隊護衛');
  await page.locator('[data-apply]').click();
  const saved = await page.evaluate(async () => {
    App.saveStory(false);
    const state = Storage.loadStory().state;
    GameState.current = JSON.parse(JSON.stringify(state));
    const actor = GameState.current.storyActors.hostedCharacters[0];
    return {count:GameState.current.storyActors.hostedCharacters.length,name:actor.name,identity:actor.identity,relationship:actor.relationship,packId:actor.portable.packId,actorMode:actor.portable.actorMode,sourceName:App.activeCharacter.name,templateName:BAOThreeRealmsStoryActorPack.actors.find(a => a.id===actor.portable.packId).name,prompt:(await App.buildMessages(App.config)).map(message => message.content || '').join('\n')};
  });
  expect(saved.prompt).toContain('本場人物：本場同行');
  expect(saved.prompt).not.toContain('【原創人物｜顧行舟】');
  expect(saved.prompt).not.toContain('【官方可攜角色｜三界原型｜顧行舟');
  delete saved.prompt;
  expect(saved).toEqual({count:1,name:'本場同行',identity:'商隊護衛',relationship:'',packId:'three-realms-archetype-14',actorMode:false,sourceName,templateName:'顧行舟'});
});


for (const width of [390, 1280]) {
  test(`Experience 3.0 character library search and disclosure at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height:900});
    await page.addInitScript(() => {
      localStorage.setItem('bao-lab:persona-presets-v1', JSON.stringify([
        {id:'photo-person',label:'林雨',persona:{name:'林雨',identity:'攝影師',personality:'喜歡夜景'}},
        {id:'chef-person',label:'山海',persona:{name:'山海',identity:'廚師',personality:'沉穩'}}
      ]));
      localStorage.setItem('bao-lab:actor-presets-v1', JSON.stringify([
        {id:'detective-npc',label:'青柚',actor:{name:'青柚',identity:'調查員',role:'additional',personality:'冷靜'}},
        {id:'musician-npc',label:'時羽',actor:{name:'時羽',identity:'音樂家',role:'additional',personality:'熱情'}}
      ]));
    });
    await page.goto('/');
    await page.waitForFunction(() => !!window.BAOStoryActors && !!window.YoruExperience);
    await page.evaluate(() => YoruExperience.choose({theme:'mist'}));
    await page.evaluate(() => BAOStoryActors.openLibrary('player'));
    const modal = page.getByRole('dialog', {name:'我的人物庫'});
    await expect(modal).toBeVisible();
    await expect(modal).toHaveCSS('background-color','rgb(255, 250, 243)');
    const query = modal.getByRole('searchbox', {name:'搜尋我的人物'});
    await expect(modal.locator('.bao-library-card:visible')).toHaveCount(2);
    await expect(modal.locator('[data-library-result-count]')).toHaveText('2 個本機人物');
    await query.fill('攝影');
    await expect(modal.locator('.bao-library-card:visible')).toHaveCount(1);
    await expect(modal.locator('.bao-library-card:visible')).toContainText('林雨');
    await expect(modal.locator('[data-library-result-count]')).toHaveText('1 / 2 個人物');
    await query.fill('unfindable-no-match');
    await expect(modal.locator('.bao-library-card:visible')).toHaveCount(0);
    await expect(modal.locator('[data-library-no-match]')).toBeVisible();

    await modal.locator('[data-library-mode="actor"]').click();
    await expect(modal.locator('[data-library-mode="actor"]')).toHaveAttribute('aria-pressed','true');
    await expect(query).toHaveValue('');
    await expect(modal.locator('.bao-library-card:visible')).toHaveCount(2);
    await query.fill('調查員');
    const match = modal.locator('.bao-library-card:visible');
    await expect(match).toHaveCount(1);
    await expect(match).toContainText('青柚');
    await expect(match.locator('[data-library-edit]')).toBeVisible();
    await expect(match.locator('[data-library-copy]')).toBeHidden();
    await match.locator('.bao-library-more > summary').click();
    await expect(match.locator('[data-library-copy]')).toBeVisible();
    await match.locator('[data-library-copy]').click();
    await expect(modal.locator('.bao-library-card:visible')).toHaveCount(2);
    const count = await page.evaluate(() => JSON.parse(localStorage.getItem('bao-lab:actor-presets-v1')).length);
    expect(count).toBe(3);

    await page.evaluate(() => YoruExperience.choose({theme:'rose'}));
    await expect(modal).toHaveCSS('background-color','rgb(59, 48, 54)');
    await modal.locator('[data-library-mode="player"]').click();
    await expect(query).toHaveValue('unfindable-no-match');
    await query.fill('');
    await expect(modal.locator('.bao-library-card:visible')).toHaveCount(2);
    await expect(modal.locator('.bao-library-card [data-library-copy]:visible')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await modal.getByRole('button', {name:'關閉'}).click();
    await expect(page.locator('#bao-actor-backdrop')).toHaveCount(0);
  });
}

test('story actor editor respects theme while preserving player and author boundaries', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForFunction(() => !!window.BAOStoryActors && !!window.YoruExperience && App.characters?.length);
  await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {persona:{name:'本場旅人'},narrativeMode:'immersive',displayMode:'text',api:{model:'mock'},memory:{maxRounds:20,maxContext:32000,mode:'rounds'}};
    GameState.create(App.activeCharacter,App.config);
    Chat.reset(); App.renderChatShell(true); App.showView('chat');
    YoruExperience.choose({theme:'mist'});
    BAOStoryActors.open('host');
  });
  const modal = page.getByRole('dialog', {name:'本故事的人物設定'});
  await expect(modal).toBeVisible();
  await expect(modal).toHaveCSS('background-color','rgb(255, 250, 243)');
  await expect(modal.locator('[data-actor-preset-select]')).toHaveCount(1);
  await expect(modal.locator('[data-portable-actor-select]')).toHaveCount(1);
  const stateBefore = await page.evaluate(() => JSON.stringify(GameState.current));
  await page.evaluate(() => YoruExperience.choose({theme:'rose'}));
  await expect(modal).toHaveCSS('background-color','rgb(59, 48, 54)');
  await modal.getByRole('button', {name:'取消'}).click();
  expect(await page.evaluate(() => JSON.stringify(GameState.current))).toBe(stateBefore);
});
