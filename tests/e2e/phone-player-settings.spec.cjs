const {test,expect}=require('@playwright/test');
async function story(page, authored=false) {
  await page.goto('/');
  await page.waitForFunction(()=>window.BAOPhonePlayerSettings && window.BAOPhonePlayerCore &&
    window.BAOPhoneStoryBridge && App.characters?.length);
  await page.evaluate(authored=>{
    App.activeCharacter=CharacterEngine.normalize({
      id:'phone-player-story',name:'既有故事測試',system_prompt:'照常寫故事',greeting:'玩家回到房間。',
      supported_modes:{immersive:true,world:true},
      phone_ui:authored ? {enabled:true,userName:'作者預設主人',contactName:'作者聯絡人',
        chat:[{text:'作者早安',from:'them'}],tweets:['作者貼文']} : null
    });
    App.config={narrativeMode:'world',displayMode:'text',persona:{name:'玩家',gender:'未指定'},
      api:{model:'mock',baseUrl:'https://example.invalid',key:'test'},
      memory:{maxRounds:20,maxContext:32000,mode:'rounds',cache:true}};
    GameState.create(App.activeCharacter,App.config);
    Chat.reset();App.renderChatShell(false);App.showView('chat');
  },authored);
  await expect(page.locator('#bao-phone-player-entry')).toHaveCount(1);
}
test('legacy saved story can opt into phone, persist through restore, then opt out',async({page})=>{
  await story(page);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  await page.locator('#bao-phone-player-entry').click();
  const modal=page.getByRole('dialog',{name:'故事手機介面設定'});
  await expect(modal).toBeVisible();
  await modal.locator('[name="enabled"]').check();
  await modal.locator('[name="userName"]').fill('未知主人的手機');
  await modal.locator('[name="contactName"]').fill('阿晴');
  await modal.getByRole('button',{name:'儲存手機設定'}).click();
  await expect(page.locator('#bao-phone-launch')).toHaveCount(1);
  const output=await page.evaluate(()=>{
    const raw=App.buildSystemPrompt();
    App.saveStory(false);
    const snap=Storage.loadStory();
    const original=App.activeCharacter.phone_ui;
    return {raw,snap,original};
  });
  expect(output.raw).toContain('手機主人：未知主人的手機');
  expect(output.raw).toContain('主要聯絡人：阿晴');
  expect(output.snap.state.phoneSurface.enabled).toBe(true);
  expect(output.original).toBeNull();
  await page.locator('#bao-phone-launch').click();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-kakao').click();
  await expect(page.locator('.bp-friend').last()).toContainText('阿晴');
  await page.keyboard.press('Escape');
  await page.evaluate(snap=>{
    GameState.current={time:'其他故事'};
    App.activeCharacter=CharacterEngine.normalize({id:'other',name:'其他故事',greeting:'另一個故事',system_prompt:'x'});
    App.renderChatShell(false);App.showView('chat');
    Storage.restoreStory(snap);
    App.renderChatShell(false);App.showView('chat');
  },output.snap);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(1);
  await page.locator('#bao-phone-player-entry').click();
  await modal.locator('[name="enabled"]').uncheck();
  await modal.getByRole('button',{name:'儲存手機設定'}).click();
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  const disabled=await page.evaluate(()=>({phoneSurface:GameState.current.phoneSurface,
    prompt:App.buildSystemPrompt(),card:App.activeCharacter.phone_ui}));
  expect(disabled.phoneSurface.enabled).toBe(false);
  expect(disabled.prompt).not.toContain('【作品手機動態');
  expect(disabled.card).toBeNull();
});
test('existing author phone can be disabled and restored in just this story',async({page})=>{
  await story(page,true);
  await expect(page.locator('#bao-phone-launch')).toHaveCount(1);
  await page.locator('#bao-phone-player-entry').click();
  const modal=page.getByRole('dialog',{name:'故事手機介面設定'});
  await modal.locator('[name="enabled"]').uncheck();
  await modal.getByRole('button',{name:'儲存手機設定'}).click();
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  await page.locator('#bao-phone-player-entry').click();
  await modal.getByRole('button',{name:'恢復作品預設'}).click();
  await expect(page.locator('#bao-phone-launch')).toHaveCount(1);
  const state=await page.evaluate(()=>({override:GameState.current.phoneSurface,authored:App.activeCharacter.phone_ui}));
  expect(state.override).toBeUndefined();
  expect(state.authored.chat[0].text).toBe('作者早安');
});
test('player-defined phone gets story events with no author card and stays isolated across stories',async({page})=>{
  await story(page);
  await page.locator('#bao-phone-player-entry').click();
  const modal=page.getByRole('dialog',{name:'故事手機介面設定'});
  await modal.locator('[name="enabled"]').check();
  await modal.locator('[name="userName"]').fill('林曼');
  await modal.locator('[name="contactName"]').fill('小夏');
  await modal.getByRole('button',{name:'儲存手機設定'}).click();
  const state=await page.evaluate(()=>{
    const token=BAOPhoneStoryCore;
    Chat.add('user','我查看手機');
    Chat.add('assistant','訊息響起。'+token.OPEN+'{"chat":[{"from":"them","text":"今天見嗎？"}]}' +token.CLOSE);
    App.saveStory(false);
    return {result:GameState.current.phoneUI?.chat[0]?.text,
      saved:Storage.loadStory()?.state?.phoneUI?.chat[0]?.text};
  });
  expect(state.result).toBe('今天見嗎？');
  expect(state.saved).toBe('今天見嗎？');
  await page.locator('#bao-phone-launch').click();
  await page.locator('.bp-home-handle').click();
  await page.locator('.bp-apps .bp-icon-kakao').click();
  await page.locator('.bp-friend').last().click();
  await expect(page.locator('.bp-thread')).toContainText('今天見嗎？');
  await page.keyboard.press('Escape');
  await page.evaluate(()=>{
    App.activeCharacter=CharacterEngine.normalize({id:'other-story',name:'新作品',greeting:'開場',system_prompt:'設定'});
    GameState.create(App.activeCharacter,App.config);Chat.reset();
    App.renderChatShell(false);App.showView('chat');
  });
  await expect(page.locator('#bao-phone-launch')).toHaveCount(0);
  await expect(page.locator('#bao-phone-player-entry')).toHaveCount(1);
});
test('mobile navigation can find phone settings without inflating the 320px story header',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await story(page);
  const header=await page.locator('#chat-view .chat-topline').evaluate(node=>node.getBoundingClientRect().height);
  expect(header).toBeLessThan(90);
  await expect(page.locator('#bao-phone-player-entry')).toBeHidden();
  await page.locator('#bao-mobile-composer-tools').click();
  const drawer=page.locator('#bao-chat-tool-drawer');
  await expect(drawer).toBeVisible();
  const scene=drawer.locator('[data-chat-tool-group="scene"]');
  await scene.locator('summary').click();
  await expect(scene.getByRole('button',{name:'📱 手機設定'})).toBeVisible();
  await scene.getByRole('button',{name:'📱 手機設定'}).click();
  await expect(page.getByRole('dialog',{name:'故事手機介面設定'})).toBeVisible();
});
