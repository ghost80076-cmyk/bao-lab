const {test,expect}=require('@playwright/test');
async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(()=>window.BAOStoryTimeline && window.BAOGameplayUI && window.BAOChatMarkup && window.BAOSceneHTML && window.BAOStoryIntegrity && window.YoruWorldbookLibrary);
  await page.evaluate(async()=>{
    const raw=await (await fetch('data/characters/community/73/sunrise-city-disorder.json')).json();
    App.activeCharacter=CharacterEngine.normalize(raw);
    App.characters.push(App.activeCharacter);
    App.openBuilder();App.setStep(3);
  });
}
async function start(page) {
  await page.evaluate(()=>{
    const collect=App.collectConfig.bind(App);
    App.collectConfig=()=>({...collect(),displayMode:'ui',narrativeMode:'world',api:{type:'custom',protocol:'openai',model:'deterministic-test',baseUrl:'https://test.invalid/v1',key:'fake-test-key'}});
    window.sunriseRequests=0;API.send=async()=>{window.sunriseRequests++;return {text:'雨聲持續。',usage:{}};};
    App.startStory();
  });
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
}
for(const [device,viewport] of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]) {
  test.describe(device,()=>{
    test.use({viewport});
    test('creation hands off once, actions draft only, and selected opening survives catalog restore',async({page})=>{
      await ready(page);
      await expect(page.locator('#bao-gameplay-builder')).toBeVisible();
      await page.locator('[data-gameplay-field="route"]').selectOption('自創勢力路線');
      await start(page);
      const opening=page.locator('#chat-stream .bao-structured-opening');
      await expect(opening).toContainText('租約');
      await expect(opening).not.toContainText('創建');
      await expect(opening).not.toContainText('YB:SUNRISE');
      await expect(page.locator('#bao-gameplay-dashboard-right')).toContainText('未知 / 100');
      await opening.locator('[data-bao-opening-choice]').first().click();
      await expect(page.locator('#user-input')).toHaveValue('我先觀察現場的人與物。');
      expect(await page.evaluate(()=>sunriseRequests)).toBe(0);
      await page.evaluate(()=>{
        GameState.current.npcs.push({name:'調查員',role:'警探',mood:'皺眉',relationship:'初識',location:'警局',presence:'present',notes:'不應公開的幕後動機'});
        BAOGameplayUI.renderPanel('player');
      });
      await expect(page.locator('#ui-panel')).toContainText('調查員');
      await expect(page.locator('#ui-panel')).toContainText('皺眉');
      await expect(page.locator('#ui-panel')).not.toContainText('不應公開的幕後動機');
      const restored=await page.evaluate(()=>{
        const payload=Storage.buildStoryPayload();
        const selected=App.activeCharacter.greeting;
        App.characters=App.characters.map(c=>c.id===App.activeCharacter.id?{...c,greeting:'generic catalog greeting',opening:null}:c);
        const ok=Storage.restoreStory(payload);
        App.renderChatShell(false);
        return {ok,same:App.activeCharacter.greeting===selected,location:GameState.current.location};
      });
      expect(restored).toEqual({ok:true,same:true,location:'東區平民區｜組織據點'});
      await expect(page.locator('#chat-stream .bao-structured-opening')).toContainText('租約');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
    });
    test('companion chapters recall individually, save pins revisions and opt-out persists',async({page})=>{
      await ready(page); await start(page);
      const result=await page.evaluate(async()=>{
        const binding=GameState.current.worldbookLibrary;
        GameState.current.location='未設定';
        const before=(await App.buildMessages())[0].content;
        Chat.add('user','我研究冰系異能。');
        const messages=await App.buildMessages();
        const payload=Storage.buildStoryPayload();
        const ok=Storage.restoreStory(payload);
        const savedCount=Object.values(GameState.current.worldbookLibrary.pinned).flatMap(p=>p.entries).length;
        GameState.current.worldbookLibrary.enabled=[];
        const offPayload=Storage.buildStoryPayload();
        Storage.restoreStory(offPayload);
        const off=await App.buildMessages();
        return {before,after:messages[0].content,count:binding.enabled.length,chapters:savedCount,ok,same:messages[0].content===before,
          ice:messages.at(-1).content.includes('冰霜領域'),fire:messages.at(-1).content.includes('火焰製造'),
          copies:(messages.at(-1).content.match(/冰霜領域/g)||[]).length,
          disabled:GameState.current.worldbookLibrary.enabled.length,off:off.at(-1).content.includes('冰霜領域')};
      });
      expect(result.after).toBe(result.before);
      delete result.before;delete result.after;
      expect(result).toEqual({count:36,chapters:172,ok:true,same:true,ice:true,fire:false,copies:1,disabled:0,off:false});
      const legacy=await page.evaluate(()=>{
        const payload=Storage.buildStoryPayload();
        delete payload.state.worldbookLibrary;delete payload.character.initial_state.worldbookLibrary;
        payload.character.lore='【世界書：舊版配套｜監獄】舊存檔的資料【/世界書】';
        const ok=Storage.restoreStory(payload);
        return {ok,lore:App.activeCharacter.lore,has:!!GameState.current.worldbookLibrary};
      });
      expect(legacy).toEqual({ok:true,lore:'【世界書：舊版配套｜監獄】舊存檔的資料【/世界書】',has:false});
    });
    test('custom inputs and flashback updates preserve the present',async({page})=>{
      await ready(page);
      await page.locator('[data-gameplay-field="start"]').selectOption('自訂');
      await page.locator('[data-gameplay-custom="start"]').fill('北山診所');
      await page.locator('[data-gameplay-field="identity"]').selectOption('自訂');
      await page.locator('[data-gameplay-custom="identity"]').fill('海關顧問');
      await start(page);
      const result=await page.evaluate(async()=>{
        const state=GameState.current;
        state.modules.economy.cash=200;
        const before={time:state.time,location:state.location,clock:state.worldClock.tickMinutes,events:JSON.stringify(state.events)};
        const stableBefore=(await App.buildMessages())[0].content;
        BAOStoryTimeline.transition('【回憶】昨日的詢問');
        GameState.applyUpdate({time:'第二夜',location:'港口',new_events:['回憶發現車票'],world_clock:{advance_minutes:90},npcs:[{name:'不應加入'}],modules:{economy:{cash:0},case:{progress:100},timeline:{past_time:'昨日 20:00'}}});
        const pastMessages=await App.buildMessages();
        const stableAfter=pastMessages[0].content;
        return {stableSame:stableBefore===stableAfter,frameDynamic:pastMessages.at(-1).content.includes('【當前回憶框架】'),frameInStable:stableAfter.includes('【當前回憶框架】'),before,after:{time:state.time,location:state.location,clock:state.worldClock.tickMinutes,events:JSON.stringify(state.events)},cash:state.modules.economy.cash,progress:state.modules.case.progress,npcs:state.npcs.length,identity:state.modules.player.identity,past:state.modules.timeline.past_time};
      });
      expect(result.stableSame).toBe(true);expect(result.frameDynamic).toBe(true);expect(result.frameInStable).toBe(false);
      expect(result.after).toEqual(result.before);
      expect(result.cash).toBe(200);expect(result.progress).toBe(0);expect(result.npcs).toBe(0);
      expect(result.identity).toBe('海關顧問');expect(result.past).toBe('昨日 20:00');
      expect(await page.evaluate(()=>BAOStoryTimeline.transition('【回到現在】'))).toBe(true);
    });
  });
}
