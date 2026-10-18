const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof CharacterEngine !== 'undefined' && window.BAOGameplayUI && window.BAOGameplayUICore);
  await page.waitForTimeout(500);
}

test('legacy cards without gameplay_ui do not get the new builder', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    App.activeCharacter = CharacterEngine.normalize({
      id: 'legacy-ui-test',
      name: 'Legacy UI Test',
      system_prompt: 'test',
      greeting: 'hello',
      initial_state: {}
    });
    App.openBuilder();
  });
  await expect(page.locator('#bao-gameplay-builder')).toHaveCount(0);
});

test('mixed native list objects render labeled cards on mobile without leaking raw JSON', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.evaluate(() => {
    App.activeCharacter = CharacterEngine.normalize({
      id: 'generic-collection-display-test',
      name: 'Collection Test',
      system_prompt: 'test',
      greeting: 'hello',
      world_modules: [
        { id: 'people', kind: 'collection', label: '已知人物', context: 'recent' }
      ],
      initial_state: {
        modules: {
          people: [JSON.stringify([{ name: '歐陽雪', identity: '月影學院成年藝人', known: '有男友張昊然', relationship: '未認識玩家' }])]
        }
      },
      gameplay_ui: {
        version: 1,
        panels: [{ id: 'archive', label: '資料', sections: [{
          type: 'list',
          title: '相關人物',
          path: 'modules.people',
          limit: 10
        }] }]
      }
    });
    App.config = {
      narrativeMode: 'world', displayMode: 'ui',
      persona: { name: '測試玩家', gender: '未指定' },
      api: { type: 'custom', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'manual', maxRounds: 20, maxContext: 32000, cache: false }
    };
    GameState.create(App.activeCharacter, App.config);
    App.showView('chat');
    BAOGameplayUI.renderPanel('archive');
  });
  const section = page.locator('#ui-panel .gameplay-list-record');
  await expect(section).toHaveCount(1);
  await expect(section).toContainText('歐陽雪');
  await expect(section).toContainText('身分');
  await expect(section).toContainText('有男友張昊然');
  await expect(section).not.toContainText('{"name"');

  await page.evaluate(() => App.renderUIPanel('module:people'));
  const moduleCard = page.locator('#ui-panel .world-module-card');
  await expect(moduleCard).toHaveCount(1);
  await expect(moduleCard).toContainText('歐陽雪');
  await expect(moduleCard).toContainText('身分');
  await expect(moduleCard).toContainText('有男友張昊然');
  await expect(moduleCard).not.toContainText('{"name"');
});

test('gameplay schema renders builder, applies state, and drafts actions without auto-send', async ({ page }) => {
  await ready(page);
  const card = await page.evaluate(async () => (await fetch('tests/fixtures/gameplay-ui-demo-character.json')).json());
  await page.evaluate(raw => {
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.openBuilder();
    App.setStep(3);
  }, card);

  const builder = page.locator('#bao-gameplay-builder');
  await expect(builder).toBeVisible();
  await expect(builder).toHaveAttribute('data-gameplay-theme', 'stage-neon');
  await expect(builder).toHaveAttribute('data-gameplay-density', 'compact');
  expect(await builder.evaluate(node => node.style.getPropertyValue('--gameplay-accent'))).toBe('#c78cff');
  await expect(builder).toContainText('剩餘 6 / 6');

  const plus = page.locator('[data-gameplay-attribute="strength"] [data-gameplay-step="plus"]');
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(builder).toContainText('剩餘 3 / 6');
  await page.locator('[data-gameplay-field="origin"]').selectOption('世家子弟');

  await page.evaluate(() => {
    const config = App.collectConfig();
    config.displayMode = 'ui';
    App.config = config;
    GameState.create(App.activeCharacter, config);
    App.showView('chat');
    BAOGameplayUI.renderPanel('status');
  });

  await page.evaluate(() => {
    window.BAOChatExperience?.sync?.();
    BAOGameplayUI.syncDashboardLayout();
  });
  const panel = page.locator('#ui-panel');
  const gameUI = page.locator('#game-ui');
  await expect(page.locator('#chat-view')).toHaveAttribute('data-gameplay-layout', 'rpg-dashboard');
  await expect(page.locator('#bao-gameplay-dashboard-left')).toContainText('700 / 810');
  await expect(page.locator('#bao-gameplay-dashboard-left')).toContainText('世家子弟');
  await expect(page.locator('#bao-gameplay-dashboard-right')).toContainText('青雲城');
  await expect(page.locator('#bao-gameplay-dashboard-right')).toContainText('宗門試煉');
  await expect(gameUI).toHaveAttribute('data-gameplay-theme', 'stage-neon');
  await expect(gameUI).toHaveAttribute('data-gameplay-meter', 'glow');
  await expect(panel).toContainText('700 / 810');
  await expect(panel).toContainText('力量');
  await expect(panel).toContainText('11');
  await expect(panel).toContainText('世家子弟');

  const drafted = await page.evaluate(() => {
    BAOGameplayUI.renderPanel('combat');
    const action = document.querySelector('[data-gameplay-draft-text]');
    if (!action) return '';
    action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return document.getElementById('user-input')?.value || '';
  });
  expect(drafted).toBe('我採取穩健策略迎戰，優先保命並觀察對手破綻。');

  await page.evaluate(() => BAOGameplayUI.renderPanel('adventure'));
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="codex"]')).toContainText('行商');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="codex"]')).toContainText('青雲城');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="codex"]')).not.toContainText('知道北門妖獸的傳聞。');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="quest"]')).toContainText('北門妖獸');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="quest"]')).toContainText('1 / 3');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="party"]')).toContainText('阿璃');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="party"]')).toContainText('92 / 100');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="skill"]')).toContainText('流雲步');
  await expect(page.locator('#ui-panel .gameplay-card-grid[data-card-variant="skill"]')).toContainText('12 氣');

  await page.evaluate(() => {
    App.activeCharacter.gameplay_ui = {
      ...App.activeCharacter.gameplay_ui,
      layout: { preset: 'standard' }
    };
    App.config.displayMode = 'ui';
    App.renderChatShell(false);
    App.showView('chat');
    window.BAOChatExperience?.sync?.();
    BAOGameplayUI.syncDashboardLayout();
    BAOGameplayUI.renderPanel('archive');
  });
  const archive = page.locator('#ui-panel .gameplay-tabbed-archive');
  await expect(archive).toHaveCount(1);
  await expect(archive.locator('.gameplay-archive-tab')).toHaveCount(4);
  await expect(archive.locator('.gameplay-location-archive')).toContainText('青雲城');
  await expect(archive.locator('.gameplay-location-archive')).toContainText('東城');
  await expect(archive.locator('.gameplay-location-archive')).toContainText('北門');
  await expect(archive.locator('.gameplay-location-media img')).toHaveAttribute('src', /assets\/bao-mark\.svg/);

  const locationDraft = await page.evaluate(() => {
    const button = [...document.querySelectorAll('#ui-panel .gameplay-destination-card button')]
      .find(node => node.closest('.gameplay-destination-card')?.textContent?.includes('北門'));
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return document.getElementById('user-input')?.value || '';
  });
  expect(locationDraft).toBe('我前往北門調查妖獸目擊情報。');

  await page.evaluate(() => document.querySelector('#ui-panel [data-gameplay-archive-tab="relation"]')?.click());
  await expect(archive.locator('[data-gameplay-archive-pane="relation"]')).not.toHaveAttribute('hidden', '');
  await expect(archive.locator('[data-gameplay-archive-pane="relation"]')).toContainText('剛認識');

  await expect.poll(() => page.evaluate(() => Boolean(window.BAOWorldModules))).toBe(true);
  await page.evaluate(() => {
    GameState.applyUpdate({
      location: '北門',
      modules: { relationship: { status: '同行者' } }
    });
  });
  await page.evaluate(() => BAOGameplayUI.renderPanel('archive'));
  const rerenderedArchive = page.locator('#ui-panel .gameplay-tabbed-archive');
  await page.evaluate(() => document.querySelector('#ui-panel [data-gameplay-archive-tab="changes"]')?.click());
  await expect(rerenderedArchive.locator('[data-gameplay-archive-pane="changes"]')).not.toHaveAttribute('hidden', '');
  const diffTimeline = rerenderedArchive.locator('[data-timeline-mode="round_diff"]');
  await expect(diffTimeline).toContainText('地點');
  await expect(diffTimeline).toContainText('青雲城');
  await expect(diffTimeline).toContainText('北門');
  await expect(diffTimeline).toContainText('關係');
  await expect(diffTimeline).toContainText('剛認識');
  await expect(diffTimeline).toContainText('同行者');

  await page.evaluate(() => document.querySelector('#ui-panel [data-gameplay-archive-tab="history"]')?.click());
  await expect(rerenderedArchive.locator('[data-gameplay-archive-pane="history"]')).not.toHaveAttribute('hidden', '');
  const history = rerenderedArchive.locator('[data-gameplay-archive-pane="history"]');
  await expect(history).toContainText('抵達青雲城');
  await expect(history).toContainText('聽見北門傳聞');
});



test('scene-rpg uses one persistent scene stage and keeps story controls on the right', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await ready(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOStoryImageMoments?.latestForCurrentStory))).toBe(true);
  const card = await page.evaluate(async () => (await fetch('tests/fixtures/gameplay-ui-demo-character.json')).json());

  await page.evaluate(raw => {
    raw.reading_background = 'assets/bao-mark.svg';
    raw.gameplay_ui.layout = {
      preset: 'scene-rpg',
      right_panel: 'world',
      scene_source: 'reading-background',
      scene_fit: 'contain'
    };
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.config = {
      narrativeMode: 'world',
      displayMode: 'ui',
      persona: { name: '測試玩家', gender: '', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
    BAOGameplayUI.syncTabs();
    BAOGameplayUI.activateInitialPanel();
    BAOGameplayUI.syncGameplayLayout();
  }, card);

  const root = page.locator('#chat-view');
  const stage = page.locator('#bao-gameplay-scene-stage');
  await expect(root).toHaveAttribute('data-gameplay-layout', 'scene-rpg');
  await expect(stage).toHaveCount(1);
  await expect(stage).toBeVisible();
  await expect(stage).toHaveAttribute('data-scene-fit', 'contain');
  await expect(stage.locator('[data-scene-location]')).toHaveText('青雲城');
  await expect(stage.locator('[data-scene-time]')).toContainText('玄曆 30 年');
  await expect(stage.locator('img')).toHaveAttribute('src', /assets\/bao-mark\.svg/);
  await expect(page.locator('#ui-panel')).toContainText('青雲城');
  await expect(page.locator('#ui-panel')).toContainText('宗門試煉');
  await expect(page.locator('#user-input')).toBeVisible();
  expect(await page.locator('#bao-gameplay-scene-stage').count()).toBe(1);
});

test('dual host system card maps global Persona display to system identity without changing Persona data', async ({ page }) => {
  await ready(page);
  const card = await page.evaluate(async () => (await fetch('data/characters/community/db/dual-host-system-mode.json')).json());

  await page.evaluate(raw => {
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.config = {
      narrativeMode: 'world',
      displayMode: 'text',
      persona: { name: '未命名玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      gameplaySetup: { player_mode: '純系統' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
  }, card);

  const identitySnapshot = await page.evaluate(() => ({
    sourcePath: App.activeCharacter?.gameplay_ui?.player_identity?.source_path || '',
    playerMode: GameState.current?.modules?.system_core?.player_mode || ''
  }));
  expect(identitySnapshot).toEqual({
    sourcePath: 'modules.system_core.player_mode',
    playerMode: '純系統'
  });
  await expect(page.locator('#chat-persona')).toHaveText('系統本體');

  await page.evaluate(() => {
    App.config.persona.name = '班長測試化身';
    GameState.current.modules.system_core.player_mode = '系統＋化身';
    BAOGameplayUI.syncPlayerIdentityLabel();
  });
  await expect(page.locator('#chat-persona')).toHaveText('班長測試化身');

  await page.evaluate(() => {
    App.config.persona.name = '未命名玩家';
    BAOGameplayUI.syncPlayerIdentityLabel();
  });
  await expect(page.locator('#chat-persona')).toHaveText('系統化身');
  expect(await page.evaluate(() => App.config.persona.name)).toBe('未命名玩家');
});

test('native effect buttons commit a purchase once per click without sending a chat turn', async ({ page }) => {
  await ready(page);
  await page.waitForFunction(() => Boolean(window.BAOWorldModules));
  await page.evaluate(() => {
    App.activeCharacter = CharacterEngine.normalize({
      id: 'native-atomic-action-test',
      name: 'Atomic Action Test',
      system_prompt: 'test',
      greeting: 'welcome',
      world_modules: [
        { id: 'economy', kind: 'object', context: 'core' },
        { id: 'supplies', kind: 'object', context: 'core' },
        { id: 'inventory', kind: 'collection', context: 'core' }
      ],
      initial_state: { modules: { economy: { crystals: 20 }, supplies: { cans: 0 }, inventory: [] } },
      gameplay_ui: {
        version: 1,
        panels: [{ id: 'shop', label: '交易', sections: [{
          type: 'actions',
          items: [
            { label: '購買罐頭', effect: {
              changes: [
                { path: 'modules.economy.crystals', delta: -15 },
                { path: 'modules.supplies.cans', delta: 1 }
              ],
              items: [{ path: 'modules.inventory', id: 'cans', name: '罐頭', delta: 1 }],
              event: '購買罐頭'
            } },
            { label: '向店員詢價', draft: '請問這裡的罐頭多少錢？' }
          ]
        }] }]
      }
    });
    App.config = {
      narrativeMode: 'world',
      displayMode: 'ui',
      persona: { name: '測試玩家', gender: '未指定' },
      api: { type: 'custom', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'manual', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
    BAOGameplayUI.renderPanel('shop');
  });
  const effect = page.locator('#ui-panel [data-gameplay-effect]');
  await expect(effect).toHaveCount(1);
  await page.evaluate(() => document.querySelector('#ui-panel [data-gameplay-effect]')?.click());
  let result = await page.evaluate(() => ({
    crystals: GameState.current.modules.economy.crystals,
    cans: GameState.current.modules.supplies.cans,
    backpack: GameState.current.modules.inventory[0]?.quantity,
    log: GameState.current.events.filter(x => JSON.stringify(x).includes('購買罐頭')).length,
    messages: Chat.messages.length
  }));
  expect(result).toEqual({ crystals: 5, cans: 1, backpack: 1, log: 1, messages: 0 });
  // Insufficient balance must roll back BOTH parts of a second purchase.
  await page.evaluate(() => document.querySelector('#ui-panel [data-gameplay-effect]')?.click());
  result = await page.evaluate(() => ({
    crystals: GameState.current.modules.economy.crystals,
    cans: GameState.current.modules.supplies.cans,
    backpack: GameState.current.modules.inventory[0]?.quantity,
    log: GameState.current.events.filter(x => JSON.stringify(x).includes('購買罐頭')).length
  }));
  expect(result).toEqual({ crystals: 5, cans: 1, backpack: 1, log: 1 });
  await page.evaluate(() => document.querySelector('#ui-panel [data-gameplay-draft-text]')?.click());
  await expect(page.locator('#user-input')).toHaveValue('請問這裡的罐頭多少錢？');
});

test('atomic one-time gift claim drafts the selected route only after success', async ({ page }) => {
  await ready(page);
  await page.waitForFunction(() => Boolean(window.BAOWorldModules));
  await page.evaluate(() => {
    const voucher = { path: 'modules.gift_registry', id: 'starter_token', delta: -1 };
    const gift = (id, name) => ({
      label: '領取｜' + name,
      effect: {
        items: [voucher, { path: 'modules.gift_registry', id, name, delta: 1 }],
        event: '領取了' + name
      },
      draft: '我已領取「' + name + '」，請核對紀錄並帶我入界。'
    });
    App.activeCharacter = CharacterEngine.normalize({
      id: 'once-gift-claim-test', name: '禮包唯一領取測試',
      system_prompt: 'test', greeting: 'welcome',
      world_modules: [{ id: 'gift_registry', kind: 'collection', context: 'core' }],
      initial_state: { modules: { gift_registry: [
        { id: 'starter_token', name: '開局憑證', quantity: 1 }
      ] } },
      gameplay_ui: { version: 1, theme: { density: 'compact' },
        panels: [{ id: 'gift', label: '命書', sections: [{
          type: 'actions', title: '唯一禮包',
          items: [gift('pure_yang', '純陽聖體'), gift('ability_seed', '異能種子')]
        }] }]
      }
    });
    App.config = {
      narrativeMode: 'world', displayMode: 'ui',
      persona: { name: '測試玩家', gender: '未指定' },
      api: { type: 'custom', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'manual', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
    BAOGameplayUI.renderPanel('gift');
  });
  const button = page.locator('#ui-panel [data-gameplay-effect]');
  await expect(button).toHaveCount(2);
  await expect(page.locator('#game-ui')).toHaveAttribute('data-gameplay-density', 'compact');
  await page.evaluate(() => document.querySelectorAll('#ui-panel [data-gameplay-effect]')[0]?.click());
  const first = await page.evaluate(() => ({
    inventory: GameState.current.modules.gift_registry.map(x => [x.id, x.quantity]),
    draft: document.getElementById('user-input')?.value || '',
    sent: Chat.messages.length
  }));
  expect(first.inventory).toEqual([['starter_token', 0], ['pure_yang', 1]]);
  expect(first.draft).toContain('純陽聖體');
  expect(first.sent).toBe(0);
  await page.evaluate(() => document.querySelectorAll('#ui-panel [data-gameplay-effect]')[1]?.click());
  const second = await page.evaluate(() => ({
    inventory: GameState.current.modules.gift_registry.map(x => [x.id, x.quantity]),
    draft: document.getElementById('user-input')?.value || '',
    sent: Chat.messages.length
  }));
  expect(second).toEqual(first);
});

test('internal NPC world module remains tracked but hidden from player UI', async ({ page }) => {
  await ready(page);
  await page.waitForFunction(() => Boolean(window.BAOWorldModules && window.BAOWorldModuleUI && window.BAOWorldModuleManager));
  const result = await page.evaluate(() => {
    App.activeCharacter = CharacterEngine.normalize({
      id: 'hidden-npc-state-check', name: 'Hidden state', system_prompt: 'test', greeting: 'hello',
      world_modules: [
        { id: 'player', label: '玩家狀態', kind: 'object', context: 'core',
          fields: [{ key: 'hp', label: '氣血', type: 'number' }] },
        { id: 'npc_private', label: 'NPC內幕數值', visibility: 'internal', kind: 'object',
          context: 'relevant', fields: [{ key: 'records', label: '私密紀錄', type: 'text' }] }
      ],
      initial_state: { modules: { player: { hp: 100 },
        npc_private: { records: [{ id: 'npc-1', harvest_impulse: 87, secret: 'HIDDEN_SENTINEL' }] } } },
      gameplay_ui: { version: 1, panels: [{ id: 'status', label: '狀態',
        sections: [{ type: 'stats', items: [{ label: '氣血', path: 'modules.player.hp' }] }] }] }
    });
    App.config = {
      narrativeMode: 'world', displayMode: 'ui',
      persona: { name: '測試玩家', gender: '' },
      api: { type: 'custom', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'manual', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    App.renderChatShell(true);
    App.showView('chat');
    BAOWorldModuleUI.injectTabs();
    BAOGameplayUI.renderPanel('status');
    const before = document.querySelector('#ui-panel')?.textContent || '';
    App.renderUIPanel('module:npc_private');
    const after = document.querySelector('#ui-panel')?.textContent || '';
    return {
      visibility: GameState.current.moduleDefinitions.find(x => x.id === 'npc_private')?.visibility,
      impulse: GameState.current.modules.npc_private.records[0].harvest_impulse,
      tabCount: document.querySelectorAll('[data-panel="module:npc_private"]').length,
      before, after
    };
  });
  expect(result.visibility).toBe('internal');
  expect(result.impulse).toBe(87);
  expect(result.tabCount).toBe(0);
  expect(result.before).toBe(result.after);
  expect(result.after).not.toContain('HIDDEN_SENTINEL');
  await page.evaluate(() => BAOWorldModuleManager.open());
  await expect(page.locator('.world-manager-modal')).not.toContainText('NPC內幕數值');
  await expect(page.locator('.world-manager-modal')).not.toContainText('HIDDEN_SENTINEL');
});

test('custom builder choices keep drafts and bind actual text to initial state', async ({ page }) => {
  await ready(page);
  await page.evaluate(async () => {
    const raw = await (await fetch('data/characters/community/28/zhutian-cultivation-fortune-strife.json')).json();
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.openBuilder(); App.setStep(3);
  });
  const select = page.locator('[data-gameplay-field="origin"]');
  const custom = page.locator('[data-gameplay-custom="origin"]');
  await expect(custom).toBeHidden();
  await select.selectOption('其他／自訂');
  await expect(custom).toBeVisible();
  await custom.fill('星海旅人');
  await select.selectOption('散修');
  await expect(custom).toBeHidden();
  await select.selectOption('其他／自訂');
  await expect(custom).toHaveValue('星海旅人');
  await page.evaluate(() => { App.openBuilder(); App.setStep(3); });
  await expect(custom).toHaveValue('星海旅人');
  const result = await page.evaluate(() => {
    const config = App.collectConfig();
    const state = GameState.create(App.activeCharacter, config);
    return { saved: config.gameplaySetup.origin, state: state.modules.player.origin };
  });
  expect(result).toEqual({ saved: '星海旅人', state: '星海旅人' });
});

test('signed-cost survivor choices validate, keep drafts and initialize the selected world', async ({page}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({width:390,height:844});
  await ready(page);
  await page.evaluate(async()=>{
    App.activeCharacter=CharacterEngine.normalize(await (await fetch('/data/characters/community/ca/lastlight-survivors.json')).json());
    App.openBuilder();App.setStep(3);
  });
  const box=page.locator('#bao-gameplay-builder');
  await expect(box.locator('[data-gameplay-choice]')).toHaveCount(62);
  await expect(box.locator('.gameplay-points')).toHaveText('剩餘 8 / 8');
  await box.locator('[data-gameplay-field="name"]').fill('測試倖存者');
  await box.locator('[data-gameplay-choice="advantages"][value="strong"]').check();
  await expect(box.locator('.gameplay-points')).toHaveText('剩餘 5 / 8');
  await box.locator('[data-gameplay-choice="drawbacks"][value="weak"]').check();
  await expect(box.locator('[role="status"]')).toContainText('互斥');
  await page.evaluate(()=>App.startStory());
  await expect(box).toBeVisible();
  expect(await page.evaluate(()=>GameState.current?.characterId||'')).not.toBe('lastlight-survivors');
  await box.locator('[data-gameplay-choice="drawbacks"][value="weak"]').uncheck();
  await box.locator('[data-gameplay-choice="advantages"][value="lucky"]').check();
  await box.locator('[data-gameplay-choice="occupation"][value="soldier"]').check();
  await expect(box.locator('[role="status"]')).toContainText('超支 6');
  await box.locator('[data-gameplay-field="world"]').selectOption('荒野求生');
  await expect(box.locator('[role="status"]')).toContainText('不適用目前背景');
  await box.locator('[data-gameplay-randomize]').click();
  await expect(box.locator('[data-gameplay-field="name"]')).toHaveValue('測試倖存者');
  await expect(box.locator('[role="status"]')).toHaveText('');
  // Single-select jobs replace the previous selection instead of accumulating.
  await box.locator('[data-gameplay-field="world"]').selectOption('科幻太空');
  await box.locator('[data-gameplay-choice="occupation"][value="unemployed"]').check();
  for(const group of ['advantages','drawbacks']) {
    const ids=await box.locator(`[data-gameplay-choice="${group}"]:checked`).evaluateAll(nodes=>nodes.map(n=>n.value));
    for(const id of ids) await box.locator(`[data-gameplay-choice="${group}"][value="${id}"]`).uncheck();
  }
  await box.locator('[data-gameplay-choice="advantages"][value="strong"]').check();
  await box.locator('[data-gameplay-choice="occupation"][value="medic"]').check();
  await expect(box.locator('[data-gameplay-choice="occupation"]:checked')).toHaveCount(1);
  const result=await page.evaluate(()=>{
    const config=App.collectConfig();config.displayMode='ui';App.config=config;
    const state=GameState.create(App.activeCharacter,config);
    App.renderChatShell(true);App.showView('chat');BAOGameplayUI.renderPanel('survival');
    return {state, greeting:App.activeCharacter.greeting};
  });
  expect(result.state.location).toBe('殖民站C-7維修艙');
  expect(result.state.modules.vitals.health).toBe(120);
  expect(result.state.modules.player.name).toBe('測試倖存者');
  expect(result.state.modules.player.points).toBe(2);
  expect(result.greeting).toContain('備用供電還能維持六小時');
  await expect(page.locator('#ui-panel')).toContainText('健康');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
