const {test,expect}=require('@playwright/test');

test('voluntary usage controls and real API wrapper only send milestones',async({page})=>{
  const packets=[];
  await page.route('https://api.yorubay.com/usage-signals',async route=>{
    const request=route.request();
    expect(request.headers().authorization).toBeUndefined();
    expect(request.headers().cookie).toBeUndefined();
    expect(request.headers().referer).toBeUndefined();
    packets.push(request.postDataJSON());
    await route.fulfill({status:204});
  });
  await page.goto('/');
  await page.waitForFunction(()=>typeof API !== 'undefined' && window.BAOUsageSignals && typeof App !== 'undefined' && App.characters.length);
  await expect(page.locator('[data-usage-signals]').first()).not.toBeChecked();
  await page.locator('footer details summary').click();
  await page.locator('footer [data-usage-signals]').check();
  await expect(page.locator('[data-usage-signals]').first()).toBeChecked();
  await page.evaluate(async()=>{
    const config={api:{type:'custom',protocol:'openai',baseUrl:'https://fixture.invalid/v1',model:'fixture',key:'PRIVATE_KEY'},
      persona:{name:'fixture'},displayMode:'text',narrativeMode:'immersive',memory:{mode:'rounds',maxRounds:20,maxContext:64000}};
    App.config=config; App.activeCharacter=App.characters[0]; GameState.create(App.activeCharacter,config);
    // Stub transport only; keep every registered API wrapper intact.
    API.sendOpenAICompatible=async()=>({text:'PRIVATE_STORY',usage:{input_tokens:1,output_tokens:1}});
    for(let i=0;i<5;i++) await API.send(config.api,[{role:'user',content:'PRIVATE_INPUT'}]);
    BAOUsageSignals.flush();
  });
  await expect.poll(()=>packets.length).toBe(1);
  expect(packets[0].events).toEqual(['started','first_success','five_turns']);
  expect(JSON.stringify(packets)).not.toMatch(/PRIVATE_|fixture|character|model/);
  await page.reload();
  await page.waitForFunction(()=>window.BAOUsageSignals);
  await page.evaluate(()=>{BAOUsageSignals.mark('started');BAOUsageSignals.flush();});
  expect(packets).toHaveLength(1);
  await page.locator('footer details summary').click();
  await page.locator('footer [data-usage-signals]').uncheck();
  await page.evaluate(()=>{BAOUsageSignals.mark('first_failure');BAOUsageSignals.flush();});
  expect(packets).toHaveLength(1);
});

test('admin usage report requires authentication and stays readable on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  let reports=0;
  await page.route('https://api.yorubay.com/**',route=>{
    const path=new URL(route.request().url()).pathname;
    let data={};
    if(path==='/admin/players') data={players:[]};
    if(path==='/admin/usage-signals') {
      reports++;expect(route.request().headers().authorization).toBe('Bearer fixture-admin');
      data={schema_version:1,enabled:true,daily_batch_limit:500,rows:[{day:'2026-10-20',batches:3,started:2,first_success:1,first_failure:1,five_turns:1}]};
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/admin-wallet.html');
  await page.locator('#usage-signals-load').click();
  await expect(page.locator('#usage-signals-report')).toContainText('請先完成管理員驗證');expect(reports).toBe(0);
  await page.locator('#admin-token').fill('fixture-admin');await page.locator('#connect').click();
  await expect(page.locator('#connect-message')).toContainText('管理員驗證成功');
  await page.locator('#usage-signals-load').click();
  await expect(page.locator('#usage-signals-report')).toContainText('非玩家人數');
  await expect(page.locator('#usage-signals-report tbody tr')).toHaveCount(1);expect(reports).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:test.info().outputPath('usage-signals-admin-mobile.png'),fullPage:true});
});
