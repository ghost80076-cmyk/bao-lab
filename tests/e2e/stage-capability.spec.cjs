const { test, expect } = require('@playwright/test');

async function mountStory(page, { width = 1280, patch = {} } = {}) {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => Boolean(
    window.BAOStorySurface &&
    window.BAOStageCapabilities &&
    window.BAOPhoneUI &&
    window.BAOGameplayUI &&
    App.characters?.length
  ));

  await page.evaluate(({ patch }) => {
    const base = App.characters[0];
    App.activeCharacter = CharacterEngine.normalize({
      ...base,
      gameplay_ui: undefined,
      phone_ui: undefined,
      play_info_surface: undefined,
      initial_state: {
        time: '03:17',
        location: '灰岸市',
        modules: {},
        events: [],
        npcs: []
      },
      greeting: 'Stage capability 測試。',
      ...patch
    });
    App.config = {
      persona: { name:'玩家', identity:'旅人' },
      narrativeMode: 'immersive',
      displayMode: 'ui',
      api: { type:'custom', model:'stage-test', baseUrl:'https://example.invalid', key:'LOCAL_TEST_ONLY' },
      memory: { mode:'smart', maxRounds:20, maxContext:32000, cache:false }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
    BAOGameplayUI.syncGameplayLayout();
    BAOPhoneUI.refresh();
    BAOStorySurface.sync();
  }, { patch });

  await expect(page.locator('#chat-view')).toBeVisible();
}

test('reader cards resolve to the platform Reader Stage without changing state', async ({ page }) => {
  await mountStory(page, { width:1280 });

  const root = page.locator('#chat-view');
  await expect(root).toHaveAttribute('data-bao-stage-shell', 'reader');
  await expect(root).toHaveAttribute('data-bao-stage-renderer', 'reader-context');
  await expect(root).toHaveAttribute('data-bao-stage-presentation', 'sheet');

  const stage = page.locator('#bao-play-status-toggle');
  await expect(stage).toHaveAttribute('aria-controls', 'bao-reader-context');
  await expect(stage).toHaveAttribute('aria-label', '查看舞臺：故事資訊');

  const before = await page.evaluate(() => JSON.stringify(GameState.current));
  await stage.click();
  await expect(page.locator('#bao-reader-context')).toBeVisible();
  const after = await page.evaluate(() => JSON.stringify(GameState.current));
  expect(after).toBe(before);
});

test('Gameplay layout becomes the resolved Stage shell while keeping the safe renderer', async ({ page }) => {
  await mountStory(page, {
    width:1440,
    patch:{
      gameplay_ui:{
        version:1,
        layout:{ preset:'rpg-dashboard', left_panel:'status' },
        panels:[{
          id:'status',
          label:'狀態',
          sections:[{
            type:'stats',
            title:'目前狀態',
            items:[
              { label:'時間', path:'time' },
              { label:'地點', path:'location' }
            ]
          }]
        }]
      }
    }
  });

  const root = page.locator('#chat-view');
  await expect(root).toHaveAttribute('data-bao-stage-shell', 'rpg-dashboard');
  await expect(root).toHaveAttribute('data-bao-stage-renderer', 'game-ui');
  await expect(root).toHaveAttribute('data-bao-stage-presentation', 'embedded');
  await expect(page.locator('#bao-play-status-toggle')).toHaveAttribute('aria-label', '查看舞臺：RPG 舞臺');

  const capability = await page.evaluate(() => BAOStageCapabilities.resolve({ viewport:'desktop' }));
  expect(capability.available).toContain('rpg-dashboard');
  expect(capability.persistent).toBe(true);
});

test('phone_ui stays optional unless the work explicitly selects Phone as its Stage', async ({ page }) => {
  const phone = {
    enabled:true,
    userName:'玩家',
    contactName:'未知聯絡人',
    apps:['notes'],
    notes:[{ id:'invite', title:'03:17', text:'你收到了一個不存在的世界邀請。' }]
  };

  await mountStory(page, { width:1280, patch:{ phone_ui:phone } });

  await expect(page.locator('#chat-view')).toHaveAttribute('data-bao-stage-shell', 'reader');
  await expect(page.locator('#bao-phone-launch')).toBeVisible();
  const optional = await page.evaluate(() => BAOStageCapabilities.resolve({ viewport:'desktop' }));
  expect(optional.available).toContain('phone');
  expect(optional.shell).toBe('reader');

  await page.evaluate(() => {
    BAOStorySurface.closeStatus();
    App.activeCharacter = { ...App.activeCharacter, play_info_surface:'phone' };
    BAOPhoneUI.refresh();
    BAOStorySurface.sync();
  });

  const root = page.locator('#chat-view');
  await expect(root).toHaveAttribute('data-bao-stage-shell', 'phone');
  await expect(root).toHaveAttribute('data-bao-stage-renderer', 'phone');
  await expect(root).toHaveAttribute('data-bao-stage-presentation', 'overlay');

  const stage = page.locator('#bao-play-status-toggle');
  await expect(stage).toHaveAttribute('aria-controls', 'bao-phone-stage');
  await expect(stage).toHaveAttribute('aria-label', '查看舞臺：作品手機');
  await stage.click();

  const phoneStage = page.locator('#bao-phone-stage');
  await expect(phoneStage).toBeVisible();
  await expect(root).toHaveAttribute('data-bao-experience-surface', 'stage');
  await phoneStage.getByRole('button', { name:'關閉手機' }).click();
  await expect(phoneStage).toHaveCount(0);
  await expect(root).toHaveAttribute('data-bao-experience-surface', 'story');
});

test('explicit Phone Stage works on mobile without opening the generic game panel', async ({ page }) => {
  await mountStory(page, {
    width:390,
    patch:{
      play_info_surface:'phone',
      phone_ui:{
        enabled:true,
        userName:'玩家',
        contactName:'灰岸市',
        apps:['notes'],
        notes:[{ id:'world', title:'WORLD-0317', text:'世界仍在運行。' }]
      }
    }
  });

  const root = page.locator('#chat-view');
  await expect(root).toHaveAttribute('data-bao-stage-shell', 'phone');
  await expect(root).toHaveAttribute('data-bao-stage-renderer', 'phone');

  await page.locator('#bao-play-status-toggle').click();
  await expect(page.locator('#bao-phone-stage')).toBeVisible();
  await expect(page.locator('#chat-view .chat-main')).not.toHaveClass(/bao-mobile-panel-open/);
  await expect(root).toHaveAttribute('data-bao-experience-surface', 'stage');
});

test('Character Studio keeps explicit Phone Stage on native export', async ({ page }) => {
  await page.goto('/character-studio.html');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudio && window.CharacterEngine && window.BAOPhoneUICore));

  const exported = await page.evaluate(() => {
    const card = CharacterEngine.normalize({
      schema_version:'1.5',
      id:'phone-stage-export',
      name:'Phone Stage Export',
      system_prompt:'test',
      greeting:'start',
      play_info_surface:'phone',
      phone_ui:{
        enabled:true,
        userName:'玩家',
        contactName:'世界',
        apps:['notes'],
        notes:[{ id:'note', title:'03:17', text:'世界仍在運行。' }]
      }
    });
    return BAOCharacterStudio.toExport(card);
  });

  expect(exported.presentation.play_info_surface).toBe('phone');
  expect(exported.presentation.phone_ui.notes[0].title).toBe('03:17');
});

test('Terminal Stage is persistent on desktop and falls back to the safe panel on compact layouts', async ({ page }) => {
  const terminalCard = {
    gameplay_ui:{
      version:1,
      layout:{ preset:'terminal', primary_panel:'system' },
      panels:[{
        id:'system',
        label:'WORLD-0317',
        sections:[
          { type:'stats', title:'SYSTEM STATUS', items:[
            { label:'時間', path:'time' },
            { label:'地點', path:'location' }
          ]},
          { type:'actions', title:'COMMANDS', items:[
            { label:'接受邀請', draft:'我接受這個不存在的世界邀請。' }
          ]}
        ]
      }]
    }
  };

  await mountStory(page, { width:1440, patch:terminalCard });

  const root = page.locator('#chat-view');
  await expect(root).toHaveAttribute('data-bao-stage-shell', 'terminal');
  await expect(root).toHaveAttribute('data-bao-stage-renderer', 'game-ui');
  await expect(root).toHaveAttribute('data-bao-stage-presentation', 'embedded');
  await expect(root).toHaveAttribute('data-gameplay-layout', 'terminal');

  const terminal = page.locator('#bao-gameplay-terminal-stage');
  await expect(terminal).toBeVisible();
  await expect(terminal).toContainText('YORUBAY // TERMINAL');
  await expect(terminal).toContainText('WORLD-0317');
  await expect(terminal).toContainText('03:17');
  await expect(terminal).toContainText('灰岸市');
  await expect(page.locator('#game-ui')).toBeHidden();

  const beforeMessages = await page.evaluate(() => Chat.messages.length);
  await terminal.getByRole('button', { name:'接受邀請' }).click();
  await expect(page.locator('#user-input')).toHaveValue('我接受這個不存在的世界邀請。');
  expect(await page.evaluate(() => Chat.messages.length)).toBe(beforeMessages);

  await page.locator('#bao-play-status-toggle').click();
  await expect(terminal).toBeFocused();

  await page.setViewportSize({ width:900, height:844 });
  await page.evaluate(() => {
    BAOGameplayUI.syncGameplayLayout();
    BAOStorySurface.sync();
  });
  await expect(root).toHaveAttribute('data-bao-stage-presentation', 'panel');
  await expect(terminal).toBeHidden();

  await page.locator('#bao-play-status-toggle').click();
  await expect(page.locator('#game-ui')).toBeVisible();
  await expect(page.locator('#ui-panel')).toContainText('SYSTEM STATUS');
});

for (const [preset, threshold, target] of [
  ['terminal',1081,'bao-gameplay-terminal-stage'],
  ['scene-rpg',1280,'bao-gameplay-scene-stage'],
  ['rpg-dashboard',1430,'bao-gameplay-dashboard-left']
]) {
  test(`${preset} Stage follows real layout boundaries and preserves story data`, async ({page})=>{
    await mountStory(page,{width:threshold-1,patch:{gameplay_ui:{version:1,
      layout:{preset,left_panel:'status',right_panel:'world',primary_panel:'status'},
      panels:[{id:'status',label:'Status',sections:[{type:'stats',items:[{label:'時間',path:'time'}]}]},
        {id:'world',label:'World',sections:[{type:'stats',items:[{label:'地點',path:'location'}]}]}]}}});
    const root=page.locator('#chat-view'),button=page.locator('#bao-play-status-toggle');
    const before=await page.evaluate(()=>JSON.stringify({state:GameState.current,api:App.config.api,messages:Chat.messages}));
    for(const width of [threshold-1,threshold,threshold-1,820,821,1080,1081,threshold]){
      await page.setViewportSize({width,height:844});
      const embedded=width>=threshold;
      await expect(root).toHaveAttribute('data-bao-stage-presentation',embedded?'embedded':'panel');
      await expect(button).toHaveAttribute('aria-controls',embedded?target:'game-ui');
      const host=page.locator('#'+target);
      if(embedded){
        await expect(host).toBeVisible();
        if(preset==='rpg-dashboard'){
          await expect(page.locator('#bao-gameplay-dashboard-right')).toBeVisible();
          await expect(page.locator('#bao-author-regex-panel')).toBeHidden();
          await expect(page.locator('#bao-scene-view-controls')).toBeHidden();
        }
        expect((await page.locator('.chat-title-copy').boundingBox()).width).toBeGreaterThanOrEqual(180);
        const columns=await page.locator('#chat-view .chat-layout').evaluate(n=>getComputedStyle(n).gridTemplateColumns.split(' ').length);
        expect(columns).toBe(preset==='rpg-dashboard'?3:2);
      }else{
        await expect(host).toBeHidden();
        await expect(page.locator('#game-ui')).toBeHidden();
      }
      await button.click();
      if(embedded)await expect(host).toBeFocused();
      else await expect(page.locator('#game-ui')).toBeVisible();
      await page.evaluate(()=>BAOStorySurface.closeStatus());
      await expect(root).toHaveAttribute('data-bao-experience-surface','story');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width+1);
    }
    expect(await page.evaluate(()=>JSON.stringify({state:GameState.current,api:App.config.api,messages:Chat.messages}))).toBe(before);
  });
}
