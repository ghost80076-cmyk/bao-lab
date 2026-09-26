const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const rules = { regex_scripts: [{
  scriptName: '手機介面存檔', findRegex: '【手機開屏】',
  replaceString: `<section id="phone-ui"><span id="phone-tab">未載入</span><button id="remember" onclick="BAOAuthor.saveUIState({tab:'photos',page:2})">記住相簿</button><button id="secret" onclick="BAOAuthor.saveUIState({apiKey:'never-save'})">錯誤欄位</button><script>window.addEventListener('bao:uistatechange',function(e){document.getElementById('phone-tab').textContent=e.detail.tab||'初始頁';});</script></section>`
}] };

async function setup(page) {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && window.Storage?._ready && App.characters?.length));
  await page.evaluate(() => {
    App.openCharacter(App.characters[0].id);
    App.config = {
      narrativeMode: 'immersive', displayMode: 'text',
      persona: { name: '測試玩家', gender: '未指定', identity: '', personality: '', relationship: '', extra: '' },
      api: { type: 'custom', protocol: 'openai', model: 'offline-test', baseUrl: '', key: '' },
      memory: { mode: 'smart', maxRounds: 20, maxContext: 32000, cache: false }
    };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('assistant', '【手機開屏】');
    App.renderChatShell(false); App.showView('chat');
    window.__authorTestApiCalls = 0;
    API.send = () => { window.__authorTestApiCalls++; throw new Error('Author UI cannot call API'); };
  });
  const panel = page.locator('#bao-author-regex-panel');
  await panel.locator('summary').click();
  await panel.locator('input[type=file]').setInputFiles({ name: 'phone-regex.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(rules)) });
  await expect(panel).toContainText('已保存 1 條原始正則');
  await panel.getByLabel('在這張角色卡啟用作者介面').check();
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許作者腳本（需自行信任來源）').check();
  await panel.getByLabel('跨回合常駐作者介面（不必每輪重建）').check();
  const frame = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(frame.locator('#phone-ui')).toBeVisible();
  return { panel, frame };
}

test('UI preference is opt-in, saved in story bundle, restored across reload, never put in world state', async ({ page }) => {
  const { panel, frame } = await setup(page);
  await frame.getByRole('button', { name: '記住相簿' }).click();
  expect(await page.evaluate(() => Storage.buildStoryPayload('before').authorUi)).toBeUndefined();
  page.once('dialog', dialog => dialog.accept());
  await panel.getByLabel('允許常駐作者介面儲存少量顯示偏好到本故事').check();
  await expect(frame.locator('#phone-tab')).toHaveText('初始頁');
  await frame.getByRole('button', { name: '記住相簿' }).click();
  await expect(frame.locator('#phone-tab')).toHaveText('photos');
  await expect.poll(() => page.evaluate(() => Storage.buildStoryPayload('after').authorUi?.value?.page)).toBe(2);
  await frame.getByRole('button', { name: '錯誤欄位' }).click();
  expect(await page.evaluate(() => ({
    saved: Storage.buildStoryPayload('after').authorUi.value,
    leakedIntoWorld: Object.hasOwn(GameState.current, 'authorUi'),
    calls: window.__authorTestApiCalls
  }))).toEqual({ saved: { tab: 'photos', page: 2 }, leakedIntoWorld: false, calls: 0 });
  await page.evaluate(async () => { Storage.saveStory(); await Storage.flush(); });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.BAOAuthorDock && window.Storage?._ready && App.characters?.length));
  expect(await page.evaluate(() => {
    const saved = Storage.loadStory();
    if (!saved?.authorUi || !Storage.restoreStory(saved)) return false;
    App.renderChatShell(false); App.showView('chat');
    return true;
  })).toBe(true);
  const restored = page.frameLocator('iframe[title="跨回合作者隔離介面"]');
  await expect(restored.locator('#phone-ui')).toBeVisible();
  await expect(restored.locator('#phone-tab')).toHaveText('photos');
  expect(await page.evaluate(() => Storage.buildStoryPayload('restored').authorUi.value)).toEqual({ tab: 'photos', page: 2 });
  // A new story with the same card must not inherit another story's display preferences.
  await page.evaluate(() => { Chat.reset(); GameState.create(App.activeCharacter, App.config); Chat.add('assistant','【手機開屏】'); App.renderChatShell(false); });
  await expect(restored.locator('#phone-tab')).toHaveText('初始頁');
  expect(await page.evaluate(() => Storage.buildStoryPayload('new').authorUi)).toBeUndefined();
});
