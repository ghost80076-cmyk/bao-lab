const {test,expect}=require('@playwright/test');
test('mobile request inspector and NPC timeline use existing story controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.waitForFunction(()=>Boolean(window.BAOContextInspector&&window.BAONPCTimeline&&window.BAOStoryControlCenter&&App.characters?.length));
  await page.evaluate(async()=>{
    App.activeCharacter={...App.characters[0],name:'港城故事',greeting:'歡迎回來。'};
    App.config={persona:{name:'旅人'},narrativeMode:'world',displayMode:'ui',api:{type:'custom',model:'mock',key:'UNIQUE_TEST_KEY',baseUrl:'https://example.invalid/v1/chat/completions'},memory:{mode:'full',maxRounds:20,maxContext:64000}};
    Chat.reset();GameState.create(App.activeCharacter,App.config);
    GameState.upsertNPC({name:'艾琳',presence:'away'});
    if (!GameState.current.npcs.some(n=>n.name==='艾琳')) throw new Error('NPC fixture was not registered');
    Chat.add('user','我先離開城市。');
    App.renderChatShell(false);App.showView('chat');
  });
  await page.route('https://example.invalid/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'故事回覆'}}],usage:{prompt_tokens:300,completion_tokens:20,prompt_tokens_details:{cached_tokens:0}}})}));
  await page.evaluate(async()=>{
    const messages=await App.buildMessages(App.config);
    await API.send({...App.config.api,stream:false},messages);
    BAOContextHealth.open();
  });
  const health=page.getByRole('dialog',{name:'上下文狀態'});
  await health.getByText('進階 Token 說明與請求檢視',{exact:true}).click();
  await health.getByRole('button',{name:'查看本輪送出內容'}).click();
  const inspector=page.getByRole('dialog',{name:'本輪上下文檢視器'});
  await expect(inspector).toBeVisible();
  await expect(inspector).toContainText('300 tok');
  await expect(inspector).toContainText('快取讀取 0 tok');
  await expect(inspector).not.toContainText('UNIQUE_TEST_KEY');
  const noOverflow=async locator=>expect(await locator.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  await noOverflow(inspector);
  await inspector.locator('details').last().locator('summary').click();
  await expect(inspector).toContainText('我先離開城市。');
  await page.keyboard.press('Escape');await expect(inspector).toHaveCount(0);

  await page.getByRole('button',{name:'故事總覽',exact:true}).click();
  const control=page.getByRole('dialog',{name:'故事總覽'});
  await control.locator('.story-control-more > summary').click();
  await control.locator('[data-story-control-action="timeline"]').click();
  const timeline=page.getByRole('dialog',{name:'NPC 個別時間線'});
  await expect(timeline).toBeVisible();
  await timeline.locator('[data-npc]').selectOption({label:'艾琳'});
  await timeline.getByText('安排離場日程',{exact:true}).click();
  await timeline.locator('[name="text"]').fill('在市場上班');
  await timeline.locator('[name="minutes"]').fill('60');
  await timeline.locator('[name="kind"]').selectOption('routine');
  await timeline.getByRole('button',{name:'加入日程'}).click();
  await expect(timeline.locator('[data-history]')).toContainText('已排定');
  await page.evaluate(()=>GameState.applyUpdate({world_clock:{advance_minutes:60}}));
  await timeline.locator('[data-npc]').dispatchEvent('change');
  await expect(timeline.locator('[data-history]')).toContainText('固定日程完成');
  await noOverflow(timeline);
  await page.screenshot({path:test.info().outputPath('npc-timeline-mobile.png')});
  await page.keyboard.press('Escape');await expect(timeline).toHaveCount(0);
  // Desktop uses a vertical document, not context-health's two-column grid areas.
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>BAOContextInspector.open());
  await expect(page.getByRole('dialog',{name:'本輪上下文檢視器'})).toHaveCSS('display','block');
  await page.screenshot({path:test.info().outputPath('context-inspector-desktop.png')});
  for (const theme of ['night','mist','dawn','dusk','sunset']) {
    const contrast = await page.evaluate(theme => {
      YoruExperience.choose({theme});
      const style = getComputedStyle(document.querySelector('[data-context-inspector] .context-health-panel'));
      const lum = value => value.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const bg=lum(style.backgroundColor),fg=lum(style.color);
      return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
    },theme);
    expect(contrast,theme).toBeGreaterThanOrEqual(4.5);
  }
});
