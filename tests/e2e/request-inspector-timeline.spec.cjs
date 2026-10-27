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
    Chat.add('assistant','艾琳聽說港口今天封閉，但還沒有確認。');
    const source=Chat.messages.at(-1);
    BAOEpisodicMemory.ingest(GameState.current,{episodes:[{text:'港口封閉傳聞',certainty:'rumor',visibility:'restricted',evidenceIds:[source.id],knowledge:[{actor:'艾琳',mode:'rumor',claim:'聽說港口封閉，尚未確認。',evidenceIds:[source.id]}]}]},[source]);
    Chat.add('user','我先離開城市。');
    App.renderChatShell(false);App.showView('chat');
  });
  let requestCount=0, nextReply='故事回覆';
  const openMobileControl=async()=>{
    await page.locator('#bao-mobile-composer-tools').click();
    const quick=page.locator('#bao-chat-tool-drawer .bao-control-sections');
    await quick.getByRole('button',{name:'目前設定',exact:true}).click();
    return page.getByRole('dialog',{name:'故事總覽'});
  };
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
  const efficiency=health.locator('.context-efficiency');
  await expect(efficiency).toContainText('本輪輸入組成');
  await expect(efficiency).toContainText('玩家本機分析');
  await efficiency.locator('summary').click();
  await expect(efficiency).toContainText('近期對話原文');
  await expect(efficiency).toContainText('疑似重複');
  await expect(efficiency).not.toContainText('UNIQUE_TEST_KEY');
  await efficiency.locator('summary').click();
  await health.getByText('進階 Token 說明',{exact:true}).click();
  await health.getByRole('button',{name:'查看設定生效狀態'}).click();
  const inspector=page.getByRole('dialog',{name:'故事總覽'});
  await expect(inspector).toBeVisible();
  await expect(inspector.locator('[data-settings-effects]')).toBeVisible();
  await expect(inspector).not.toContainText('UNIQUE_TEST_KEY');
  await expect(inspector).not.toContainText('守衛正在登記離城旅客。');
  await expect(inspector).not.toContainText('離城需登記。');
  const noOverflow=async locator=>expect(await locator.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  await noOverflow(inspector);
  await page.keyboard.press('Escape');await expect(inspector).toHaveCount(0);

  const control=await openMobileControl();
  await control.locator('.story-control-more > summary').click();
  await control.locator('[data-story-control-action="timeline"]').click();
  const timeline=page.getByRole('dialog',{name:'NPC 個別時間線'});
  await expect(timeline).toBeVisible();
  await timeline.locator('[data-npc]').selectOption({label:'艾琳'});
  const knowledgeSource=timeline.locator('[data-source-event]').first();
  await knowledgeSource.locator('summary').click();
  await expect(knowledgeSource).toContainText('取得這項認知的原文');
  await expect(knowledgeSource.locator('pre')).toHaveText('艾琳聽說港口今天封閉，但還沒有確認。');
  await noOverflow(timeline);
  await page.screenshot({path:test.info().outputPath('npc-knowledge-source-mobile.png')});
  await knowledgeSource.locator('summary').click();
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
  await openMobileControl();
  await control.locator('.story-control-more > summary').click();
  await control.locator('[data-story-control-action="timeline"]').click();
  await timeline.locator('[data-npc]').selectOption({label:'艾琳'});
  await expect(timeline.locator('[data-history]')).toContainText('故事已結案');
  await expect(timeline.locator('[data-history]')).toContainText(quote);
  const resolvedSource=timeline.locator('[data-source-schedule]').last();
  await resolvedSource.locator('summary').click();
  await expect(resolvedSource).toContainText('結案故事原文');
  await expect(resolvedSource).toContainText('故事回覆');
  await expect(resolvedSource.locator('pre').last()).toHaveText(quote);
  await noOverflow(timeline);
  await page.screenshot({path:test.info().outputPath('npc-resolution-source-mobile.png')});
  await resolvedSource.locator('summary').click();
  await page.evaluate(id=>{const s=GameState.current.npcTimeline.schedules.find(s=>s.id===id);Chat.messages.find(m=>m.id===s.resolution.evidence.id).content='艾琳仍未做出決定。';},taskId);
  await resolvedSource.locator('summary').click();
  await expect(resolvedSource).toContainText('來源已變更或已移除');
  await expect(resolvedSource).not.toContainText(quote);
  await expect(resolvedSource).not.toContainText('艾琳仍未做出決定。');
  await page.screenshot({path:test.info().outputPath('npc-invalidated-source-mobile.png')});
  await page.evaluate(({id,quote})=>{const s=GameState.current.npcTimeline.schedules.find(s=>s.id===id);Chat.messages.find(m=>m.id===s.resolution.evidence.id).content=quote;},{id:taskId,quote});
  await timeline.getByRole('button',{name:'重新待判定'}).click();
  await expect(timeline.locator('[data-history]')).toContainText('到期，待判定');
  await page.screenshot({path:test.info().outputPath('npc-decision-reopened-mobile.png')});
  await page.keyboard.press('Escape');
  // Desktop uses a vertical document, not context-health's two-column grid areas.
  expect(requestCount).toBe(2,'source review must not send API requests');
  await page.setViewportSize({width:1440,height:1000});
  await page.evaluate(()=>BAONPCTimeline.open());
  await timeline.locator('[data-npc]').selectOption({label:'艾琳'});
  await timeline.locator('[data-source-event]').first().locator('summary').click();
  await expect(timeline.locator('[data-source-body]').first()).toContainText('艾琳聽說港口今天封閉，但還沒有確認。');
  await noOverflow(timeline);
  await page.screenshot({path:test.info().outputPath('npc-knowledge-source-desktop.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>BAOContextInspector.open());
  await expect(page.getByRole('dialog',{name:'故事總覽'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('context-inspector-desktop.png')});
  for (const theme of ['night','mist','dawn','dusk','sunset']) {
    const contrast = await page.evaluate(theme => {
      YoruExperience.choose({theme});
      const style = getComputedStyle(document.querySelector('#bao-chat-tool-drawer .bao-chat-tool-dialog'));
      const lum = value => value.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
      const bg=lum(style.backgroundColor),fg=lum(style.color);
      return (Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05);
    },theme);
    expect(contrast,theme).toBeGreaterThanOrEqual(4.5);
  }
});