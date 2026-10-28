const {test,expect}=require('@playwright/test');
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6e7sAAAAASUVORK5CYII=';
const seed={enabled:true,userName:'玩家',apps:['notes','photos','kakao'],
  contacts:[{id:'friend',name:'好友'}],threads:[{id:'private',name:'秘密聊天室',messages:[{senderId:'friend',text:'未公開訊息'}]}],
  notes:[{id:'clue',title:'線索',text:'密碼是 0427。'},{id:'safe',title:'鎖定筆記',text:'鎖定內容：<script>window.__bad=1</script>'}],
  photos:[{id:'photo',title:'隱藏照片',src:pixel,caption:'照片上的線索'}],
  interactions:{version:1,locks:[{target:{app:'notes',id:'safe'},code:'0427',hint:'四位數故事密碼'},
    {target:{app:'photos',id:'photo'},hidden:true},{target:{app:'kakao',id:'private'},hidden:true}],
    events:[{id:'read-clue',when:{action:'read',target:{app:'notes',id:'clue'}},notification:'發現一組數字'},
      {id:'open-safe',when:{action:'unlock',target:{app:'notes',id:'safe'}},requires:[{action:'read',target:{app:'notes',id:'clue'}}],unlock:[{app:'photos',id:'photo'}],notification:'相簿新增照片'},
      {id:'read-photo',when:{action:'read',target:{app:'photos',id:'photo'}},unlock:[{app:'kakao',id:'private'}],notification:'聊天室已解鎖'}]}};
async function ready(page){
  await page.goto('/');
  await page.waitForFunction(()=>window.BAOPhoneInteractionCore && window.BAOPhoneUI && window.BAOPhoneStoryBridge && App.characters?.length);
  await page.evaluate(seed=>{
    App.activeCharacter=CharacterEngine.normalize({id:'phone-puzzle',name:'手機機關',greeting:'雨夜。',system_prompt:'照常寫故事',phone_ui:seed});
    App.config={narrativeMode:'world',displayMode:'text',persona:{name:'玩家'},api:{model:'mock',baseUrl:'https://example.invalid',key:'test'},memory:{maxRounds:20,maxContext:32000,mode:'rounds',cache:true}};
    GameState.create(App.activeCharacter,App.config);Chat.reset();App.renderChatShell(false);App.showView('chat');
    window.__sends=0;App.sendMessage=()=>{window.__sends++;};
  },seed);
}
async function app(page,name){await page.locator('.bp-home-handle').click();await page.locator('.bp-apps .bp-icon-'+name).click();}
async function document(page,title){await page.getByRole('button',{name:title,exact:false}).filter({has:page.locator('strong')}).click();}
for(const width of [320,1280]) test(`password and cross-App unlocks remain local and restore once at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await ready(page);
  const initial=await page.evaluate(()=>App.buildSystemPrompt());
  expect(initial).not.toContain('0427');expect(initial).not.toContain('隱藏照片');expect(initial).not.toContain('秘密聊天室');
  await page.locator('#bao-phone-launch').click();await app(page,'photos');
  await expect(page.locator('.bp-photo-item')).toHaveCount(0);
  await app(page,'kakao');await expect(page.locator('[data-phone-action^="thread:"]')).toHaveCount(0);
  await app(page,'notes');await document(page,'鎖定筆記');
  await expect(page.locator('.bp-document')).not.toContainText('鎖定內容');
  await expect(page.locator('.bp-unlock-form')).toBeVisible();
  await page.getByLabel('故事密碼',{exact:true}).fill('wrong');
  await page.getByRole('button',{name:'解鎖',exact:true}).click();
  await expect(page.locator('.bp-unlock-status')).toContainText('密碼不正確');
  expect(await page.evaluate(()=>GameState.current.phoneInteractions)).toBeUndefined();
  await page.locator('.bp-back').click();await document(page,'線索');
  await expect(page.locator('.bp-document')).toContainText('0427');
  await page.locator('.bp-back').click();await document(page,'鎖定筆記');
  await page.getByLabel('故事密碼',{exact:true}).fill('0427');
  await page.getByRole('button',{name:'解鎖',exact:true}).click();
  await expect(page.locator('.bp-document')).toContainText('鎖定內容：<script>');
  await expect(page.locator('.bp-unlock-form')).toHaveCount(0);
  await expect(page.locator('.bp-event-notice')).toContainText('相簿新增照片');
  expect(await page.evaluate(()=>window.__bad)).toBeUndefined();
  await app(page,'photos');await page.locator('.bp-photo-item').click();
  await expect(page.locator('.bp-photo-full')).toBeVisible();
  await expect(page.locator('.bp-event-notice')).toContainText('聊天室已解鎖');
  await app(page,'kakao');await page.locator('[data-phone-action="thread:0"]').click();
  await expect(page.locator('.bp-thread')).toContainText('未公開訊息');
  const snap=await page.evaluate(()=>{App.saveStory(false);return Storage.loadStory();});
  expect(snap.state.phoneInteractions.fired).toEqual(['read-clue','open-safe','read-photo']);
  expect(await page.evaluate(()=>window.__sends)).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(snap=>{Storage.restoreStory(snap);App.renderChatShell(false);App.showView('chat');},snap);
  await page.locator('#bao-phone-launch').click();await app(page,'notes');await document(page,'鎖定筆記');
  await expect(page.locator('.bp-unlock-form')).toHaveCount(0);
  expect(await page.evaluate(()=>GameState.current.phoneInteractions.fired.length)).toBe(3);
  await expect(page.locator('.bp-event-notice')).toHaveCount(0);
  const prompt=await page.evaluate(()=>App.buildSystemPrompt());
  expect(prompt).not.toContain('0427');expect(prompt).toContain('手機機關進度');
});
test('storage failure, pending requests and story switching do not commit puzzle progress',async({page})=>{
  await ready(page);await page.locator('#bao-phone-launch').click();await app(page,'notes');await document(page,'鎖定筆記');
  await page.evaluate(()=>{window.__save=App.saveStory;App.saveStory=()=>false;});
  await page.getByLabel('故事密碼',{exact:true}).fill('0427');await page.getByRole('button',{name:'解鎖',exact:true}).click();
  await expect(page.locator('.bp-unlock-status')).toContainText('儲存失敗');
  expect(await page.evaluate(()=>GameState.current.phoneInteractions)).toBeUndefined();
  await page.evaluate(()=>{App.saveStory=window.__save;App.__requestPending=true;});
  await page.getByRole('button',{name:'解鎖',exact:true}).click();
  await expect(page.locator('.bp-unlock-status')).toContainText('仍在回覆');
  expect(await page.evaluate(()=>GameState.current.phoneInteractions)).toBeUndefined();
  await page.evaluate(()=>{App.__requestPending=false;GameState.current={id:'other-story'};});
  await page.getByRole('button',{name:'解鎖',exact:true}).click();
  await expect(page.locator('.bp-unlock-status')).toContainText('故事已切換');
  expect(await page.evaluate(()=>GameState.current.phoneInteractions)).toBeUndefined();
});
test('studio rejects dangling references and retains mechanisms in drafts and export',async({page})=>{
  await page.goto('/character-studio.html');await page.waitForFunction(()=>window.BAOCharacterStudio && window.BAOPhoneInteractionCore && window.BAOCharacterStudioFlow);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('[name=name]').fill('手機機關草稿');await page.locator('[name=id]').fill('phone-mechanism-draft');
  await page.locator('[name=system_prompt]').fill('原作設定');await page.locator('[name=greeting]').fill('雨夜。');
  await page.locator('[name=phone_ui_enabled]').check();await page.locator('.studio-phone-raw > summary').click();await page.locator('[name=phone_ui_json]').fill(JSON.stringify(seed));
  const good=await page.evaluate(()=>BAOCharacterStudio.toExport());expect(good.presentation.phone_ui.interactions.locks[0].code).toBe('0427');
  await page.locator('#studio-save-draft').click();await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await page.reload();await page.waitForFunction(()=>window.BAOCharacterStudioFlow && window.BAOCharacterStudio);
  await page.getByRole('button',{name:'全部欄位'}).click();await page.locator('.studio-draft').filter({hasText:'手機機關草稿'}).click();
  await page.locator('.studio-phone-raw > summary').click();
  await expect(page.locator('[name=phone_ui_enabled]')).toBeChecked();
  await expect(page.locator('[name=phone_ui_json]')).toHaveValue(/0427/);
  expect((await page.evaluate(()=>BAOCharacterStudio.toExport())).presentation.phone_ui.interactions.events).toHaveLength(3);
  const invalid=structuredClone(seed);invalid.interactions.locks[0].target.id='missing';
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify(invalid));
  expect(await page.evaluate(()=>{try{BAOCharacterStudio.toExport();return '';}catch(e){return e.message;}})).toContain('找不到對應');
});
