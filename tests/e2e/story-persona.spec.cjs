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
  await expect(page.locator('[data-open-roster]')).toHaveText('NPC 名冊／場景參與者');
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

test('mobile story-persona footer keeps cancel and save actions on one aligned row', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOStoryActors && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {
      persona: { name:'手機玩家', gender:'未指定', identity:'', personality:'', relationship:'', extra:'' },
      narrativeMode:'immersive', displayMode:'text',
      api: {model:'mock', baseUrl:'https://example.invalid', key:'not-a-real-key'},
      memory: {maxRounds:20, maxContext:32000, mode:'rounds', cache:true}
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    App.renderChatShell(true);
    App.showView('chat');
  });
  await page.locator('#bao-actor-entry').click();
  const dialog = page.getByRole('dialog', { name:'本故事的人物設定' });
  await expect(dialog).toBeVisible();
  const help = dialog.getByRole('button', { name:'人物設定說明' });
  await expect(help).toBeVisible();
  await expect(dialog.locator('#bao-actor-intro')).toBeHidden();
  await help.click();
  await expect(dialog.locator('#bao-actor-intro')).toBeVisible();
  await help.click();
  await expect(dialog.locator('#bao-actor-intro')).toBeHidden();
  await expect(dialog.locator('#bao-actor-form > .note')).toBeHidden();

  const cancel = page.getByRole('button', { name:'取消', exact:true });
  const save = page.getByRole('button', { name:'儲存至本故事', exact:true });
  await expect(cancel).toBeVisible();
  await expect(save).toBeVisible();
  const boxes = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('.bao-actor-dialog footer button')];
    return buttons.map(button => {
      const r = button.getBoundingClientRect();
      return { top:r.top, bottom:r.bottom, width:r.width, height:r.height };
    });
  });
  expect(boxes).toHaveLength(2);
  expect(Math.abs(boxes[0].top - boxes[1].top)).toBeLessThanOrEqual(2);
  expect(Math.abs(boxes[0].height - boxes[1].height)).toBeLessThanOrEqual(2);
  expect(boxes[0].width).toBeGreaterThan(80);
  expect(boxes[1].width).toBeGreaterThan(boxes[0].width);
});


test('mobile status manager keeps current story fields before help and templates', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStatusUI && window.BAOStoryActors && App.characters?.length));
  await page.evaluate(() => {
    App.activeCharacter = App.characters[0];
    App.config = {
      persona: { name:'手機玩家', gender:'未指定', identity:'旅人', personality:'', relationship:'', extra:'' },
      narrativeMode:'immersive', displayMode:'ui',
      api: {model:'mock', baseUrl:'https://example.invalid', key:'not-a-real-key'},
      memory: {maxRounds:20, maxContext:32000, mode:'rounds', cache:true}
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    BAOCharacterStatus.ensureState(App.activeCharacter);
    GameState.upsertNPC?.({ name:'測試 NPC', role:'旅店老闆', presence:'present', location:GameState.current.location || '未知' });
    App.renderChatShell(true);
    App.showView('chat');
  });

  await page.evaluate(() => BAOCharacterStatusUI.openSettings());
  const status = page.locator('.status-manager-modal');
  await expect(status).toBeVisible();
  await expect(status.locator('.status-manager-head .eyebrow')).toBeHidden();
  await expect(status.locator('.status-manager-head p')).toBeHidden();
  const statusOrder = await status.evaluate(node => {
    const fields = node.querySelector('.status-manager-fields-card').getBoundingClientRect();
    const templates = node.querySelector('.status-manager-templates').getBoundingClientRect();
    const main = node.querySelector('.status-manager-body main').getBoundingClientRect();
    const aside = node.querySelector('.status-manager-body aside').getBoundingClientRect();
    return { fieldsBeforeTemplates: fields.top < templates.top, mainBeforeAside: main.top < aside.top };
  });
  expect(statusOrder).toEqual({ fieldsBeforeTemplates:true, mainBeforeAside:true });
  await status.locator('[data-status-close]').click();

  await page.evaluate(() => BAOCharacterStatusUI.openNpcRoster());
  const roster = page.getByRole('dialog', { name:'NPC 名冊／場景參與者' });
  await expect(roster).toBeVisible();
  await expect(roster.locator('header .eyebrow')).toBeHidden();
  await expect(roster.locator('#npc-roster-intro')).toBeHidden();
  const rosterHelp = roster.getByRole('button', { name:'NPC 名冊說明' });
  await expect(rosterHelp).toBeVisible();
  const rosterOrder = await roster.evaluate(node => {
    const current = node.querySelector('.npc-roster-current').getBoundingClientRect();
    const add = node.querySelector('.npc-roster-add').getBoundingClientRect();
    return current.top < add.top;
  });
  expect(rosterOrder).toBe(true);
  await rosterHelp.click();
  await expect(roster.locator('#npc-roster-intro')).toBeVisible();
  await rosterHelp.click();
  await expect(roster.locator('#npc-roster-intro')).toBeHidden();
});
