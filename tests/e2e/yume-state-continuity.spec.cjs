const {test,expect}=require('@playwright/test');
const card=require('../../data/characters/general/kurobane-yume-kabukicho.json');

test('old Yume state stays a snapshot and legacy CHAR does not leak on redraw',async({page})=>{
  await page.goto('/');
  await page.waitForFunction(()=>Boolean(window.BAOYumeArchiveCore?.stripCharacterMarkers &&
    window.BAOSceneHTML && window.BAOPromptOrchestrator && window.BAOCharacterStatusUI &&
    window.BAOWorldRelevance && window.BAOStoryReader && App.prompts?.world));
  const raw='[NARRATION]\n雨聲。\n[CHAR:yume]\n「便利店有熱飲。」\n[SCENE:communication]\n[NARRATION]\n門已關上。';
  const result=await page.evaluate(async({card,raw})=>{
    card.gameplay.character_status.fields.forEach(field=>{
      if(['action','location'].includes(field.key))field.context='core';
    });
    card.gameplay.initial_state.character_statuses['黑羽ゆめ'].known_information='玩家在店門外；未確認彼此關係';
    card.content.author_instructions+='才附加 [CHAR:yume]可觀察動態[/CHAR]、[PHONE:yume]訊息[/PHONE]';
    App.activeCharacter=CharacterEngine.normalize(card);
    App.config={...App.config,narrativeMode:'world',displayMode:'ui',persona:{name:'測試玩家',gender:'未指定'},
      memory:{mode:'rounds',maxRounds:10},api:{type:'lmstudio',model:'mock-local',baseUrl:'http://localhost:1234/v1',key:'BAO_LOCAL_NO_AUTH'},cost:{stateInterval:3}};
    GameState.create(App.activeCharacter,App.config);
    Chat.reset();
    Chat.add('user','我走進便利店。');
    Chat.add('assistant',raw);
    Chat.add('user','我已經在店裡，走到熱飲櫃。');
    BAOCharacterStatus.toggleContextCharacter('黑羽ゆめ');
    BAOSceneHTML.prefs.mode='efficient';
    const request=await App.buildMessages(App.config);
    App.renderChatShell(false);
    App.showView('chat');
    BAOSceneHTML.refresh();
    return {request,raw:Chat.messages[1].content};
  },{card,raw});
  expect(result.raw).toBe(raw);
  expect(result.request[0].content).toContain('【狀態時序】');
  expect(result.request[0].content).not.toContain('玩家在店門外');
  expect(result.request[0].content).not.toContain('[CHAR:yume]');
  expect(result.request.at(-1).content).toContain('上次整理的人物快照');
  expect(result.request.at(-1).content).toContain('我已經在店裡，走到熱飲櫃。');
  const bubble=page.locator('#chat-stream > .message.assistant').last().locator('.bubble');
  for(const passage of ['雨聲。','便利店有熱飲。','門已關上。'])await expect(bubble).toContainText(passage);
  await expect(bubble).not.toContainText('[CHAR:yume]');
  await expect(bubble).not.toContainText('[NARRATION]');
  await page.evaluate(()=>{BAOSceneHTML.prefs.mode='native';App.renderChatShell(false);BAOSceneHTML.refresh();});
  await expect(bubble).not.toContainText('[CHAR:yume]');
  await expect(bubble).toContainText('門已關上。');
});
