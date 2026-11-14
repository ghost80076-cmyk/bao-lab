const { test, expect } = require('@playwright/test');

async function story(page, rounds = 5, phone = false) {
  await page.evaluate(({rounds, phone}) => {
    App.activeCharacter = CharacterEngine.normalize({
      id:'reading-performance', name:'閱讀效能', greeting:'燈光下的街道。', system_prompt:'故事',
      supported_modes:{immersive:true,world:true},
      phone_ui:phone ? {enabled:true,storyTime:'23:17',storyDate:'週六',apps:['notes'],notes:[{id:'memo',title:'港口',text:'今晚見面。'}]} : undefined
    });
    App.config = {persona:{name:'玩家'},narrativeMode:'immersive',displayMode:'text',
      api:{type:'custom',model:'mock',key:'',baseUrl:'https://example.invalid'},
      memory:{mode:'rounds',maxRounds:20,maxContext:32000,cache:false}};
    GameState.create(App.activeCharacter,App.config); Chat.reset();
    for(let i=0;i<rounds;i++){Chat.add('user','我繼續閱讀。');Chat.add('assistant','夜色裡的故事，燈光下的街道。'.repeat(12));}
    App.renderChatShell(false); App.showView('chat');
  }, {rounds,phone});
}
async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => window.BAOChatExperience && window.BAOSceneRenderIntegrity && window.BAOPhoneUI && window.BAOStorySurface && window.BAOExtensionLoadHealth?.snapshot().story === 'ready');
}
async function observe(page, selector) {
  await page.evaluate(selector => {
    window.__readingMutations = 0;
    window.__readingObserver?.disconnect();
    window.__readingObserver = new MutationObserver(records => {window.__readingMutations += records.length;});
    window.__readingObserver.observe(document.querySelector(selector),{childList:true,subtree:true});
  },selector);
}
for(const width of [390,1280]) {
  test(`idle reader settles after short, long and switched stories at ${width}px`, async ({page}) => {
    test.setTimeout(60000);
    await page.setViewportSize({width,height:844}); await ready(page);
    for(const rounds of [5,100,5]) {
      await story(page,rounds);
      await page.waitForTimeout(800);
      const before = await page.evaluate(() => JSON.stringify({state:GameState.current,messages:Chat.messages,summary:Chat.summary,config:App.config}));
      await observe(page,'#chat-view'); await page.waitForTimeout(1000);
      expect(await page.evaluate(() => __readingMutations), 'idle reader must not feed its own DOM observer every frame').toBeLessThan(10);
      const after = await page.evaluate(() => JSON.stringify({state:GameState.current,messages:Chat.messages,summary:Chat.summary,config:App.config}));
      expect(after).toBe(before);
    }
    await page.locator('#user-input').fill('保留這段草稿');
    await page.locator('#bao-play-status-toggle').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#user-input')).toHaveValue('保留這段草稿');
  });
}

test('status visibility updates once and stays quiet without losing authored content', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await ready(page);await story(page);
  await page.evaluate(()=>{BAOSceneHTML.prefs.status='hidden';BAOChatExperience.sync();});
  await expect(page.locator('.bao-status-empty')).toHaveText('你已在「顯示方式」中隱藏狀態欄。');
  await page.waitForTimeout(500);await observe(page,'#chat-view');await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>__readingMutations)).toBeLessThan(10);
  await page.evaluate(()=>{BAOSceneHTML.prefs.status='native';BAOSceneHTML.refresh();BAOChatExperience.sync();});
  await expect(page.locator('.bao-status-empty')).toHaveText('目前沒有可顯示的世界狀態。');
  await page.waitForTimeout(500);await observe(page,'#chat-view');await page.waitForTimeout(1000);
  expect(await page.evaluate(()=>__readingMutations)).toBeLessThan(10);
});

test('Phone fixed clock avoids recurring writes and closes on story switch', async ({page}) => {
  await page.setViewportSize({width:390,height:844});await ready(page);await story(page,5,true);
  await page.locator('#bao-phone-launch').click();
  await expect(page.locator('.bp-lock-clock')).toHaveText('23:17');
  await observe(page,'#bao-phone-stage');await page.waitForTimeout(2200);
  expect(await page.evaluate(()=>__readingMutations), 'unchanged clock should not replace text nodes every second').toBe(0);
  await page.keyboard.press('Escape');await expect(page.locator('#bao-phone-stage')).toHaveCount(0);
  await page.locator('#bao-phone-launch').click();await story(page,5,false);
  await expect(page.locator('#bao-phone-stage')).toHaveCount(0);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  await expect(page.locator('body > .app-shell')).not.toHaveAttribute('inert','');
});


test('Phone clock pauses its presentation work while hidden and catches up when visible', async ({page}) => {
  await ready(page);await story(page,5,true);await page.locator('#bao-phone-launch').click();
  // Deterministic visibility lifecycle injection, not a physical background test.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));GameState.current.phoneUI={storyTime:'23:18'};BAOPhoneUI.refreshFromState();});
  await page.waitForTimeout(1200);
  await expect(page.locator('.bp-lock-clock')).toBeEmpty();
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect(page.locator('.bp-lock-clock')).toHaveText('23:18');
  await page.keyboard.press('Escape');
});
