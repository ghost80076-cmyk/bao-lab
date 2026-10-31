const { test, expect } = require('@playwright/test');
// Memory recovery uses local fixtures and mocked model calls only.
test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
});
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
    await expect(page.locator('.memory-diagnostics')).toContainText('模型結束原因：STOP');
    await expect(page.locator('.memory-diagnostics')).toContainText('摘要請求額度：8192 Token');
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
      GameState.current.memorySlots=[{id:'promise',title:'約定',text:'明天回到港口',enabled:true}];
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

  test(`AI notes reject truncated valid JSON through the real request pipeline (${width}px)`, async ({ page }) => {
    await prepare(page);
    let calls = 0;
    await page.route('https://memory.test/**', async route => {
      const body = route.request().postDataJSON();
      expect(body.max_tokens).toBe(4096);
      calls++;
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ events: [calls === 1 ? '已確認的約定' : '未完成的新整理'] }) },
          finish_reason: calls === 1 ? 'stop' : 'length' }]
      }) });
    });
    await page.evaluate(() => {
      App.config.api = { type:'custom', protocol:'openai', key:'mock', model:'future-model', baseUrl:'https://memory.test/chat/completions' };
      App.config.memory.summaryApiMode = 'same';
      Chat.messages.forEach(message=>message.content=message.content.slice(0,40));
      BAOMemoryWorkbench.open();
    });
    const desk = page.locator('.memory-desk');
    await desk.locator('[data-tab="notes"]').click();
    await desk.locator('[data-memory-ai-helper]').click();
    await desk.locator('[data-run-refine]').click();
    // Progress text contains 「已完成 N 批」 before the final draft is committed.
    // Do not treat that intermediate status as a completed AI-notes run.
    await expect(desk.locator('[data-refine-status]')).toContainText('完成 · 共');
    await expect(desk.locator('[data-refine-draft]')).toContainText('已確認的約定');
    await expect(desk.locator('[data-run-refine]')).toBeEnabled();
    const draft = await desk.locator('[data-refine-draft]').textContent();
    await desk.locator('[data-run-refine]').click();
    await expect(desk.locator('[data-refine-status]')).toContainText('截斷');
    await expect(desk.locator('[data-refine-draft]')).toHaveText(draft);
    expect(await page.evaluate(() => Chat.summarizedUntil)).toBe(0);
    expect(await page.evaluate(() => GameState.current.memorySlots[0].text)).toBe('明天回到港口');
    expect(calls).toBe(2);
  });

  test(`all-dialogue notes resume paid batches after reload without changing auto coverage (${width}px)`, async ({ page }) => {
    await prepare(page);
    const chunks = [];
    page.on('dialog', dialog => dialog.accept());
    await page.route('https://memory.test/**', async route => {
      const body = route.request().postDataJSON();
      expect(body.model).toBe('future-model');
      expect(body.max_tokens).toBe(2048);
      chunks.push(body.messages[1].content.split('【本批來源】\n')[1]);
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ choices: [{
        message: { content: JSON.stringify({ events: ['已確認的約定'] }) }, finish_reason: chunks.length === 2 ? 'length' : 'stop'
      }] }) });
    });
    await page.evaluate(async () => {
      App.config.api = { type:'custom', protocol:'openai', key:'test-only-key', model:'future-model', baseUrl:'https://memory.test/chat/completions',
        capabilities:{ contextWindowTokens:16000, maxOutputTokens:2048 }, memory_policy:{ inputTokens:1900 } };
      App.config.memory.summaryApiMode='same';
      App.saveStory=()=>Storage.saveStory();
      App.activeCharacter=await App.loadCharacter(App.activeCharacter.id);
      Chat.reset();
      for(let index=0;index<91;index++){
        Chat.add('user',`原文-U${index}：${'已觀察到的劇情結果。'.repeat(8)}`);
        Chat.add('assistant',`原文-A${index}：${'已觀察到的劇情結果。'.repeat(8)}`);
      }
      BAOMemoryWorkbench.open();
    });
    let desk=page.locator('.memory-desk');
    await desk.locator('[data-tab="notes"]').click();
    await desk.locator('[data-memory-ai-helper]').click();
    await desk.locator('[data-refine-source]').selectOption('all');
    await desk.locator('[data-run-refine]').click();
    await expect(desk.locator('[data-refine-status]')).toContainText('截斷');
    await expect(desk.locator('[data-write-draft]')).toBeDisabled();
    expect(chunks.length).toBe(2);
    expect(await page.evaluate(()=>GameState.current.memoryRefineJob.completed)).toBe(1);
    const saved=await page.evaluate(()=>JSON.stringify(Storage.buildStoryPayload('memory resume')));
    expect(saved).not.toContain('test-only-key');
    expect(JSON.parse(saved).state.memoryRefineJob.completed).toBe(1);
    await page.reload();
    await page.waitForFunction(async()=>{await Storage.ready();return Boolean(window.BAOMemoryWorkbenchSimple&&Storage.loadStory());});
    await page.evaluate(()=>{
      if(!Storage.restoreStory(Storage.loadStory()))throw new Error('restore failed: '+Storage._lastRestoreError?.message);
      App.config.api.key='test-only-key';
      App.renderChatShell(false);App.showView('chat');
      BAOMemoryWorkbench.open();
    });
    desk=page.locator('.memory-desk');
    await desk.locator('[data-tab="notes"]').click();
    await desk.locator('[data-memory-ai-helper]').click();
    await expect(desk.locator('[data-refine-source]')).toHaveValue('all');
    await expect(desk.locator('[data-refine-status]')).toContainText('已保存 1 批');
    for(let attempt=0;attempt<8;attempt++){
      await desk.locator('[data-run-refine]').click();
      await expect(desk.locator('[data-run-refine]')).toBeEnabled();
      if(await page.evaluate(()=>!GameState.current.memoryRefineJob))break;
      await expect(desk.locator('[data-refine-status]')).toContainText('尚有來源未整理');
      await expect(desk.locator('[data-write-draft]')).toBeDisabled();
    }
    await expect(desk.locator('[data-refine-status]')).toContainText('完成 · 共');
    expect(chunks[2]).toBe(chunks[1]);
    expect(chunks.slice(2)).not.toContain(chunks[0]);
    await desk.locator('[data-write-draft]').click();
    const state=await page.evaluate(()=>({cursor:Chat.summarizedUntil,messages:Chat.messages.length,text:GameState.current.memorySlots[0].text}));
    expect(state.cursor).toBe(0);expect(state.messages).toBe(182);expect(state.text).toContain('已確認的約定');
  });

  test(`Canon uses the helper route and resumes its final merge (${width}px)`, async ({ page }) => {
    await prepare(page);
    let calls=0;
    page.on('dialog', dialog=>dialog.accept());
    await page.route('https://helper.test/**', async route=>{
      const body=route.request().postDataJSON();
      expect(body.model).toBe('future-helper');
      expect(route.request().headers().authorization).toBe('Bearer helper-only-key');
      calls++;
      await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({notebooks:[{title:'北塔',content:'已抵達北塔。',category:'current',tier:'relevant'}]})},finish_reason:calls===2?'length':'stop'}]})});
    });
    await page.evaluate(()=>{
      App.config.api.key='';
      App.config.memory.summaryApiMode='separate';
      App.config.memory.summaryApi={type:'custom',protocol:'openai',key:'helper-only-key',model:'future-helper',baseUrl:'https://helper.test/chat/completions'};
      Chat.messages=Chat.messages.slice(0,2);
      BAOMemoryWorkbench.open();
    });
    const desk=page.locator('.memory-desk');
    await desk.locator('[data-tab="canon"]').click();
    await desk.locator('.canon-advanced-tools > summary').click();
    await desk.locator('[data-canon-full]').click();
    await expect(desk.locator('[data-canon-progress]')).toContainText('截斷');
    expect(await page.evaluate(()=>GameState.current.canonJob.nextChunk)).toBe(1);
    await desk.locator('[data-canon-full]').click();
    await expect(desk.locator('[data-canon-confirm]')).toBeVisible();
    expect(calls).toBe(3);
    expect(await page.evaluate(()=>Boolean(GameState.current.canon))).toBe(false);
    await desk.locator('[data-canon-confirm]').click();
    expect(await page.evaluate(()=>GameState.current.canon.notebooks[0].title)).toBe('北塔');
  });

  test(`reopening a running notes job shows its result without another paid request (${width}px)`, async ({ page }) => {
    await prepare(page);
    let release,calls=0;
    await page.route('https://memory.test/**', async route=>{
      calls++;
      await new Promise(resolve=>release=resolve);
      await route.fulfill({contentType:'application/json',body:JSON.stringify({choices:[{message:{content:JSON.stringify({events:['已完成的整理稿']})},finish_reason:'stop'}]})});
    });
    await page.evaluate(()=>{
      App.config.api={type:'custom',protocol:'openai',key:'mock',model:'future-model',baseUrl:'https://memory.test/chat/completions'};
      App.config.memory.summaryApiMode='same';
      Chat.messages=Chat.messages.slice(0,2).map(message=>({...message,content:'已觀察到的結果。'}));
      BAOMemoryWorkbench.open();
    });
    const openAI=async()=>{
      const desk=page.locator('.memory-desk');
      await desk.locator('[data-tab="notes"]').click();
      await desk.locator('[data-memory-ai-helper]').click();
      return desk;
    };
    let desk=await openAI();
    await expect(desk.locator('[data-refine-model]')).toHaveJSProperty('readOnly',true);
    await desk.locator('[data-run-refine]').click();
    await expect.poll(()=>calls).toBe(1);
    await desk.locator('.memory-desk-close').click();
    await page.evaluate(()=>BAOMemoryWorkbench.open());
    desk=await openAI();
    await expect(desk.locator('[data-run-refine]')).toBeDisabled();
    release();
    await expect(desk.locator('[data-refine-status]')).toContainText('完成');
    await expect(desk.locator('[data-write-draft]')).toBeEnabled();
    await expect(desk.locator('[data-refine-draft]')).toContainText('已完成的整理稿');
    expect(calls).toBe(1);
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

  test(`memory diagnostic separates requested, effective and thinking tokens (${width}px)`, async ({page})=>{
    await prepare(page);
    await page.evaluate(()=>{
      App.config.api={key:'mock',protocol:'gemini',model:'gemini-3.1-pro-preview',memory_policy:{outputTokens:{summary:16384}}};
      API.send=async()=>({text:'partial',finishReason:'MAX_TOKENS',outputBudget:{requested:16384,effective:16384,source:'gemini-direct'},usage:{output_tokens:1796,reasoning_tokens:14588}});
      BAOMemoryWorkbench.open();
    });
    await page.locator('[data-retry-auto-memory]').click();
    await expect(page.locator('.memory-health-card')).toContainText('截斷');
    const diagnostic=page.locator('.memory-diagnostics');
    await diagnostic.locator('summary').click();
    await expect(diagnostic).toContainText('摘要請求額度：16384 Token');
    await expect(diagnostic).toContainText('實際送出額度：16384 Token');
    await expect(diagnostic).toContainText('思考用量：14588 Token');
    await expect(diagnostic).toContainText('模型回報輸出：1796 Token');
    expect(await page.evaluate(()=>Chat.summarizedUntil)).toBe(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });

}
