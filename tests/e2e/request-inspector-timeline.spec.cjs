const {test,expect}=require('@playwright/test');
test('mobile request inspector and NPC timeline use existing story controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('./');
  await page.waitForFunction(()=>Boolean(window.BAOContextInspector&&window.BAONPCTimeline&&window.BAOStoryControlCenter&&window.BAOCanonWorkbench&&window.BAOLorebook&&App.characters?.length));
  await page.evaluate(async()=>{
    App.activeCharacter={...App.characters[0],name:'港城故事',greeting:'歡迎回來。'};
    App.config={persona:{name:'旅人'},narrativeMode:'world',displayMode:'ui',api:{type:'custom',model:'mock',key:'UNIQUE_TEST_KEY',baseUrl:'https://example.invalid/v1/chat/completions'},memory:{mode:'full',maxRounds:20,maxContext:64000}};
    Chat.reset();GameState.create(App.activeCharacter,App.config);
    GameState.upsertNPC({name:'艾琳',presence:'away'});
    if (!GameState.current.npcs.some(n=>n.name==='艾琳')) throw new Error('NPC fixture was not registered');
    App.activeCharacter.lore='【世界書：城市出口｜城市】守衛正在登記離城旅客。【/世界書】\n【世界書：遠山傳說｜遠山】不可送出的遠山細節。【/世界書】';
    GameState.current.canon={notebooks:[
      {id:'canon-core',title:'城門規則',category:'world',tier:'core',content:'離城需登記。'},
      {id:'canon-ui',title:'待核對筆記',category:'conflicts',tier:'ui',content:'不可送出的存疑細節。'}
    ]};
    Chat.add('user','我先離開城市。');
    App.renderChatShell(false);App.showView('chat');
  });
  let requestCount=0, nextReply='故事回覆';
  await page.route('https://example.invalid/**',route=>{
    requestCount++;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:nextReply}}],usage:{prompt_tokens:300,completion_tokens:20,prompt_tokens_details:{cached_tokens:0}}})});
  });
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
  const canonDetails=inspector.locator('details').filter({has:page.locator('summary', {hasText:/^Canon ·/})});
  await canonDetails.locator('summary').click();
  await expect(canonDetails).toContainText('城門規則 · 已加入');
  await expect(canonDetails).toContainText('待核對筆記 · 僅供界面顯示');
  const loreDetails=inspector.locator('details').filter({has:page.locator('summary', {hasText:/^角色卡內嵌世界書 ·/})});
  await loreDetails.locator('summary').click();
  await expect(loreDetails).toContainText('城市出口 · 已加入');
  await expect(loreDetails).toContainText('遠山傳說 · 未命中');
  await expect(inspector).not.toContainText('不可送出的');
  await page.screenshot({path:test.info().outputPath('context-source-decisions-mobile.png')});
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
  const taskId=await page.evaluate(()=>{
    BAONPCTimeline.schedule({npcId:GameState.current.npcs.find(n=>n.name==='艾琳').npc_id,text:'是否接受王城邀請',inMinutes:1,kind:'decision'});
    GameState.applyUpdate({world_clock:{advance_minutes:1}});
    GameState.upsertNPC({name:'艾琳',presence:'present'});
    return GameState.current.npcTimeline.schedules.at(-1).id;
  });
  const quote='艾琳看著來信，明確拒絕了王城的邀請。';
  nextReply=quote+'<BAO_STATE>'+JSON.stringify({npc_timeline:{resolve:[{id:taskId,quote}]}})+'</BAO_STATE>';
  await page.locator('#user-input').fill('妳決定了嗎？');
  await page.getByRole('button',{name:'送出訊息',exact:true}).click();
  await expect.poll(()=>page.evaluate(id=>GameState.current.npcTimeline.schedules.find(s=>s.id===id).status,taskId)).toBe('resolved');
  expect(requestCount).toBe(2); // Initial inspection request + this story turn, no added helper call.
  await page.getByRole('button',{name:'故事總覽',exact:true}).click();
  await control.locator('.story-control-more > summary').click();
  await control.locator('[data-story-control-action="timeline"]').click();
  await timeline.locator('[data-npc]').selectOption({label:'艾琳'});
  await expect(timeline.locator('[data-history]')).toContainText('故事已結案');
  await expect(timeline.locator('[data-history]')).toContainText(quote);
  await timeline.getByRole('button',{name:'重新待判定'}).click();
  await expect(timeline.locator('[data-history]')).toContainText('到期，待判定');
  await page.screenshot({path:test.info().outputPath('npc-decision-reopened-mobile.png')});
  await page.keyboard.press('Escape');
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
