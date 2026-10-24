const {test,expect}=require('@playwright/test');
const ready=page=>page.waitForFunction(()=>window.BAORequestLedger && window.BAOInterpretationMods && window.BAOCommentaryMods && window.BAOSameModelStateMerge && window.BAOContextInspector && window.BAOCostControl && App.__requestLifecyclePatched && App.__worldStateHooked && Storage.status().ready && App.characters?.length);
async function setup(page){await page.goto('./');await ready(page);}
async function seed(page,options={}){
  await page.evaluate(options=>{
    App.activeCharacter={...App.characters[0],id:options.offlineWorldPreview?'autonomous-npc-world':'auxiliary-audit',name:'輔助測試',system_prompt:'AUXILIARY_CARD',world_modules:[],character_status:{fields:[]},gameplay:{}};
    App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',stateTracking:!!options.tracking,narrative:{},
      api:{type:'custom',protocol:'openai',model:'main-audit',key:options.noKey?'':'test',baseUrl:'https://aux-audit.invalid/v1/chat/completions',stream:false,retryEnabled:false},
      memory:{mode:options.memory || 'full',maxRounds:4,maxContext:64000,summaryInterval:2,episodicRecall:false,summaryApiMode:'same'},
      cost:{stateApiMode:'same',stateInterval:2},demoMode:!!options.demoMode,offlineWorldPreview:!!options.offlineWorldPreview};
    if(options.separateState)Object.assign(App.config.cost,{stateApiMode:'separate',stateApi:{type:'custom',protocol:'openai',model:'state-audit',key:'state-key',baseUrl:'https://state-audit.invalid/v1/chat/completions',retryEnabled:false}});
    if(options.separateMemory)Object.assign(App.config.memory,{summaryApiMode:'separate',summaryApi:{type:'custom',protocol:'openai',model:'memory-audit',key:'memory-key',baseUrl:'https://memory-audit.invalid/v1/chat/completions',retryEnabled:false}});
    Chat.reset();GameState.create(App.activeCharacter,App.config);
    GameState.current.interpretationMods={enabled:[...(options.advisor?['bun-interpreter']:[]),...(options.observer?['class-monitor']:[])],detailMode:options.detailed?'detailed':'compact',monitorTone:options.banter?'banter':'professional',showAdvisor:false};
    GameState.current.commentaryMods={enabled:options.commentary?['director-commentary']:[]};
    if(options.oldTurns)for(let i=0;i<12;i++){Chat.add('user','OLD_USER_'+i);Chat.add('assistant','OLD_STORY_'+i);}
    App.showView('chat');App.renderChatShell(false);document.getElementById('user-input').value='AUX_QUERY';
  },options);
}
async function mock(page,records,fail=''){
  const reply=async route=>{
    const body=route.request().postDataJSON(),system=body.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
    const kind=system.includes('玩家行為解讀顧問')?'advisor':system.includes('NPC 表現解讀者')?'observer':system.includes('場外人格／旁白 MOD')?'commentary':
      system.includes('Observer，不是作者')?'memory':(system.includes('只輸出合法 JSON 世界狀態') || system.includes('只進行狀態追蹤'))?'state':'story';
    records.push({kind,body,url:route.request().url()});
    if(kind===fail)return route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:{message:'expected test failure'}})});
    const content=kind==='memory'?JSON.stringify({events:['AUX_MEMORY']}):kind==='state'?JSON.stringify({time:'晚上',events:[],npcs:[]}):kind==='story'?'AUX_STORY':`AUX_${kind.toUpperCase()}`;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content}}],usage:{prompt_tokens:40,completion_tokens:5}})});
  };
  for(const host of ['aux-audit','state-audit','memory-audit'])await page.route(`https://${host}.invalid/**`,reply);
}
test('all advisor/observer/commentary combinations have exact calls, order and isolated output',async({page})=>{
  await setup(page);const records=[];await mock(page,records);
  for(let mask=0;mask<8;mask++){
    records.length=0;const advisor=!!(mask&1),observer=!!(mask&2),commentary=!!(mask&4);
    await seed(page,{advisor,observer,commentary,detailed:!!(mask&1),banter:!!(mask&2)});
    await page.evaluate(()=>App.sendMessage());
    expect(records.map(r=>r.kind),`combination ${mask}`).toEqual([...(advisor?['advisor']:[]),'story',...(commentary?['commentary']:[]),...(observer?['observer']:[])]);
    const story=records.find(r=>r.kind==='story').body;
    expect(JSON.stringify(story).includes('AUX_ADVISOR')).toBe(advisor);
    expect(story.messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')).not.toContain('AUX_ADVISOR');
    if(observer){const body=JSON.stringify(records.find(r=>r.kind==='observer').body);expect(body).toContain('AUX_STORY');expect(body).toContain('輕鬆吐槽');}
    const history=await page.evaluate(()=>JSON.stringify(Chat.messages));expect(history).toContain('AUX_STORY');expect(history).not.toMatch(/AUX_ADVISOR|AUX_OBSERVER|AUX_COMMENTARY/);
    const prompt=await page.evaluate(async()=>JSON.stringify(await App.buildMessages(App.config)));expect(prompt).not.toMatch(/AUX_ADVISOR|AUX_OBSERVER|AUX_COMMENTARY/);
    const usage=await page.evaluate(()=>Chat.usageLedger.length);expect(usage).toBe(records.length);
    const ledger=await page.evaluate(()=>BAORequestLedger.snapshot());
    expect(ledger.logicalRequests).toBe(records.length);expect(ledger.transportAttempts).toBe(records.length);
    expect(ledger.calls.map(c=>c.kind)).toEqual(records.map(r=>r.kind));expect(ledger.calls.every(c=>c.status==='success')).toBe(true);
    for(const [kind,on] of [['advisor',advisor],['observer',observer],['commentary',commentary]]){
      if(!on)expect(ledger.decisions).toContainEqual({kind,reason:'disabled'});
    }
    expect(ledger.decisions).toContainEqual({kind:'memory',reason:'memory-mode'});
    expect(ledger.decisions).toContainEqual({kind:'state',reason:'tracking-off'});
  }
});
for(const mode of ['demoMode','offlineWorldPreview','noKey'])test(`${mode} makes zero paid auxiliary calls`,async({page})=>{
  await setup(page);const records=[];await mock(page,records);page.on('dialog',d=>d.dismiss());
  await seed(page,{advisor:true,observer:true,commentary:true,[mode]:true});await page.evaluate(()=>App.sendMessage());expect(records).toHaveLength(0);
  const ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(ledger.transportAttempts).toBe(0);expect(ledger.logicalRequests).toBe(0);
  // Explicit generation is also a no-op in local previews.
  if(mode!=='noKey'){await page.evaluate(async()=>{Chat.add('assistant','LOCAL_SCENE');await BAOCommentaryMods.generateFor?.(Chat.messages.at(-1),{force:true});});expect(records).toHaveLength(0);}
});
for(const failure of ['advisor','story','observer','commentary'])test(`${failure} failure does not duplicate or contaminate other stages`,async({page})=>{
  await setup(page);const records=[];await mock(page,records,failure);await seed(page,{advisor:true,observer:true,commentary:true});
  await page.evaluate(()=>App.sendMessage());
  expect(records.map(r=>r.kind)).toEqual(failure==='story'?['advisor','story']:['advisor','story','commentary','observer']);
  const history=await page.evaluate(()=>JSON.stringify(Chat.messages));expect(history).not.toMatch(/AUX_ADVISOR|AUX_OBSERVER|AUX_COMMENTARY/);
  if(failure!=='story')expect(history).toContain('AUX_STORY');
  const ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(ledger.calls.find(c=>c.kind===failure).status).toBe('failed');
  expect(ledger.transportAttempts).toBe(records.length);
  if(failure==='story')for(const kind of ['observer','commentary'])expect(ledger.decisions).toContainEqual({kind,reason:'story-incomplete'});
});
test('commands, blank input and repeated redraws never make model calls',async({page})=>{
  await setup(page);const records=[];await mock(page,records);await seed(page,{advisor:true,observer:true,commentary:true});
  await page.evaluate(async()=>{
    for(const text of ['','【關閉雙系統】','【啟用雙系統】']){document.getElementById('user-input').value=text;await App.sendMessage();}
    for(let i=0;i<3;i++){BAOInterpretationMods.summary();BAOCommentaryMods.summary();BAOSettingsEffects.snapshot();App.renderChatShell(false);}
  });expect(records).toHaveLength(0);
});
test('memory threshold and separate route add one request; full mode does not summarize',async({page})=>{
  await setup(page);const records=[];await mock(page,records);
  await seed(page,{oldTurns:true,memory:'full'});await page.evaluate(()=>App.sendMessage());expect(records.map(r=>r.kind)).toEqual(['story']);
  records.length=0;await seed(page,{memory:'smart'});await page.evaluate(()=>App.sendMessage());expect(records.map(r=>r.kind)).toEqual(['story']);
  records.length=0;await seed(page,{oldTurns:true,memory:'smart',separateMemory:true});await page.evaluate(()=>App.sendMessage());
  expect(records.map(r=>r.kind)).toEqual(['story','memory']);expect(records[1].url).toContain('memory-audit.invalid');expect(records[1].body.model).toBe('memory-audit');
  expect(await page.evaluate(()=>Chat.summary)).toContain('AUX_MEMORY');
  const ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(ledger.logicalRequests).toBe(2);expect(ledger.calls[1].route).toBe('separate');
});
test('same-model state uses one request; separate state honors its interval and route',async({page})=>{
  await setup(page);const records=[];await mock(page,records);
  await seed(page,{tracking:true});await page.evaluate(()=>App.sendMessage());expect(records.map(r=>r.kind)).toEqual(['story']);expect(JSON.stringify(records[0].body)).toContain('BAO_STATE_V1');
  expect((await page.evaluate(()=>BAORequestLedger.snapshot())).decisions).toContainEqual({kind:'state',reason:'merged'});
  records.length=0;await seed(page,{tracking:true,separateState:true});await page.evaluate(()=>App.sendMessage());expect(records.map(r=>r.kind)).toEqual(['story']);
  await page.evaluate(async()=>{document.getElementById('user-input').value='SECOND_QUERY';await App.sendMessage();});
  expect(records.map(r=>r.kind)).toEqual(['story','story','state']);expect(records[2].url).toContain('state-audit.invalid');expect(records[2].body.model).toBe('state-audit');
  const ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(ledger.logicalRequests).toBe(2);expect(ledger.calls[1].kind).toBe('state');expect(ledger.calls[1].route).toBe('separate');
});

for(const width of [320,390,1440])test(`execution ledger is read-only and fits ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page);
  const records=[];await mock(page,records);await seed(page,{advisor:true,observer:true,commentary:true});
  await page.evaluate(()=>{App.config.api.model='<img src=x onerror=window.__ledgerXSS=1>'+ 'x'.repeat(150);});
  await page.evaluate(()=>App.sendMessage());
  const before=await page.evaluate(()=>JSON.stringify([App.config,Chat.messages,GameState.current,JSON.stringify(localStorage)]));
  await page.evaluate(()=>BAOStoryControlCenter.open());
  const overview=page.getByRole('dialog',{name:'故事總覽',exact:true});
  await overview.locator('[data-settings-effects] > summary').click();
  await overview.getByRole('button',{name:'核對最近送出內容'}).click();
  const panel=page.getByRole('dialog',{name:'本輪上下文檢視器',exact:true}),ledger=panel.locator('[data-request-ledger]');
  await ledger.locator(':scope > summary').click();
  await expect(ledger).toContainText('4 項請求 · 4 次傳輸嘗試');
  await expect(ledger.locator('[data-execution-kind]')).toHaveCount(4);
  await expect(ledger).toContainText('費用未回報');await expect(ledger).toContainText('不等於模型實際處理次數或帳單');
  expect(await ledger.evaluate(node=>node.scrollWidth<=node.clientWidth+1)).toBe(true);
  expect(await page.evaluate(()=>JSON.stringify([App.config,Chat.messages,GameState.current,JSON.stringify(localStorage)]))).toBe(before);
  expect(records).toHaveLength(4);
  await expect(ledger.locator('img')).toHaveCount(0);expect(await page.evaluate(()=>window.__ledgerXSS)).toBeUndefined();
  await ledger.scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath(`request-ledger-${width}.png`)});
});
test('retry, format repair and invalid memory are distinct requests with cooldown',async({page})=>{
  await setup(page);let attempts=0;
  await page.route('https://aux-audit.invalid/**',route=>{
    attempts++;return route.fulfill({status:attempts===1?503:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'RETRY_OK'}}]})});
  });
  await seed(page);await page.evaluate(async()=>{API.waitForRetry=async()=>{};App.config.api.retryEnabled=true;await App.sendMessage();});
  let ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(ledger.logicalRequests).toBe(1);expect(ledger.transportAttempts).toBe(2);expect(ledger.retries).toBe(1);
  await page.unroute('https://aux-audit.invalid/**');const records=[];
  await page.route('https://aux-audit.invalid/**',route=>{
    const body=route.request().postDataJSON(),sys=body.messages.filter(m=>m.role==='system').map(m=>m.content).join(' ');
    const kind=sys.includes('JSON 修復器')?'memory-repair':sys.includes('Observer，不是作者')?'memory':'story';records.push(kind);
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:kind==='story'?'STORY_OK':'not valid memory json'}}]})});
  });
  await seed(page,{oldTurns:true,memory:'smart'});await page.evaluate(()=>App.sendMessage());
  ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(records).toEqual(['story','memory','memory-repair']);
  expect(ledger.calls.map(c=>c.kind)).toEqual(records);expect(ledger.retries).toBe(0);expect(ledger.transportAttempts).toBe(3);
  expect(ledger.decisions).toContainEqual({kind:'memory',reason:'invalid-output'});
  await page.evaluate(async()=>{document.getElementById('user-input').value='NEXT';await App.sendMessage();});
  ledger=await page.evaluate(()=>BAORequestLedger.snapshot());expect(ledger.calls.map(c=>c.kind)).toEqual(['story']);
  expect(ledger.decisions).toContainEqual({kind:'memory',reason:'cooldown'});
});
