const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const cases = [
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
    await page.waitForFunction(cardId => Boolean(
      window.BAOAuthorInline && App.characters?.some(card => card.id === cardId)
    ), id);

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
