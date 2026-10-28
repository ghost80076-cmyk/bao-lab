const {test,expect}=require('@playwright/test');
for(const width of [320,390,1440])test(`one player settings hub with no prompt disclosure at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('./');
  await page.waitForFunction(()=>window.BAORequestLedger&&window.BAOStoryControlCenter&&window.BAOSettingsEffects&&window.BAOChatToolNavigation&&Storage.status().ready&&App.characters?.length);
  let calls=0;const bodies=[];
  await page.route('https://player-hub.invalid/**',route=>{calls++;bodies.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'回覆'}}]})});});
  await page.evaluate(async()=>{
    App.activeCharacter={...App.characters[0],name:'測試故事',system_prompt:'PRIVATE_PLATFORM_PREFIX_782',world_modules:[],character_status:{enabled:false,fields:[]}};
    App.config={persona:{name:'旅人'},api:{type:'custom',protocol:'openai',model:'PRIVATE_MODEL_782',key:'PRIVATE_KEY_782',baseUrl:'https://player-hub.invalid/v1/chat/completions',stream:false,retryEnabled:false},narrativeMode:'immersive',displayMode:'text',stateTracking:false,narrative:{responseLength:'short'},memory:{mode:'full',maxRounds:20,maxContext:64000}};
    Chat.reset();GameState.create(App.activeCharacter,App.config);Chat.add('user','我沿著港口散步。');App.showView('chat');App.renderChatShell(false);
    const messages=await App.buildMessages(App.config);await API.send(App.config.api,messages);
    delete GameState.current.actorMode;window.__hubBefore=JSON.stringify(GameState.current);
    BAOChatToolNavigation.openDrawer();
  });
  expect(await page.evaluate(()=>JSON.stringify(GameState.current))).toBe(await page.evaluate(()=>window.__hubBefore));
  expect(JSON.stringify(bodies)).toContain('PRIVATE_PLATFORM_PREFIX_782');
  const root=page.locator('#bao-chat-tool-drawer'),hub=root.locator('[data-story-settings-hub]');
  await expect(root).toHaveCount(1);await root.getByRole('button',{name:'目前設定',exact:true}).click();
  await expect(hub).toBeVisible();await expect(hub.locator(':scope > summary')).toBeHidden();
  await page.evaluate(()=>BAOStoryControlCenter.open({effects:true}));
  const menu=page.getByRole('dialog',{name:'故事總覽',exact:true});
  await expect(menu).toHaveCount(1);await expect(page.locator('.story-control-backdrop')).toHaveCount(0);
  const effects=menu.locator('[data-settings-effects]');
  await expect(effects).toBeVisible();await effects.locator('.settings-effects-group').first().locator(':scope > summary').click();
  await expect(effects.locator('[data-setting-effect="responseLength"]')).toContainText('請求含此規則');
  const visibleAndHidden=await root.textContent();expect(visibleAndHidden).not.toMatch(/PRIVATE_PLATFORM_PREFIX_782|PRIVATE_KEY_782|player-hub.invalid|HTTP 200|固定前綴候選/);
  // Compatibility diagnostic routes land in the same player hub, without a second overlay.
  await page.evaluate(()=>BAOContextInspector.open());await expect(root).toHaveCount(1);await expect(page.locator('[data-context-inspector]')).toHaveCount(0);
  expect(await menu.evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);
  await effects.scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath(`player-settings-hub-${width}.png`)});
  const more=menu.locator('.story-control-more');if(!await more.evaluate(n=>n.open))await more.locator(':scope > summary').click();
  await menu.locator('[data-story-control-action="narrative"]').click();
  await expect(page.getByRole('dialog',{name:'今晚的故事',exact:true})).toBeVisible();await expect(root).toHaveCount(0);
  expect(calls).toBe(1,'reviewing and routing settings must not add model calls');
});
