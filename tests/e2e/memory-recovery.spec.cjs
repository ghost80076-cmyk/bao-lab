const { test, expect } = require('@playwright/test');
for (const width of [390, 1280]) {
  test(`existing story retries automatic memory and saves coverage (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOMemoryWorkbenchSimple && App.characters?.length);
    await page.evaluate(() => {
      App.activeCharacter = { ...App.characters[0] };
      App.config = { api: { key: 'mock', model: 'mock' }, memory: { mode: 'smart', maxRounds: 20 } };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      for (let i=0;i<91;i++) { Chat.add('user', `行動${i}`); Chat.add('assistant', `已完成結果${i}`); }
      Chat.memoryHealth = { phase:'failed', message:'記憶輸出已截斷' };
      window.recoverySaves = [];
      App.saveStory = async () => { recoverySaves.push(Chat.summarizedUntil); };
      API.send = async () => ({ text: JSON.stringify({ events:['已確認的劇情結果'] }), finishReason:'STOP' });
      BAOMemoryWorkbench.open();
    });
    const retry = page.locator('[data-retry-auto-memory]');
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.locator('.memory-health-card')).toContainText('已整理');
    const result = await page.evaluate(() => ({ cursor:Chat.summarizedUntil, messages:Chat.messages.length, saves:recoverySaves, notes:BAOMemoryWorkbench.readSlots().filter(x=>x.text).length }));
    expect(result.cursor).toBe(174);
    expect(result.messages).toBe(182);
    expect(result.saves).toEqual([174]);
    expect(result.notes).toBe(0);
  });
}

for (const width of [390, 1280]) {
  async function prepare(page, mode = 'smart') {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => window.BAOMemoryWorkbenchSimple && window.BAOChatSystemNotices && App.characters?.length);
    await page.evaluate(mode => {
      App.activeCharacter = { ...App.characters[0] };
      App.config = { persona: { name:'旅人' }, narrativeMode:'immersive', displayMode:'text', api:{ key:'mock', model:'mock' }, memory:{ mode, maxRounds:20, episodicRecall:false } };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      for (let i=0;i<30;i++) { Chat.add('user', '行動'+i+'文'.repeat(1000)); Chat.add('assistant', '結果'+i+'文'.repeat(1000)); }
      BAOMemoryWorkbench.writeSlots([{id:'promise',title:'約定',text:'明天回到港口',enabled:true}]);
      App.renderChatShell(false); App.showView('chat');
      window.savedCoverage=[];
      App.saveStory=async()=>savedCoverage.push(Chat.summarizedUntil);
    }, mode);
  }

  test(`memory guide explains notes and offers an explicit automatic-memory toggle (${width}px)`, async ({ page }) => {
    await prepare(page,'rounds');
    await page.evaluate(()=>BAOMemoryWorkbench.open());
    const desk=page.locator('.memory-desk');
    await expect(desk.locator('.memory-health-card')).toContainText('自動記憶已關閉');
    await expect(desk.locator('[data-retry-auto-memory]')).toBeDisabled();
    await desk.locator('[data-memory-guide] summary').click();
    await expect(desk.locator('[data-memory-guide]')).toContainText('不會推進自動摘要進度');
    await expect(desk.locator('[data-memory-guide]')).toContainText('每次都會占用上下文');
    await desk.locator('[data-context-auto-summary]').check();
    await expect(desk.locator('[data-retry-auto-memory]')).toBeEnabled();
    expect(await page.evaluate(()=>({mode:App.config.memory.mode,cursor:Chat.summarizedUntil,notes:GameState.current.memorySlots})))
      .toEqual({mode:'smart',cursor:0,notes:[{id:'promise',title:'約定',text:'明天回到港口',enabled:true}]});
    await desk.locator('[data-tab="notes"]').click();
    await desk.locator('[data-memory-ai-helper]').click();
    await expect(desk.locator('[data-pane="refine"]')).toContainText('不會推進自動摘要進度');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });

  test(`memory error shortcut retries with visible batch progress and preserves paid coverage on failure (${width}px)`, async ({ page }) => {
    await prepare(page);
    await page.evaluate(()=>{
      window.memoryCalls=[]; window.releaseMemory=[];
      API.send=async(config)=>{
        memoryCalls.push({memory:config.__memoryTask});
        return new Promise((resolve,reject)=>releaseMemory.push({resolve,reject}));
      };
      const feedback=document.getElementById('bao-chat-send-feedback');
      feedback.textContent='本次送出內容仍過大，摘要輸出已截斷。';feedback.hidden=false;
    });
    const actions=page.locator('#bao-chat-memory-actions');
    await expect(actions).toBeVisible();
    await expect(actions).toContainText('會使用目前的整理模型並產生費用');
    await actions.getByRole('button',{name:'重試自動記憶整理',exact:true}).click();
    const desk=page.locator('.memory-desk');
    await expect(desk).toBeVisible();
    await expect(desk.locator('[data-retry-auto-memory]')).toBeDisabled();
    await expect(desk.locator('[data-auto-memory-progress]')).toContainText('已完成 0 批');
    await page.waitForFunction(()=>releaseMemory.length===1);
    await page.evaluate(()=>releaseMemory[0].resolve({text:JSON.stringify({events:['已確認的劇情結果']}),finishReason:'STOP'}));
    await page.waitForFunction(()=>releaseMemory.length===2);
    await expect(desk.locator('[data-auto-memory-progress]')).toContainText('已完成 1 批');
    await expect(page.locator('#bao-chat-memory-progress')).toContainText('已完成 1 批');
    await page.evaluate(()=>releaseMemory[1].reject(new Error('測試整理模型暫停')));
    await expect(desk.locator('.memory-health-card')).toContainText('測試整理模型暫停');
    await expect(page.locator('#bao-chat-memory-progress')).toBeHidden();
    const result=await page.evaluate(()=>({cursor:Chat.summarizedUntil,saves:savedCoverage,calls:memoryCalls,notes:GameState.current.memorySlots,messages:Chat.messages.length}));
    expect(result.cursor).toBeGreaterThan(0);
    expect(result.saves).toEqual([result.cursor]);
    expect(result.calls).toEqual([{memory:true},{memory:true}]);
    expect(result.messages).toBe(60);
    expect(result.notes).toEqual([{id:'promise',title:'約定',text:'明天回到港口',enabled:true}]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
    await desk.locator('.memory-desk-close').click();
    await expect(actions.getByRole('button',{name:'重試自動記憶整理',exact:true})).toBeFocused();
  });
}
