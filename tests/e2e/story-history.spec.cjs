const { test, expect } = require('@playwright/test');

async function openControlCenter(page, width) {
  if (width <= 820) {
    await page.locator('#bao-mobile-composer-tools').click();
    const quick = page.locator('#bao-chat-tool-drawer .bao-control-sections');
    await quick.getByRole('button', { name:'目前設定', exact:true }).click();
  } else {
    await page.getByRole('button', { name:'開啟控制中心', exact:true }).click();
  }
  return page.getByRole('dialog', { name:'故事總覽' });
}

for (const width of [390, 1280]) test(`story history collects public events and preserves branch snapshots at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOStoryHistory && window.BAOStoryControlCenter && window.BAOStoryBackup && window.BAOStoryRevisionState && App.characters?.length);
  await page.evaluate(async () => {
    App.activeCharacter = { ...App.characters[0], initial_state: { events: ['雨夜來客'] }, world_modules: [] };
    App.config = { narrativeMode: 'world', displayMode: 'ui', persona: { name: '旅人', gender: '未指定', identity: '', relationship: '', personality: '', extra: '' }, api: {}, memory: { mode: 'smart', maxRounds: 20 } };
    GameState.create(App.activeCharacter, App.config);
    GameState.current.private_facts = 'DO-NOT-SHOW-SECRET';
    Chat.reset();
    Chat.add('user', '到港口'); Chat.add('assistant', '你抵達港口。');
    GameState.applyUpdate({ time: '深夜', location: '港口', events: ['抵達港口 <img src=x onerror=alert(1)>'] });
    App.renderChatShell(false); App.showView('chat'); App.saveStory(false);
    await BAOStoryLibrary.flush();
  });
  const control = await openControlCenter(page, width);
  await control.getByRole('button', { name: '◇ 故事歷程與收藏', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '故事歷程', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('抵達港口 <img');
  await expect(dialog).not.toContainText('DO-NOT-SHOW-SECRET');
  await expect(dialog.locator('img')).toHaveCount(0);
  await dialog.getByRole('button', { name: '☆ 收藏', exact: true }).first().click();
  await dialog.getByLabel('只看收藏').check();
  await expect(dialog.locator('article')).toHaveCount(1);
  await dialog.getByRole('searchbox').fill('不存在');
  await expect(dialog).toContainText('沒有符合條件');
  await dialog.getByRole('searchbox').fill('港口');
  await expect(dialog.locator('article')).toHaveCount(1);
  for (const theme of ['night', 'mist', 'rose']) {
    await page.evaluate(value => document.documentElement.dataset.yoruTheme = value, theme);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  await dialog.getByRole('button', { name: '關閉故事歷程' }).click();
  const result = await page.evaluate(async () => {
    App.saveStory(false); await BAOStoryLibrary.flush();
    const baseId = Chat.messages.find(item => item.role === 'assistant').id;
    const main = BAOStoryLibrary.refs();
    Chat.add('user', '主線前進'); Chat.add('assistant', '主線獨有事件');
    GameState.addEvent('主線獨有事件'); App.saveStory(false); await BAOStoryLibrary.flush();
    const branch = await BAOStoryLibrary.createBranch(baseId, '收藏支線');
    Storage.restoreStory(branch);
    const inherited = BAOStoryHistoryCore.read(GameState.current);
    GameState.addEvent('支線獨有事件'); App.saveStory(false); await BAOStoryLibrary.flush();
    const branchRefs = BAOStoryLibrary.refs();
    const restoredMain = await BAOStoryLibrary.reconstruct(main.storyId, main.chapterId);
    const restoredBranch = await BAOStoryLibrary.reconstruct(branchRefs.storyId, branchRefs.chapterId);
    const bundle = await BAOStoryBackup.buildBundle(branchRefs.storyId);
    const imported = await BAOStoryBackup.importBundle(JSON.parse(JSON.stringify(bundle)));
    Storage.restoreStory(imported.payload);
    return { inherited, main: restoredMain.state.storyHistory, branch: BAOStoryHistoryCore.read(GameState.current) };
  });
  expect(result.inherited.entries.some(item => item.starred && item.text.includes('抵達港口'))).toBe(true);
  expect(result.inherited.entries.some(item => item.text === '主線獨有事件')).toBe(false);
  expect(result.main.entries.some(item => item.text === '主線獨有事件')).toBe(true);
  expect(result.main.entries.some(item => item.text === '支線獨有事件')).toBe(false);
  expect(result.branch.entries.some(item => item.text === '支線獨有事件')).toBe(true);
  expect(result.branch.entries.some(item => item.starred)).toBe(true);
});

for (const [file, expected, moduleId] of [
  ['c4/kept-in-frame-lin-youzhen.json', '雨夜的匿名委託', 'recent_events'],
  ['c4/lin-qiaorou-always-nearby.json', '林巧柔帶早餐', 'event_log']
]) test(`native public event collection appears in story history: ${moduleId} ${file}`, async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.BAOStoryHistory && window.BAOWorldModules && window.BAOStoryIntegrity && window.BAOStoryRevisionState && App.characters?.length);
  await page.evaluate(async ({file, moduleId}) => {
    const response = await fetch('data/characters/community/' + file);
    App.activeCharacter = CharacterEngine.normalize(await response.json());
    App.config = {narrativeMode:'world', displayMode:'ui', persona:{name:'旅人'}, api:{}, memory:{mode:'smart',maxRounds:20}};
    Chat.reset();
    GameState.create(App.activeCharacter, App.config);
    GameState.applyUpdate({modules:{[moduleId]:['本輪公開新事件']}});
    App.renderChatShell(false); App.showView('chat');
    BAOStoryHistory.open();
  }, {file, moduleId});
  const dialog = page.getByRole('dialog', {name:'故事歷程',exact:true});
  await expect(dialog).toContainText(expected);
  await expect(dialog).toContainText('本輪公開新事件');
  await dialog.getByRole('searchbox').fill(expected);
  await expect(dialog.locator('article')).toHaveCount(1);
  await dialog.getByRole('button', {name:'☆ 收藏',exact:true}).click();
  await expect(dialog.getByRole('button', {name:'★ 已收藏',exact:true})).toHaveAttribute('aria-pressed','true');
});