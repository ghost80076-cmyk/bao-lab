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
    width:1280,
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
