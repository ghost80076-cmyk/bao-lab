const {test,expect}=require('@playwright/test');
async function setup(page) {
  await page.goto('./');
  await page.waitForFunction(()=>window.BAOStoryDiscussion && window.BAOStoryControlCenter && App.characters?.length && window.BAOStoryMaintenanceLock);
  await page.evaluate(async()=>{
    App.activeCharacter=App.characters[0];
    App.config={persona:{name:'旅人'},api:{model:'mock',key:'FAKE',baseUrl:'https://invalid.example'},memory:{mode:'smart',maxRounds:20,maxContext:32000,summaryApiMode:'same'},cost:{}};
    Chat.reset();GameState.create(App.activeCharacter,App.config);Chat.add('user','已公開的線索');Chat.add('assistant','你在港口看見凜。');
    App.renderChatShell(false);App.showView('chat');await Storage.ready();
    window.__requests=[];window.__draft={characters:[{name:'凜',description:'守衛'}],player:'旅人',world:'港口會在夜間關閉',summary:'已抵達港口'};
    API.send=async(config,messages)=>{window.__requests.push({config:{storyTool:config.__storyTool,memory:config.__memoryTask},messages});return {text:config.__discussionTask?'建議先調查燈塔；這是建議，尚未發生。':JSON.stringify(window.__draft),finishReason:'STOP'};};
  });
}
for(const width of [390,1280])test(`discussion remains outside story and import settings require review at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:850});await setup(page);
  await page.getByRole('button',{name:'開啟控制中心',exact:true}).click();
  await page.getByRole('button',{name:/戲外討論/}).click();
  const panel=page.getByRole('dialog',{name:'故事討論',exact:true});await expect(panel).toBeVisible();
  await panel.locator('[data-question]').fill('DISCUSSION_SECRET 如何調查？');
  await panel.getByRole('button',{name:'送出討論',exact:true}).click();
  await expect(panel.locator('[data-status]')).toContainText('討論已保存');
  const isolation=await page.evaluate(async()=>({story:JSON.stringify(await App.buildMessages()),messages:Chat.messages.length,memory:GameState.current.memory,stored:Storage.loadStory().state.storyDiscussion.messages.length,tool:window.__requests[0].config.storyTool}));
  expect(isolation.story).not.toContain('DISCUSSION_SECRET');expect(isolation.messages).toBe(2);expect(isolation.stored).toBe(2);expect(isolation.tool).toBe(true);
  expect(await panel.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
  await page.screenshot({path:testInfo.outputPath('discussion.png')});
  await panel.getByRole('button',{name:'返回故事',exact:true}).click();
  await page.evaluate(()=>BAOStoryDiscussion.openSplit([{role:'user',content:'我是旅人'},{role:'assistant',content:'凜是守衛，港口夜間關閉。'}]));
  const split=page.getByRole('dialog',{name:'匯入設定拆分'});
  await expect(split.locator('[data-apply]')).toBeDisabled();
  await split.locator('[data-generate]').click();
  await expect(split.locator('[data-status]')).toContainText('草稿完成');
  expect(await page.evaluate(()=>Boolean(GameState.current.storyActors?.hostedCharacters?.some(a=>a.name==='凜')))).toBe(false);
  await split.locator('[data-field="world"]').fill('玩家編輯後的背景');
  await split.locator('[data-select="world"]').check();
  await split.locator('[data-apply]').click();await expect(split.locator('[data-status]')).toContainText('已保存確認設定');
  const applied=await page.evaluate(()=>({world:GameState.current.worldbookLibrary.installed.at(-1).entries[0].content,persona:App.config.persona,actors:GameState.current.storyActors?.hostedCharacters||[],messages:Chat.messages.length}));
  await page.screenshot({path:testInfo.outputPath('setting-split.png')});
  expect(applied.world).toBe('玩家編輯後的背景');expect(applied.persona.extra).toBeUndefined();expect(applied.actors.some(a=>a.name==='凜')).toBe(false);expect(applied.messages).toBe(2);
});
test('late discussion cannot write into another story and close cancels its request',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{API.send=async(config)=>new Promise(resolve=>{window.__reply=()=>resolve({text:'LATE',finishReason:'STOP'});window.__signal=config.signal;});BAOStoryDiscussion.open();});
  const panel=page.getByRole('dialog',{name:'故事討論',exact:true});
  await panel.locator('[data-question]').fill('問題');await panel.locator('[data-send]').click();
  await page.waitForFunction(()=>Boolean(window.__reply));
  await page.evaluate(()=>{window.__old=GameState.current;GameState.current={memory:[]};window.__reply();});
  await expect(panel.locator('[data-status]')).toContainText('來源已變更');
  expect(await page.evaluate(()=>GameState.current.storyDiscussion)).toBeUndefined();
  expect(await page.evaluate(()=>window.__old.storyDiscussion)).toBeUndefined();
  await page.keyboard.press('Escape');await expect(panel).toBeHidden();
});
test('blocked and truncated discussion do not become conversation or memory',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{API.send=async()=>({text:'PARTIAL',finishReason:'MAX_TOKENS'});BAOStoryDiscussion.open();});
  const panel=page.getByRole('dialog',{name:'故事討論',exact:true});
  await panel.locator('[data-question]').fill('問題');await panel.locator('[data-send]').click();
  await expect(panel.locator('[data-status]')).toContainText('截斷');
  expect(await page.evaluate(()=>GameState.current.storyDiscussion)).toBeUndefined();
  await expect(panel.locator('[data-question]')).toHaveValue('問題');
});
