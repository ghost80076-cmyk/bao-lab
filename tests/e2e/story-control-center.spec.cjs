const { test, expect } = require('@playwright/test');

test('opens the current story control center and routes to existing story tools', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(
    window.BAOStoryControlCenter &&
    window.BAOStoryExtensionsCenter &&
    window.BAOConversationSearch &&
    window.BAOWorldModules &&
    window.BAOPlayerTextReplace &&
    window.BAORegex &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = {
      ...App.characters[0],
      greeting: '夜灣的燈還亮著。',
      world_modules: [
        { id: 'inventory', label: '作品背包', context: 'core', tracking: 'high', kind: 'collection' }
      ]
    };
    App.config = {
      persona: { name: '玩家', identity: '旅人', relationship: '初次見面' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: { model: 'mock-story-model', baseUrl: 'https://example.invalid', key: 'not-a-real-key' },
      memory: { maxRounds: 20, maxContext: 32000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    BAOWorldModules.applyCustomization({
      version: 1,
      enabledBuiltIns: ['quests'],
      disabled: ['quests'],
      customModules: [{
        id: 'custom_map',
        label: '玩家地圖',
        icon: '◇',
        context: 'ui_only',
        tracking: 'manual',
        kind: 'object',
        triggers: [],
        fields: []
      }],
      order: ['inventory', 'quests', 'custom_map']
    }, App.activeCharacter);
    BAOPlayerTextReplace.set({
      active: true,
      scope: { chat: true, status: false },
      rules: [{ id: 'age', find: '20歲', replace: 'XX歲', enabled: true }]
    });
    BAORegex.save({
      active: true,
      rules: [{ name: '稱呼修正', pattern: '先生', replacement: '老師', flags: 'g', enabled: true }]
    });
    localStorage.setItem(
      'bao-lab:author-regex:v1:' + encodeURIComponent(App.activeCharacter.id),
      JSON.stringify({
        enabled: false,
        allowScripts: false,
        allowExternalAssets: false,
        allowStateSharing: false,
        allowUiPersistence: false,
        rules: [{ pattern: 'hello', replacement: '<b>hi</b>', flags: 'g', enabled: true }]
      })
    );
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    Chat.add('user', '我回到港口。');
    Chat.add('assistant', '故事從昨晚停下的地方繼續。');
    App.renderChatShell(false);
    App.showView('chat');
  });

  const open = page.getByRole('button', { name: '故事總覽', exact: true });
  await expect(open).toBeVisible();
  await open.click();

  const dialog = page.getByRole('dialog', { name: '故事總覽' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('mock-story-model');
  await expect(dialog).toContainText('玩家');
  await expect(dialog).toContainText('故事記憶');
  await expect(dialog).toContainText('人物／世界狀態');
  await expect(dialog).toContainText('故事擴充');
  await expect(dialog).toContainText('今晚的故事');

  const extra = dialog.locator('details.story-control-more');
  await expect(extra).not.toHaveAttribute('open','');
  await expect(dialog.getByRole('button', { name: /故事擴充/ })).toBeHidden();
  await extra.locator('summary').click();
  await expect(dialog.getByRole('button', { name: /故事擴充/ })).toBeVisible();
  await dialog.getByRole('button', { name: /故事擴充/ }).click();
  await expect(dialog).not.toBeVisible();

  const extensions = page.getByRole('dialog', { name: '故事擴充' });
  await expect(extensions).toBeVisible();
  await expect(extensions).toContainText('世界運作');
  await expect(extensions).toContainText('閱讀排版');
  await expect(extensions).toContainText('玩家顯示 MOD');
  await expect(extensions).toContainText('進階顯示規則');
  await expect(extensions).toContainText('AI 上下文');
  await expect(extensions).toContainText('只改畫面');
  await expect(extensions).toContainText('來源');
  await expect(extensions).toContainText('保存');
  await expect(extensions).toContainText('適用');
  await expect(extensions).toContainText('目前故事');
  await expect(extensions).toContainText('這台裝置的所有故事');
  await expect(extensions).toContainText('玩家規則：所有故事 · 作品規則：目前作品');
  await expect(extensions).toContainText('啟用');
  await expect(extensions).toContainText('作品提供');
  await expect(extensions).toContainText('夜灣內建');
  await expect(extensions).toContainText('玩家建立');
  await expect(extensions).toContainText('作品規則：等待玩家啟用');
  await expect(extensions).toContainText('作者腳本：未允許');
  await expect(extensions).toContainText('不自動送 API');

  const worldCard = extensions.locator('[data-extension-card="world"]');
  await worldCard.locator('.story-extension-inventory > summary').click();
  await expect(worldCard.locator('[data-extension-source-group="work"]')).toContainText('作品背包');
  await expect(worldCard.locator('[data-extension-source-group="platform"]')).toContainText('任務');
  await expect(worldCard.locator('[data-extension-source-group="platform"]')).toContainText('已停用');
  await expect(worldCard.locator('[data-extension-source-group="player"]')).toContainText('玩家地圖');

  const replaceCard = extensions.locator('[data-extension-card="replace"]');
  await replaceCard.locator('.story-extension-inventory > summary').click();
  await expect(replaceCard).toContainText('20歲');
  await expect(replaceCard).toContainText('→ XX歲');
  await expect(replaceCard).toContainText('啟用');

  const regexCard = extensions.locator('[data-extension-card="regex"]');
  await regexCard.locator('.story-extension-inventory > summary').click();
  await expect(regexCard.locator('[data-extension-source-group="player"]')).toContainText('稱呼修正');
  await expect(regexCard.locator('[data-extension-source-group="work"]')).toContainText('hello');
  await expect(regexCard.locator('[data-extension-source-group="work"]')).toContainText('等待玩家啟用');

  const sceneCard = extensions.locator('[data-extension-card="scene"]');
  await sceneCard.locator('.story-extension-inventory > summary').click();
  await expect(sceneCard).toContainText('閱讀模式');
  await expect(sceneCard).toContainText('狀態顯示');
  await expect(sceneCard.locator('[data-extension-quick]')).toHaveCount(0);

  // Safe quick management: configured world modules can be enabled/disabled here.
  const questRow = worldCard.locator('[data-extension-source-group="platform"] .story-extension-item').filter({ hasText: '任務' });
  await questRow.getByRole('button', { name: '啟用', exact: true }).click();
  await expect(worldCard.locator('[data-extension-source-group="platform"]')).toContainText('啟用');
  expect(await page.evaluate(() => GameState.current.worldModuleCustomization.disabled.includes('quests'))).toBe(false);

  // Player text MOD master switch can be changed without opening the full editor.
  await replaceCard.locator('.story-extension-inventory > summary').click();
  let replaceGroup = replaceCard.locator('[data-extension-source-group="player"]');
  await replaceGroup.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAOPlayerTextReplace.get().active)).toBe(false);
  await expect(replaceCard).toContainText('MOD 關閉');
  replaceGroup = replaceCard.locator('[data-extension-source-group="player"]');
  await replaceGroup.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAOPlayerTextReplace.get().active)).toBe(true);

  // Global player Regex can be switched quickly; authored work rules never get a quick permission button.
  await regexCard.locator('.story-extension-inventory > summary').click();
  let regexPlayer = regexCard.locator('[data-extension-source-group="player"]');
  await regexPlayer.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAORegex.load().active)).toBe(false);
  await expect(regexCard).toContainText('總開關關閉');
  regexPlayer = regexCard.locator('[data-extension-source-group="player"]');
  await regexPlayer.locator('header > .story-extension-quick').click();
  expect(await page.evaluate(() => BAORegex.load().active)).toBe(true);
  await expect(regexCard.locator('[data-extension-source-group="work"] [data-extension-quick]')).toHaveCount(0);

  await extensions.getByRole('button', { name: '關閉故事擴充' }).click();

  await open.click();
  const reopened = page.getByRole('dialog', { name: '故事總覽' });
  await reopened.getByRole('button', { name: /搜尋這個故事/ }).click();
  await expect(reopened).not.toBeVisible();
  await expect(page.getByRole('dialog', { name: '搜尋這個對話' })).toBeVisible();
});


for (const width of [390, 1280]) {
  test('story overview retains existing tools and NPC timeline with progressive disclosure (' + width + 'px)', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => Boolean(window.BAOStoryControlCenter && window.YoruExperience && App.characters?.length));
    await page.evaluate(() => {
      App.activeCharacter = App.characters[0];
      App.config = {
        persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'ui',
        api:{model:'mock'},memory:{mode:'smart',maxRounds:20,maxContext:32000}
      };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset(); Chat.add('assistant','夜灣故事測試。');
      App.renderChatShell(false);
      App.showView('chat');
      YoruExperience.choose({ level:'easy', theme:'mist' });
      BAOStoryControlCenter.open();
    });
    const dialog = page.getByRole('dialog', { name:'故事總覽' });
    const more = dialog.locator('.story-control-more');
    const card = dialog.locator('.story-control-card');
    await expect(card).toHaveCount(11);
    await expect(dialog.locator('.story-control-primary .story-control-card')).toHaveCount(5);
    await expect(dialog.locator('.story-control-secondary .story-control-card')).toHaveCount(6);
    await expect(more).not.toHaveAttribute('open','');
    await expect(dialog.locator('[data-story-control-action="model"]')).toBeVisible();
    await expect(dialog.locator('[data-story-control-action="token"]')).toBeVisible();
    await expect(dialog.locator('[data-story-control-action="context"]')).toBeHidden();
    await expect(dialog.locator('[data-story-control-action="timeline"]')).toBeHidden();
    await more.locator('summary').click();
    await expect(dialog.locator('[data-story-control-action="context"]')).toBeVisible();
    await expect(dialog.locator('[data-story-control-action="timeline"]')).toBeVisible();
    await expect(dialog.locator('[data-story-control-action="extensions"]')).toBeVisible();
    const palette = await dialog.evaluate(element => ({
      panel:getComputedStyle(element).backgroundColor,
      expected:getComputedStyle(document.documentElement).getPropertyValue('--yoru-surface').trim()
    }));
    const expectedColor = await page.evaluate(value => {
      const temp=document.createElement('div');temp.style.background=value;
      document.body.append(temp);const color=getComputedStyle(temp).backgroundColor;temp.remove();return color;
    },palette.expected);
    expect(palette.panel).toBe(expectedColor);
    await dialog.getByRole('button',{name:'關閉故事總覽'}).click();

    for(const level of ['standard','pro']){
      await page.evaluate(selected => {
        YoruExperience.choose({level:selected,theme:'dusk'});
        BAOStoryControlCenter.open();
      },level);
      await expect(more).toHaveAttribute('open','');
      await expect(dialog.locator('[data-story-control-action="extensions"]')).toBeVisible();
      await expect(card).toHaveCount(11);
      await dialog.getByRole('button',{name:'關閉故事總覽'}).click();
    }
    // The visible fifth shortcut reuses the existing per-story editor, not a separate Token state.
    await page.evaluate(() => BAOStoryControlCenter.open());
    const tokenCard = dialog.locator('[data-story-control-action="token"]');
    await expect(tokenCard).toBeVisible();
    await expect(tokenCard).toContainText('輸出設定 4,096 Token');
    await expect(tokenCard).toContainText('Context 整理參考 32,000 Token');
    await tokenCard.click();
    await expect(dialog).not.toBeVisible();
    const editor = page.getByRole('dialog', { name: '目前故事：記憶、Token 與成本' });
    await expect(editor).toBeVisible();
    await editor.locator('[name="maxOutputTokens"]').fill('6144');
    await editor.locator('[name="maxContext"]').fill('40000');
    await editor.getByRole('button', { name: '儲存到目前故事' }).click();
    await expect(editor).not.toBeVisible();
    const saved = await page.evaluate(() => ({
      output: App.config.api.maxOutputTokens,
      cost: App.config.cost.maxOutputTokens,
      context: App.config.memory.maxContext,
      activeStory: GameState.current.config === App.config,
      messages: Chat.messages.length
    }));
    expect(saved).toMatchObject({ output: 6144, cost: 6144, context: 40000, activeStory: true });
    expect(saved.messages).toBeGreaterThan(0);
    await page.evaluate(() => BAOStoryControlCenter.open());
    await expect(dialog.locator('[data-story-control-action="token"]')).toContainText('輸出設定 6,144 Token');
    await expect(dialog.locator('[data-story-control-action="token"]')).toContainText('40,000 Token');
    await dialog.getByRole('button', { name: '關閉故事總覽' }).click();

    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });
}


for (const width of [390,1280]) {
  test('story desk keeps shelf and backup visible while retaining advanced tools ('+width+'px)',async ({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('./');
    await page.waitForFunction(()=>Boolean(window.YoruExperience && window.BAOStoryTools && App.characters?.length && Storage.status().ready));
    await page.evaluate(()=>{
      App.activeCharacter={...App.characters[0],greeting:'夜灣歸航'};
      App.config={
        persona:{name:'玩家'},narrativeMode:'immersive',displayMode:'ui',
        api:{model:'mock',key:'DONT_EXPORT_THIS'},memory:{mode:'smart',maxRounds:20,maxContext:32000}
      };
      GameState.create(App.activeCharacter,App.config);
      Chat.reset();Chat.add('assistant','夜灣歸航');
      App.renderChatShell(false);
      App.showView('chat');
      YoruExperience.choose({level:'easy',theme:'mist'});
      BAOStoryTools.open();
    });
    const dialog=page.getByRole('dialog',{name:'故事管理'});
    const advanced=dialog.locator('[data-story-desk-more]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.story-tools-home:not(.story-tools-home-advanced) > .story-tools-card')).toHaveCount(2);
    await expect(dialog.locator('.story-tools-home-advanced > .story-tools-card')).toHaveCount(3);
    await expect(advanced).not.toHaveAttribute('open','');
    await expect(dialog.locator('[data-library]')).toBeVisible();
    await expect(dialog.locator('[data-export]')).toBeVisible();
    await expect(dialog.locator('[data-import]')).toBeVisible();
    await expect(dialog.locator('[data-create]')).toBeHidden();
    await expect(dialog).toHaveCSS('background-color','rgb(255, 250, 243)');
    await advanced.locator('summary').click();
    await expect(dialog.locator('[data-create]')).toBeVisible();
    await expect(dialog.locator('[data-external]')).toBeVisible();
    await expect(dialog.locator('[data-preview]')).toBeVisible();
    await expect(dialog.locator('.story-tools-home .story-tools-card')).toHaveCount(5);
    const before=await page.evaluate(()=>JSON.stringify(GameState.current));
    await dialog.getByRole('button',{name:'關閉'}).click();
    await page.evaluate(()=>{
      YoruExperience.choose({level:'pro',theme:'dusk'});
      BAOStoryTools.open();
    });
    await expect(advanced).toHaveAttribute('open','');
    await expect(dialog.locator('[data-create]')).toBeVisible();
    await expect(dialog).toHaveCSS('background-color','rgb(64, 56, 73)');
    expect(await page.evaluate(()=>JSON.stringify(GameState.current))).toBe(before);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
    await dialog.getByRole('button',{name:'關閉'}).click();
  });
}
