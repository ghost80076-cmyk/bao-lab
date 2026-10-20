const {test, expect} = require('@playwright/test');
for (const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test('喬以寧 native state, draft choices and note display at '+viewport.width, async ({page}) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await page.waitForFunction(() => typeof App !== 'undefined' && window.BAOGameplayUI && window.BAOAuthorInline && App.characters?.length);
    await page.evaluate(async () => {
      while (!App.characters.some(c=>c.id==='qiao-yining-nonexistent-boyfriend') && App.communityCatalogCursor>=0) await App.loadMoreCharacters();
      const c = await App.loadCharacter('qiao-yining-nonexistent-boyfriend');
      if (!c) throw new Error('catalog load failed');
      App.activeCharacter=c;
      App.config={narrativeMode:'world',displayMode:'ui',persona:{name:'測試玩家'},api:{type:'custom',model:'offline-test',baseUrl:'',key:''},memory:{mode:'smart'}};
      window.qiaoRequests=0;
      API.send=async()=>{qiaoRequests++;throw new Error('must not send');};
      Chat.reset();GameState.create(c,App.config);
      App.renderChatShell(true);App.showView('chat');
      BAOGameplayUI.syncTabs();BAOGameplayUI.activateInitialPanel();
    });
    const opening=page.locator('#chat-stream .bao-structured-opening');
    await expect(opening).toBeVisible();
    await expect(page.locator('#chat-stream .bao-author-inline')).toHaveCount(0);
    await expect(opening).toContainText('看夠了嗎');
    await expect(opening).not.toContainText('【YB:');
    await expect(opening.locator('.bao-opening-choice')).toHaveCount(4);
    const background=await page.locator('#chat-view').evaluate(el=>el.style.getPropertyValue('--chat-bg-image'));
    expect(background).toContain('/assets/community/qiao-yining-nonexistent-boyfriend.webp');
    expect(background).not.toContain('/css/assets/');
    await opening.locator('.bao-opening-choice').first().click();
    await expect(page.locator('#user-input')).toHaveValue('我看向她壓住的筆記本，問：「Good girl，也是工作資料？」');
    expect(await page.evaluate(()=>qiaoRequests)).toBe(0);
    await page.locator('#user-input').fill('');
    const toggle=page.locator('#bao-play-status-toggle');
    if (await toggle.getAttribute('aria-expanded')!=='true') await toggle.click();
    for (const id of ['now','clues','life','between']) {
      await page.locator('#game-ui .ui-tab[data-panel="'+id+'"]').click();
      await expect(page.locator('#ui-panel')).not.toContainText('男朋友不存在');
      await expect(page.locator('#ui-panel')).not.toContainText('私人筆記與BDSM幻想有關');
    }
    await page.evaluate(()=>{
      GameState.applyUpdate({modules:{visible:{action:'合上筆記，起身倒茶'},private:{trust:'略微提高'}}});
      BAOGameplayUI.renderPanel('now');
    });
    await expect(page.locator('#ui-panel')).toContainText('合上筆記，起身倒茶');
    await expect(page.locator('#ui-panel')).not.toContainText('略微提高');
    await page.evaluate(()=>{
      Chat.add('assistant','她把筆記推過來。\n【YB:QIAO:NOTE】\nPermission：先問過我。\n【/YB:QIAO:NOTE】\n雨仍在下。');
      App.renderChatShell(false);
    });
    const frame=page.frameLocator('iframe[title="聊天內作者隔離介面"]');
    await expect(frame.locator('[aria-label="私人筆記"]')).toBeVisible();
    await expect(frame.locator('body')).toContainText('雨仍在下');
    await expect(frame.locator('body')).not.toContainText('【YB:');
    expect(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
    await page.evaluate(()=>{App.config.displayMode='text';App.renderChatShell(true);});
    await expect(page.locator('#chat-stream')).toContainText('看夠了嗎');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  });
}
