const { test, expect } = require('@playwright/test');

test('mobile complete-history memory rescue remains a preview until explicit apply', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOFullStoryMemoryRebuild && window.BAOMemoryWorkbench &&
    window.BAOFullMemoryRebuildCore && window.Storage?.status?.().ready && App.characters?.length);
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], name:'完整記憶回歸', greeting:'故事開始', world_modules:[] };
    App.config = { persona:{name:'玩家'}, narrativeMode:'world', displayMode:'ui', stateTracking:true,
      api:{ model:'mock-story-memory', baseUrl:'https://example.invalid/v1', protocol:'openai', key:'mock-key' },
      memory:{ mode:'smart', maxRounds:20, maxContext:64000, summaryApiMode:'same' } };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    for (let i=0;i<60;i++) {
      Chat.add('user','第'+(i+1)+'輪玩家對話');
      Chat.add('assistant','第'+(i+1)+'輪角色做出行動');
    }
    Chat.summary='舊的錯誤摘要';
    Chat.summarizedUntil=30;
    GameState.current.memory=['舊的錯誤摘要'];
    GameState.current.location='原位置';
    window.__memoryCalls=0;
    API.send = async (config, messages) => {
      if (!config.__memoryTask) throw new Error('Unexpected main-story request');
      window.__memoryCalls++;
      const text=messages[1].content;
      if (text.includes('【原始對話】')) {
        const n=Number(text.match(/必須完整檢查 (\d+) 輪/)[1]);
        const id=text.match(/\[(msg-[^\]]+)\]/)?.[1];
        if (!id) throw new Error('Source message ID missing in simulated extraction');
        return { text:JSON.stringify({reviewedRounds:n,events:['經核對的歷史事件'],knownFacts:[],
          relationships:[],openThreads:[],evidence:[{text:'已發生的故事',messageIds:[id],certainty:'confirmed',knownBy:[]}],stateEvidence:[]}),finishReason:'STOP' };
      }
      return {text:JSON.stringify({events:['重建後的正式事件'],knownFacts:[],relationships:[],openThreads:[]}),finishReason:'STOP'};
    };
    App.renderChatShell(false); App.showView('chat'); BAOMemoryWorkbench.open();
  });
  const dialog=page.getByRole('dialog',{name:'記憶工作台'});
  const area=dialog.locator('[data-full-memory-rebuild]');
  await expect(area.locator('[data-full-run]')).toBeVisible();
  await expect(area.locator('[data-full-apply]')).toBeDisabled();
  const old=await page.evaluate(()=>({summary:Chat.summary,until:Chat.summarizedUntil,messages:JSON.stringify(Chat.messages)}));
  page.once('dialog', d=>d.accept());
  await area.locator('[data-full-run]').click();
  await expect(area.locator('[data-full-apply]')).toBeEnabled();
  expect(await page.evaluate(()=>Chat.summary)).toBe(old.summary);
  expect(await page.evaluate(()=>Chat.summarizedUntil)).toBe(old.until);
  expect(await page.evaluate(()=>JSON.stringify(Chat.messages))).toBe(old.messages);
  expect(await page.evaluate(()=>GameState.current.location)).toBe('原位置');
  await expect(area).toContainText('候選摘要已完成');
  await expect(area).toContainText('重建後的正式事件');
  page.once('dialog',d=>d.accept());
  await area.locator('[data-full-apply]').click();
  await expect(area).toContainText('已套用新摘要');
  expect(await page.evaluate(()=>Chat.summarizedUntil)).toBe(80);
  expect(await page.evaluate(()=>Chat.summary)).toContain('重建後的正式事件');
  expect(await page.evaluate(()=>GameState.current.location)).toBe('原位置');
  const widths=await area.evaluate(el=>({scroll:el.scrollWidth,client:el.clientWidth}));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client+1);
});

test('independent rescue continuation retains original story and reuses verified summary', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOFullStoryMemoryRebuild && window.BAOMemoryWorkbench &&
    window.BAOStoryLibrary && window.Storage?.status?.().ready && App.characters?.length);
  await page.evaluate(async () => {
    App.activeCharacter = { ...App.characters[0], name:'救援測試', greeting:'原始開場', world_modules:[] };
    App.config = { persona:{name:'玩家'}, narrativeMode:'world', displayMode:'ui',
      api:{model:'mock-story-memory',baseUrl:'https://example.invalid/v1',protocol:'openai',key:'mock-key'},
      memory:{mode:'smart',maxRounds:20,maxContext:64000,summaryApiMode:'same'} };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    for (let i=0;i<30;i++) { Chat.add('user','第'+(i+1)+'輪玩家'); Chat.add('assistant','第'+(i+1)+'輪故事'); }
    Chat.summary = '舊摘要'; Chat.summarizedUntil = 10;
    GameState.current.memory = ['舊摘要'];
    GameState.current.location = '舊場景';
    GameState.current.money = 123;
    API.send = async (_config, messages) => {
      const prompt = messages[1].content;
      if (prompt.includes('【原始對話】')) {
        const n = Number(prompt.match(/必須完整檢查 (\d+) 輪/)[1]);
        const id = prompt.match(/\[(msg-[^\]]+)\]/)?.[1];
        return {text: JSON.stringify({reviewedRounds:n,events:['經核對的事件'],knownFacts:[],
          relationships:[],openThreads:[],evidence:[{text:'事件',messageIds:[id],certainty:'confirmed',knownBy:[]}],
          stateEvidence:[]}),finishReason:'STOP'};
      }
      return {text:JSON.stringify({events:['可續玩的新摘要'],knownFacts:[],relationships:[],openThreads:[]}),finishReason:'STOP'};
    };
    App.saveStory(false);
    await Storage.flush(); await BAOStoryLibrary.flush();
    window.__rescueSourceRefs = {...BAOStoryLibrary.refs()};
    App.renderChatShell(false); App.showView('chat'); BAOMemoryWorkbench.open();
  });
  const area=page.getByRole('dialog',{name:'記憶工作台'}).locator('[data-full-memory-rebuild]');
  await expect(area.locator('[data-full-continue]')).toBeDisabled();
  page.on('dialog', dialog => dialog.accept());
  for (let attempt=0; attempt<6; attempt++) {
    // The click starts a paid-model-style async job. Wait for its UI rerender
    // before clicking again; the previous loop raced a deliberately disabled
    // button while checkpoint writes were still in progress.
    await expect.poll(async () =>
      (await area.locator('[data-full-continue]').isEnabled()) ||
      (await area.locator('[data-full-run]').isEnabled()),
      { timeout: 20000, message: '重建未完成或未重新啟用操作按鈕' }
    ).toBe(true);
    if (await area.locator('[data-full-continue]').isEnabled()) break;
    await area.locator('[data-full-run]').click();
    await expect.poll(() => page.evaluate(() => !BAOStoryMaintenanceLock.has(GameState.current)), {
      timeout: 20000, message: '重建要求尚未結束'
    }).toBe(true);
  }
  await expect(area.locator('[data-full-continue]')).toBeEnabled();
  await area.locator('[data-full-continue]').click();
  await expect.poll(async () => page.evaluate(() => BAOStoryLibrary.refs().storyId))
    .not.toBe(await page.evaluate(() => window.__rescueSourceRefs.storyId));
  const checked=await page.evaluate(async () => {
    const source=await BAOStoryLibrary.reconstruct(__rescueSourceRefs.storyId,__rescueSourceRefs.chapterId);
    const current=Storage.buildStoryPayload('copy');
    const records=await BAOStoryLibrary.listStories();
    return {
      sourceSummary:source.chat.summary,sourceUntil:source.chat.summarizedUntil,
      sourceMessageCount:source.chat.messages.length,
      sourceLocation:source.state.location,sourceMoney:source.state.money,
      copySummary:current.chat.summary,copyUntil:current.chat.summarizedUntil,
      copyMessageCount:current.chat.messages.length,copyMoney:current.state.money,
      copyMode:App.config.memory.mode,storyCount:records.length
    };
  });
  expect(checked.sourceSummary).toBe('舊摘要');
  expect(checked.sourceUntil).toBe(10);
  expect(checked.sourceMessageCount).toBe(60);
  expect(checked.sourceLocation).toBe('舊場景');
  expect(checked.sourceMoney).toBe(123);
  expect(checked.copySummary).toContain('經核對的事件');
  expect(checked.copyUntil).toBe(20);
  expect(checked.copyMessageCount).toBe(60);
  expect(checked.copyMoney).toBe(123);
  expect(checked.copyMode).toBe('smart');
  expect(checked.storyCount).toBeGreaterThanOrEqual(2);
});
