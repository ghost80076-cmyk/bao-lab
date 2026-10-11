const {test,expect}=require('@playwright/test');
async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(()=>window.BAOStoryTimeline && window.BAOGameplayUI && window.BAOChatMarkup && window.BAOSceneHTML && window.BAOStoryIntegrity);
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
    test('custom inputs and flashback updates preserve the present',async({page})=>{
      await ready(page);
      await page.locator('[data-gameplay-field="start"]').selectOption('自訂');
      await page.locator('[data-gameplay-custom="start"]').fill('北山診所');
      await page.locator('[data-gameplay-field="identity"]').selectOption('自訂');
      await page.locator('[data-gameplay-custom="identity"]').fill('海關顧問');
      await start(page);
      const result=await page.evaluate(()=>{
        const state=GameState.current;
        state.modules.economy.cash=200;
        const before={time:state.time,location:state.location,clock:state.worldClock.tickMinutes,events:JSON.stringify(state.events)};
        BAOStoryTimeline.transition('【回憶】昨日的詢問');
        GameState.applyUpdate({time:'第二夜',location:'港口',new_events:['回憶發現車票'],world_clock:{advance_minutes:90},npcs:[{name:'不應加入'}],modules:{economy:{cash:0},case:{progress:100},timeline:{past_time:'昨日 20:00'}}});
        return {before,after:{time:state.time,location:state.location,clock:state.worldClock.tickMinutes,events:JSON.stringify(state.events)},cash:state.modules.economy.cash,progress:state.modules.case.progress,npcs:state.npcs.length,identity:state.modules.player.identity,past:state.modules.timeline.past_time};
      });
      expect(result.after).toEqual(result.before);
      expect(result.cash).toBe(200);expect(result.progress).toBe(0);expect(result.npcs).toBe(0);
      expect(result.identity).toBe('海關顧問');expect(result.past).toBe('昨日 20:00');
      expect(await page.evaluate(()=>BAOStoryTimeline.transition('【回到現在】'))).toBe(true);
    });
  });
}
