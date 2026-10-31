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
        return { text:JSON.stringify({reviewedRounds:n,events:['經核對的歷史事件'],knownFacts:[],
          relationships:[],openThreads:[],evidence:[],stateEvidence:[]}),finishReason:'STOP' };
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
