const {test,expect}=require('@playwright/test');
if(process.env.BAO_LIVE_URL)test.use({baseURL:process.env.BAO_LIVE_URL});
for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
 test('留影 native setup, Regex and reading at '+viewport.width,async({page})=>{
  await page.setViewportSize(viewport);
  await page.goto('./');
  await page.waitForFunction(()=>window.BAOAuthorInline&&window.BAOGameplayUICore&&typeof App?.loadCharacter==='function');
  const result=await page.evaluate(async()=>{
   const c=await App.loadCharacter('kept-in-frame-lin-youzhen');
   App.activeCharacter=c;
   App.config={narrativeMode:'world',displayMode:'ui',gameplaySetup:{relationship:'戀人',focus:'心理懸疑',world_mode:'現代寫實',tempo:'慢熱寫實'},persona:{name:'測試玩家',gender:'未指定',identity:'',personality:'',relationship:'',extra:''},api:{type:'custom',protocol:'openai',model:'offline-test',baseUrl:'',key:''},memory:{mode:'smart',maxRounds:20,maxContext:32000,cache:false}};
   Chat.reset();GameState.create(c,App.config);
   const schema=window.BAOGameplayUICore.normalize(c.gameplay_ui);
   App.renderChatShell(true);App.showView('chat');
   return {modules:Object.keys(GameState.current.modules),relationship:GameState.current.modules.session_setup.relationship,builder:schema.builder.fields.length,npcs:GameState.current.npcs.map(n=>n.name)};
  });
  expect(result.relationship).toBe('戀人');expect(result.builder).toBe(6);expect(result.modules).toContain('private_facts');expect(result.npcs).not.toContain('留影｜林祐真');
  // Enzo-style structured opening: scene, a direct hook and clickable draft-only choices.
  await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
  await expect(page.locator('#chat-stream .bao-structured-opening')).toHaveCount(1);
  await expect(page.locator('#chat-stream')).toContainText('以你的名字預約的拍攝委託');
  await expect(page.locator('#chat-stream')).toContainText('我拒絕了，錢也退了');
  await expect(page.locator('#chat-stream')).toContainText('但你是我的戀人');
  await expect(page.locator('#chat-stream .bao-opening-choice')).toHaveCount(4);
  await page.locator('#chat-stream .bao-opening-choice').first().click();
  await expect(page.locator('#user-input')).toHaveValue('我靠近他：「先告訴我，你是不是也嚇了一跳？」');
  await page.locator('#user-input').fill('');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:kept-in-frame-lin-youzhen')));
  expect(stored.source).toBe('official-sidecar');
  // A real later photography note must still use the isolated author renderer.
  await page.evaluate(()=>{
   Chat.add('assistant','攝影筆記｜21:00\n照片背面寫著：週六。\n\n正文，不能吃掉。');
   App.renderChatShell(false);
  });
  await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(1);
  const frame=page.frameLocator('iframe[title="聊天內作者隔離介面"]');
  await expect(frame.locator('.yb-kept-note')).toBeVisible();
  await expect(frame.locator('body')).toContainText('照片背面寫著：週六。');
  await expect(frame.locator('body')).toContainText('正文，不能吃掉。');
  await expect(frame.locator('body')).not.toContainText('【YB:');
  expect(await frame.locator('body').evaluate(n=>n.scrollWidth<=n.clientWidth+2)).toBe(true);
  await page.evaluate(()=>{App.config.displayMode='text';App.renderChatShell(true);});
  await expect(page.locator('#chat-stream')).toContainText('攝影筆記｜21:00');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  // Mature catalog entries are deliberately hidden until the reader opts in.
  await page.evaluate(()=>BAOContentPreferences.setAdultContentEnabled(true,{confirmAge:false}));
  await page.goto('./author.html?id=banzhang');
  await expect(page.locator('body')).toContainText('留影｜林祐真');
 });
}
