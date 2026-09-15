const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });
const openMemory = async page => {
  await page.goto('./');
  await page.waitForFunction(() => window.BAOMemoryPreferences && window.BAOStoryBranches && App.characters.length && document.getElementById('helper-routing-box'));
  await page.evaluate(() => { App.openCharacter(App.characters[0].id); App.openBuilder(); App.setStep(5); });
  await expect(page.locator('#helper-routing-box')).toBeHidden();
};
for (const width of [390, 1440]) {
  test(`memory preferences and no-API story at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await openMemory(page);
    await expect(page.locator('#memory-mode-label')).toHaveText('智慧整理');
    await expect(page.locator('[name="memory-strength"][value="balanced"]')).toBeChecked();
    await page.locator('[name="memory-strength"][value="economy"]').check();
    expect(await page.evaluate(() => App.collectConfig().memory.maxRounds)).toBe(12);
    await page.locator('[name="memory-strength"][value="long"]').check();
    expect(await page.evaluate(() => App.collectConfig().memory.maxRounds)).toBe(40);
    await page.locator('[name="memory-strength"][value="custom"]').check();
    await expect(page.locator('#helper-routing-box')).toBeVisible();
    await page.locator('#max-rounds').fill('27');
    await page.locator('#max-rounds').dispatchEvent('change');
    await page.locator('#summary-interval').fill('7');
    expect(await page.evaluate(() => App.collectConfig().memory.summaryInterval)).toBe(7);
    expect(await page.evaluate(() => App.collectConfig().memory.maxRounds)).toBe(27);
    await page.locator('#memory-advanced > summary').click();
    await page.screenshot({ path: testInfo.outputPath(`memory-${width}.png`), fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.evaluate(() => { document.getElementById('bao-demo-mode').checked = true; App.startStory(); });
    await page.locator('#user-input').fill('檢查本機故事');
    await page.locator('[data-send-message]').click();
    await expect(page.locator('#chat-stream > .message.assistant').last()).toBeVisible();
    await page.evaluate(() => { BAOMemoryWorkbench.writeSlots([{ id: 'new-note', title: '最新筆記', enabled: true, text: '獨有筆記已更新' }]); });
    expect(await page.evaluate(() => App.buildSystemPrompt())).toContain('獨有筆記已更新');
    expect(await page.evaluate(() => JSON.stringify(Storage.buildStoryPayload('test')))).not.toContain('test-only-key');
  });
}
test('main completes before interval state and memory helpers', async ({ page }) => {
  await openMemory(page);
  const requests = [];
  await page.route('**/phase1-mock', async route => {
    const body = route.request().postDataJSON();
    const sys = body.messages[0].content;
    const kind = sys.includes('只進行狀態追蹤') ? 'state' : sys.includes('Observer') ? 'memory' : 'main';
    requests.push({ kind, body });
    const content = kind === 'state' ? '{"location":"測試市場","nextScene":"drop"}' : kind === 'memory' ? '{"events":["已進入市場"],"nextScene":"drop"}' : '角色抵達市場，等待玩家回應。';
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 500, completion_tokens: 30, total_tokens: 530 } }) });
  });
  await page.evaluate(() => {
    App.config = App.collectConfig();
    App.config.demoMode = false;
    App.config.displayMode = 'ui';
    App.config.api = { type: 'custom', protocol: 'openai', model: 'test', key: 'test-only-key', baseUrl: new URL('phase1-mock', location.href).href };
    App.config.memory = { mode: 'smart', maxRounds: 4, summaryInterval: 4 };
    App.config.cost = { stateInterval: 2 };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    for (let i = 0; i < 6; i++) { Chat.add('user', `舊玩家${i}`); Chat.add('assistant', `舊角色${i}`); }
    App.renderChatShell(false); App.showView('chat');
  });
  for (let i = 0; i < 2; i++) {
    await page.locator('#user-input').fill(`去市場${i}`);
    await page.locator('[data-send-message]').click();
    await expect(page.locator('[data-send-message]')).toBeEnabled();
  }
  expect(requests.map(r => r.kind)).toEqual(['main', 'main', 'state', 'memory']);
  expect(JSON.stringify(requests.find(r => r.kind === 'state').body)).not.toContain('舊玩家0');
  expect(JSON.stringify(requests.find(r => r.kind === 'memory').body)).not.toContain('去市場1');
  expect(await page.evaluate(() => Chat.summary)).toContain('已進入市場');
  expect(await page.evaluate(() => JSON.stringify(Storage.buildStoryPayload('test')))).not.toContain('test-only-key');
});
