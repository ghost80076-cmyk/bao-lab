const { test, expect } = require('@playwright/test');

async function init(page, mode) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorInline && window.BAOGameplayUI && App.characters?.some(c => c.id === 'unread-afterglow-seoul')));
  await page.evaluate(async displayMode => {
    localStorage.removeItem('bao-lab:author-regex:v1:' + encodeURIComponent('unread-afterglow-seoul'));
    const character = await App.loadCharacter('unread-afterglow-seoul');
    if (!character) throw new Error('card did not load');
    App.activeCharacter = character;
    App.config = {
      narrativeMode: 'world', displayMode,
      persona: { name: '測試玩家', gender: '', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset();
    GameState.create(character, App.config);
    Chat.add('assistant', '【週六 00:17｜住處】\n雨還在下。\n\nKKT｜00:17\n姜允載：還沒睡？\n\nInstagram Story｜00:18\n姜允載看過你的 Story。\n\n手機重新暗下去。');
    App.renderChatShell(true);
    App.showView('chat');
  }, mode);
}

test('desktop builder writes genuine setup and visible UI never renders backstage facts', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOGameplayUI && App.characters?.some(c => c.id === 'unread-afterglow-seoul')));
  await page.evaluate(async () => {
    App.activeCharacter = await App.loadCharacter('unread-afterglow-seoul');
    App.openBuilder();
    App.setStep(3);
  });
  const builder = page.locator('#bao-gameplay-builder');
  await expect(builder).toBeVisible();
  await builder.locator('[data-gameplay-field="entry_scene"]').selectOption('朋友生日聚會');
  await builder.locator('[data-gameplay-field="starting_distance"]').selectOption('已經曖昧一陣子');
  const snapshot = await page.evaluate(() => {
    const state = structuredClone(App.activeCharacter.initial_state);
    const fields = {};
    for (const el of document.querySelectorAll('#bao-gameplay-builder [data-gameplay-field]')) {
      fields[el.getAttribute('data-gameplay-field')] = el.value;
    }
    BAOGameplayUICore.applyBuilderValues(App.activeCharacter.gameplay_ui, fields, state);
    return state.modules.session_setup;
  });
  expect(snapshot.entry_scene).toBe('朋友生日聚會');
  expect(snapshot.starting_distance).toBe('已經曖昧一陣子');

  await init(page, 'ui');
  await page.evaluate(() => BAOGameplayUI.renderPanel('signals'));
  const panel = page.locator('#ui-panel');
  await expect(panel).toContainText('訊號證據簿');
  await expect(panel).toContainText('兩人關係未確認');
  await expect(panel).not.toContainText('目前不是正式戀人');
});

test('mobile notifications render safely and text fallback remains accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await init(page, 'text');
  const host = page.locator('#chat-stream .bao-author-inline');
  await expect(host).toHaveCount(1);
  const frame = page.frameLocator('iframe[title="聊天內作者隔離介面"]');
  await expect(frame.locator('.yb-afterglow-notice')).toHaveCount(2);
  await expect(frame.locator('body')).toContainText('姜允載：還沒睡？');
  await expect(frame.locator('body')).toContainText('姜允載看過你的 Story');
  await expect(frame.locator('body')).toContainText('手機重新暗下去');
  await expect(frame.locator('body')).not.toContainText('【YB:');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:' + encodeURIComponent('unread-afterglow-seoul'))));
  expect(stored?.enabled).toBe(true);
  expect(stored?.allowScripts).toBe(false);
  expect(stored?.rules?.length).toBe(2);
  await host.getByRole('button', { name: '查看原文' }).click();
  await expect(page.locator('#chat-stream .message.assistant').last().locator(':scope > .bubble')).toContainText('KKT｜00:17');
  await expect(page.locator('#user-input')).toBeVisible();
});
