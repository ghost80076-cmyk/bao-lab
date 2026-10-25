const {test,expect}=require('@playwright/test');
for(const width of [1280,390]) {
 test('Enzo romance world UI at '+width,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('./');
  await page.waitForFunction(()=>typeof App!=='undefined'&&App.characters?.length&&window.BAOGameplayUICore);
  const state=await page.evaluate(async()=>{
   const c=await App.loadCharacter('mafia-emperor-enzo');
   App.activeCharacter=c;
   App.config={narrativeMode:'world',displayMode:'ui',persona:{name:'測試玩家',gender:'女性'},memory:{mode:'smart'},api:{type:'custom',model:'offline-test',key:''}};
   Chat.reset();GameState.create(c,App.config);App.renderChatShell(true);App.showView('chat');
   return {npcRules:c.prompt_options.include_npcs,relationship:GameState.current.modules.relationship.stage};
  });
  expect(state.npcRules).toBe(true);
  expect(state.relationship).toBe('陌生人｜初次接觸');
  await expect(page.locator('#chat-stream .bao-structured-opening')).toHaveCount(1);
  const choice=page.locator('#chat-stream .bao-opening-choice').first();
  await choice.click();
  await expect(page.locator('#user-input')).toHaveValue('「你到底是誰？」我沒有立刻答應。');
  const info=page.locator('#bao-play-status-toggle');
  if(await info.getAttribute('aria-expanded')!=='true')await info.click();
  await page.locator('#game-ui .ui-tab[data-panel="scene"]').click();
  await expect(page.locator('#ui-panel')).toContainText('此刻所在');
  await page.evaluate(()=>{GameState.applyUpdate({location:'恩佐的辦公室',time:'翌日 10:15'});BAOGameplayUI.renderPanel('scene');});
  await expect(page.locator('#ui-panel')).toContainText('恩佐的辦公室');
  await expect(page.locator('#ui-panel')).toContainText('翌日 10:15');
  await expect(page.locator('#ui-panel')).toContainText('此刻所在');
  expect(await page.locator('#ui-panel').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
 });
}
