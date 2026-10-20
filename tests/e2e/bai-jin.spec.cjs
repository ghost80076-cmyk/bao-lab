const {test, expect} = require('@playwright/test');
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test('白燼 opening, visible state and display Regex at '+viewport.width, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => typeof App !== 'undefined' && window.BAOGameplayUI && window.BAOAuthorInline && App.characters?.length);
    await page.evaluate(async () => {
      while (!App.characters.some(c=>c.id==='bai-jin-ash-companion') && App.communityCatalogCursor>=0) await App.loadMoreCharacters();
      const c = await App.loadCharacter('bai-jin-ash-companion');
      if (!c) throw new Error('catalog load failed');
      App.activeCharacter=c;
      App.config={narrativeMode:'world',displayMode:'ui',persona:{name:'測試玩家'},api:{type:'custom',model:'offline-test',baseUrl:'',key:''},memory:{mode:'smart'}};
      window.baiRequests=0;
      API.send=async()=>{baiRequests++;throw new Error('must not send');};
      Chat.reset();GameState.create(c,App.config);
      Chat.add('assistant',c.greeting).greeting=true;
      App.renderChatShell(true);App.showView('chat');
      BAOGameplayUI.syncTabs();BAOGameplayUI.activateInitialPanel();
    });
    const opening=page.locator('#chat-stream .bao-structured-opening');
    await expect(opening).toBeVisible();
    await expect(opening).toContainText('看吊墜，還是看我');
    await expect(opening.locator('.bao-opening-choice')).toHaveCount(3);
    await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
    const background=await page.locator('#chat-view').evaluate(el=>el.style.getPropertyValue('--chat-bg-image'));
    expect(background).toContain('/assets/community/bai-jin-ash-companion.webp');
    await opening.locator('.bao-opening-choice').first().click();
    await expect(page.locator('#user-input')).toHaveValue('我留意樓下的聲音，問她：「那是什麼？這裡安全嗎？」');
    expect(await page.evaluate(()=>baiRequests)).toBe(0);
    const toggle=page.locator('#bao-play-status-toggle');
    if (await toggle.getAttribute('aria-expanded')!=='true') await toggle.click();
    await page.screenshot({path:test.info().outputPath('bai-jin-'+viewport.width+'.png'),fullPage:true});
    for (const id of ['now','survival','threads']) {
      await page.locator('#game-ui .ui-tab[data-panel="'+id+'"]').click();
      await expect(page.locator('#ui-panel')).not.toContainText('黎雪');
      await expect(page.locator('#ui-panel')).not.toContainText('E-00');
    }
    await page.evaluate(()=>GameState.applyUpdate({modules:{visible:{action:'收好地圖，檢查窗外'},private:{trust:'測試秘密狀態'}}}));
    await page.locator('#game-ui .ui-tab[data-panel="now"]').click();
    await expect(page.locator('#ui-panel')).toContainText('收好地圖，檢查窗外');
    await expect(page.locator('#ui-panel')).not.toContainText('測試秘密狀態');
    await page.evaluate(()=>{
      Chat.add('assistant','她將紙條推過來。\n【YB:BAIJIN:NOTE】向北走，別走地下道。\n【/YB:BAIJIN:NOTE】\n窗外雨停了。');
      App.renderChatShell(false);
    });
    const frame=page.frameLocator('iframe[title="聊天內作者隔離介面"]');
    await expect(frame.locator('[aria-label="拾得紙條"]')).toBeVisible();
    await expect(frame.locator('body')).toContainText('窗外雨停了');
    await expect(frame.locator('body')).not.toContainText('【YB:');
    expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
    await page.evaluate(()=>{App.config.displayMode='text';App.renderChatShell(true);});
    await expect(page.locator('#chat-stream')).toContainText('看吊墜，還是看我');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });
}
