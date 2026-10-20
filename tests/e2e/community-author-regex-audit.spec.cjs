const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const cases = [
  'dual-yandere-night-shelter',
  'lastlight-survivors',
  'zhutian-cultivation-fortune-strife',
  'dark-military-war-simulator',
  'lin-shen-reed-bloom',
  'sakura-house-experience-management',
  'xia-yuhan-av-industry',
  'weird-task-system',
  'craftsman-ming-survival-trpg',
  'aetheria-three-factions',
  'xinglan-academy',
  'medieval-guild-dynasty-simulator',
  'dual-host-system-mode',
  'elze-survival-world',
  'ktv-flight-chess',
  'taiwan-food-hunter'
];

for (const id of cases) {
  test(`official sidecar renders real greeting without raw markers: ${id}`, async ({ page }) => {
    await page.goto('./');
    await page.waitForFunction(() => Boolean(
      window.BAOAuthorInline && typeof App?.loadCharacter === 'function'
    ));

    await page.evaluate(async cardId => {
      localStorage.removeItem('bao-lab:author-regex:v1:' + encodeURIComponent(cardId));
      const character = await App.loadCharacter(cardId);
      if (!character) throw new Error(cardId + ' did not load');
      App.activeCharacter = character;
      App.config = {
        narrativeMode: 'world',
        displayMode: 'text',
        persona: { name: 'UI 健檢玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
        api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
        memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
      };
      Chat.reset();
      GameState.create(App.activeCharacter, App.config);
      App.renderChatShell(true);
      App.showView('chat');
    }, id);

    if (id === 'lastlight-survivors') {
      // Native multi-world openings keep their host-owned action buttons.
      await expect(page.locator('[data-bao-opening-choice]')).toHaveCount(4);
      await expect(page.locator('#chat-stream')).not.toContainText('【YB:');
      await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
      // The optional display Regex still works for a later marked message.
      await page.evaluate(()=>{
        Chat.add('user','查看求生紀錄');
        Chat.add('assistant','【YB:SURVIVAL:OPENING】\n求生紀錄：飲水尚未使用。\n【/YB:SURVIVAL:OPENING】');
        App.renderChatShell(false);
      });
    }
    const host = page.locator('#chat-stream .bao-author-inline');
    await expect(host).toHaveCount(1);

    const frame = page.frameLocator('iframe[title="聊天內作者隔離介面"]');
    await expect(frame.locator('body')).not.toContainText('【YB:');

    const stored = await page.evaluate(cardId => JSON.parse(
      localStorage.getItem('bao-lab:author-regex:v1:' + encodeURIComponent(cardId))
    ), id);
    expect(stored?.enabled).toBe(true);
    expect(stored?.allowScripts).toBe(false);
    expect(stored?.source).toBe('official-sidecar');
    expect(Array.isArray(stored?.rules) && stored.rules.length > 0).toBe(true);

    if (id === 'weird-task-system') {
      const details = frame.locator('details.yb-odd-reveal');
      await expect(details).toBeVisible();
      await details.locator('summary').click();
      await expect(details.locator('.yb-odd-reward')).toBeVisible();
      await expect(details.locator('.yb-odd-reward')).toContainText('獎勵：尚未確認');
    }
  });
}

for (const width of [390, 1440]) {
  test(`Dual Yandere native panels keep private actions hidden at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOGameplayUI && window.BAOAuthorInline && App.characters?.length);
    await page.evaluate(async () => {
      const character = await App.loadCharacter('dual-yandere-night-shelter');
      App.activeCharacter = character;
      App.config = {
        narrativeMode: 'world', displayMode: 'ui', persona: { name: '測試玩家' },
        memory: { mode: 'manual' }, api: { type: 'custom', key: '', model: 'offline-test' }
      };
      Chat.reset();
      GameState.create(character, App.config);
      App.renderChatShell(true);
      App.showView('chat');
      BAOGameplayUI.syncTabs();
      BAOGameplayUI.renderPanel('women');
    });
    const toggle = page.locator('#bao-play-status-toggle');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    await page.locator('#game-ui .ui-tab[data-panel="women"]').click();
    const panel = page.locator('#ui-panel');
    const archive = panel.locator('.gameplay-tabbed-archive');
    await expect(archive).toBeVisible();
    await expect(archive.locator('[data-gameplay-archive-pane="mio"]')).toContainText('問能不能再一起待一下');
    await archive.locator('[data-gameplay-archive-tab="fuyuka"]').click();
    await expect(archive.locator('[data-gameplay-archive-pane="fuyuka"]')).toBeVisible();
    await expect(archive.locator('[data-gameplay-archive-pane="fuyuka"]')).toContainText('當前狀態尚不清楚');
    expect(await archive.evaluate(el => el.scrollWidth > el.clientWidth + 2)).toBe(false);
    await expect(page.locator('#game-ui')).not.toContainText('內部狀態');
    await expect(page.locator('#game-ui')).not.toContainText('情敵衝突');

    // Visible records update through the existing state engine. Hidden memories survive separately.
    await page.evaluate(() => {
      GameState.applyUpdate({ modules: { ties: { promises: ['借傘：明晚歸還'] } } });
    });
    await page.locator('#game-ui .ui-tab[data-panel="ties"]').click();
    await expect(panel).toContainText('借傘：明晚歸還');
    const privateModules = await page.evaluate(() =>
      GameState.current.moduleDefinitions.filter(d => d.visibility === 'internal').map(d => d.id)
    );
    expect(privateModules).toEqual(expect.arrayContaining(['mio_private', 'fuyuka_private', 'rivalry_private']));
    for (const id of privateModules) {
      await expect(page.locator(`#game-ui [data-panel="module:${id}"]`)).toHaveCount(0);
    }
    await page.locator('#game-ui .ui-tab[data-panel="letters"]').click();
    await expect(panel).toContainText('我放在你門邊了');
    await expect(panel).not.toContainText('冬花尚不知道這次相遇');

    // The optional display layer renders without JavaScript, then falls back to readable story text.
    await expect(page.frameLocator('iframe[title="聊天內作者隔離介面"]').locator('body')).not.toContainText('【YB:');
    await page.evaluate(() => {
      App.config.displayMode = 'text';
      App.renderChatShell(false);
    });
    await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(1);
  });
}
