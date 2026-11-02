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
  await page.locator('[data-story-control-action="discussion"]').click();
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
  const geometry=await split.evaluate(el=>({header:el.querySelector('header').getBoundingClientRect().top,bodyBottom:el.querySelector('[data-body]').getBoundingClientRect().bottom,statusTop:el.querySelector('[data-status]').getBoundingClientRect().top}));
  expect(geometry.header).toBeGreaterThanOrEqual(0);expect(geometry.bodyBottom).toBeLessThanOrEqual(geometry.statusTop+2);
  await page.screenshot({path:testInfo.outputPath('setting-split.png')});
  expect(applied.world).toBe('玩家編輯後的背景');expect(applied.persona.extra).toBeUndefined();expect(applied.actors.some(a=>a.name==='凜')).toBe(false);expect(applied.messages).toBe(2);
});
test('late discussion cannot write into another story',async({page})=>{
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

test('closing aborts a discussion request and releases only its own maintenance lock',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    API.send=async config=>new Promise((resolve,reject)=>{
      window.__signal=config.signal;
      config.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true});
    });
    BAOStoryDiscussion.open();
  });
  const panel=page.getByRole('dialog',{name:'故事討論',exact:true});
  await panel.locator('[data-question]').fill('問題');await panel.locator('[data-send]').click();
  await page.waitForFunction(()=>Boolean(window.__signal));
  expect(await page.evaluate(()=>BAOStoryMaintenanceLock.has(GameState.current))).toBe(true);
  await panel.locator('[data-close]').click();
  await page.waitForFunction(()=>window.__signal.aborted && !BAOStoryMaintenanceLock.has(GameState.current));
  expect(await page.evaluate(()=>GameState.current.storyDiscussion)).toBeUndefined();
});
test('failed discussion save retains its result and retries without another provider call',async({page})=>{
  await setup(page);
  await page.evaluate(()=>{
    window.__flush=Storage.flush.bind(Storage);
    Storage.flush=async()=>{throw new Error('模擬保存失敗');};
    BAOStoryDiscussion.open();
  });
  const panel=page.getByRole('dialog',{name:'故事討論',exact:true});
  await panel.locator('[data-question]').fill('問題');await panel.locator('[data-send]').click();
  await expect(panel.locator('[data-status]')).toContainText('模擬保存失敗');
  await expect(panel.locator('[data-log]')).toContainText('建議先調查燈塔');
  expect(await page.evaluate(()=>window.__requests.length)).toBe(1);
  await page.evaluate(()=>{Storage.flush=window.__flush;});
  await panel.locator('[data-retry-save]').click();await expect(panel.locator('[data-status]')).toContainText('已確認保存');
  expect(await page.evaluate(()=>window.__requests.length)).toBe(1);
  expect(await page.evaluate(()=>Storage.loadStory().state.storyDiscussion.messages.length)).toBe(2);
});

test('the import preview starts splitting and retains its external source across reload',async({page})=>{
  await setup(page);
  await page.evaluate(()=>BAOStoryTools.open());
  await page.locator('[data-story-desk-more] > summary').click();
  await page.locator('[data-external]').click();
  const messages=[{role:'user',content:'EXTERNAL_SOURCE_ONLY 玩家身分'},{role:'assistant',content:'外部故事的世界背景'}];
  await page.locator('[data-file]').setInputFiles({name:'import.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({messages}))});
  await page.locator('[data-split-settings]').click();
  await expect(page.getByRole('dialog',{name:'匯入設定拆分'})).toBeVisible();
  expect(await page.evaluate(()=>BAOContextPackResume.resolveSource(BAOContextPackResume.getSession().source)[0].content)).toContain('EXTERNAL_SOURCE_ONLY');
  await page.evaluate(async()=>{App.saveStory(false);await Storage.flush();});
  await page.reload();
  await page.waitForFunction(async()=>{await Storage.ready();return Boolean(window.BAOStoryDiscussion&&window.BAOContextPackResume&&Storage.loadStory());});
  await page.evaluate(()=>{if(!Storage.restoreStory(Storage.loadStory()))throw new Error('restore failed');App.renderChatShell(false);App.showView('chat');BAOStoryTools.open();});
  await page.locator('[data-story-desk-more] > summary').click();
  await page.locator('[data-edit-draft]').click();
  await page.getByRole('button',{name:'拆分匯入設定',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'匯入設定拆分'})).toBeVisible();
  expect(await page.evaluate(()=>BAOContextPackResume.resolveSource(BAOContextPackResume.getSession().source)[0].content)).toContain('EXTERNAL_SOURCE_ONLY');
});
