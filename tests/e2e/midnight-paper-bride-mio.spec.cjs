const {test, expect} = require('@playwright/test');
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test('雨宮澪 native state and optional record display at '+viewport.width, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => typeof App !== 'undefined' && window.BAOGameplayUI && window.BAOAuthorInline && App.characters?.length);
    await page.evaluate(async () => {
      while (!App.characters.some(c=>c.id==='midnight-paper-bride-mio') && App.communityCatalogCursor>=0) await App.loadMoreCharacters();
      const c = await App.loadCharacter('midnight-paper-bride-mio');
      if (!c) throw new Error('catalog load failed');
      App.activeCharacter=c;
      App.config={narrativeMode:'world',displayMode:'ui',persona:{name:'測試玩家'},api:{type:'custom',model:'offline-test',baseUrl:'',key:''},memory:{mode:'smart'}};
      window.mioRequests=0;
      API.send=async()=>{mioRequests++;throw new Error('must not send');};
      Chat.reset();GameState.create(c,App.config);
      Chat.add('assistant',c.greeting).greeting=true;
      App.renderChatShell(true);App.showView('chat');
      BAOGameplayUI.syncTabs();BAOGameplayUI.activateInitialPanel();
    });
    const opening=page.locator('#chat-stream .bao-structured-opening');
    await expect(opening).toBeVisible();
    await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
    await expect(opening).toContainText('這間店現在是你作主');
    await expect(opening).not.toContainText('【YB:');

    await expect(opening.locator('.bao-opening-choice')).toHaveCount(0);
    expect(await page.evaluate(()=>mioRequests)).toBe(0);
    const toggle=page.locator('#bao-play-status-toggle');
    if (await toggle.getAttribute('aria-expanded')!=='true') await toggle.click();
    for (const id of ['now','clues','life','between']) {
      await page.locator('#game-ui .ui-tab[data-panel="'+id+'"]').click();
      await expect(page.locator('#ui-panel')).not.toContainText('封存間內，未穿戴、未締約');
      await expect(page.locator('#ui-panel')).not.toContainText('反感被封存');
    }
    await page.evaluate(()=>{
      GameState.applyUpdate({modules:{visible:{behavior:'把母帶放回紙袋'},private:{relationship:'略微提高'}}});
    });
    await page.locator('#game-ui .ui-tab[data-panel="now"]').click();
    await expect(page.locator('#ui-panel')).toContainText('把母帶放回紙袋');
    await expect(page.locator('#ui-panel')).not.toContainText('略微提高');
    await page.evaluate(()=>{
      Chat.add('assistant','她把交接簿推過來。\n【YB:MIO:RECORD】\n後堂電視，不要接電。\n【/YB:MIO:RECORD】\n雨仍在下。');
      App.renderChatShell(false);
    });
    const frame=page.frameLocator('iframe[title="聊天內作者隔離介面"]');
    await expect(frame.locator('[aria-label="紙行紀錄"]')).toBeVisible();
    await expect(frame.locator('body')).toContainText('雨仍在下');
    await expect(frame.locator('body')).not.toContainText('【YB:');
    expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
    await page.evaluate(()=>{App.config.displayMode='text';App.renderChatShell(true);});
    await expect(page.locator('#chat-stream')).toContainText('這間店現在是你作主');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });
}
