const { test, expect } = require('@playwright/test');

test('old story rebuilds from recent evidence, persists, and never edits prose', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOContextHealth && window.WorldStateEngine?.rebuild && App.characters?.length);
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], name: '重建測試', greeting: '你到了醫院。' };
    App.config = { persona: { name: '旅人' }, narrativeMode: 'world', displayMode: 'ui', api: { model: 'mock', baseUrl: 'https://example.invalid', key: 'mock' }, memory: { mode: 'smart', maxRounds: 20, maxContext: 64000 }, cost: { stateApiMode: 'same' } };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('user', '前往醫院'); Chat.add('assistant', '03:00，你已抵達醫院。');
    GameState.current.time = '02:16'; GameState.current.location = '公寓';
    window.__rebuildCalls = 0;
    API.send = async (_, messages) => {
      window.__rebuildCalls++;
      if (messages[1].content.includes('02:16')) throw new Error('stale evidence');
      return { text: JSON.stringify({ time: '03:00', location: '醫院', npcs: [], character_statuses: {} }) };
    };
    App.renderChatShell(false); App.showView('chat'); BAOContextHealth.open();
  });
  const dialog = page.getByRole('dialog', { name: '上下文狀態' });
  await expect(dialog.getByRole('button', { name: '重新整理狀態', exact: true })).toBeVisible();
  const original = await page.evaluate(() => JSON.stringify(Chat.messages));
  page.once('dialog', d => d.dismiss());
  await dialog.locator('[data-state-rebuild="recent"]').click();
  expect(await page.evaluate(() => window.__rebuildCalls)).toBe(0);
  page.once('dialog', d => d.accept());
  await dialog.locator('[data-state-rebuild="recent"]').click();
  await expect(dialog.locator('[data-state-rebuild-result]')).toHaveText('目前狀態已重新整理。');
  expect(await page.evaluate(() => GameState.current.location)).toBe('醫院');
  expect(await page.evaluate(() => JSON.stringify(Chat.messages))).toBe(original);
  expect(await page.evaluate(() => Storage.loadStory().state.location)).toBe('醫院');
  const width = await dialog.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.client + 1);
});
