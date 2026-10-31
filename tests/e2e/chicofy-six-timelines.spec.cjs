const { test, expect } = require('@playwright/test');
for(const width of [390,1280]){
  test(`齊格飛借來的人生：正式卡載入、六線轉盤與授權草稿（${width}px）`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('./');
    await page.waitForFunction(()=>Boolean(window.BAOAuthorInline && window.BAOAuthorCardBind && App.loadCharacter && App.characters?.length));
    await page.evaluate(async()=>{
      const id='jielai-rensheng';
      localStorage.removeItem('bao-lab:author-regex:v1:'+encodeURIComponent(id));
      const character=await App.loadCharacter(id);
      if(!character)throw new Error('Missing official character '+id);
      App.activeCharacter=character;
      App.config={
        narrativeMode:'immersive',displayMode:'text',
        persona:{name:'測試玩家',gender:'未指定',identity:'',personality:'',relationship:'',extra:''},
        api:{type:'custom',protocol:'openai',model:'offline-test',baseUrl:'',key:''},
        memory:{mode:'smart',maxRounds:20,maxContext:32000,cache:false}
      };
      Chat.reset();GameState.create(App.activeCharacter,App.config);
      App.renderChatShell(true);App.showView('chat');
    });
    const host=page.locator('#chat-stream .bao-author-inline');
    await expect(host).toHaveCount(1);
    const frame=page.frameLocator('iframe[title="聊天內作者隔離介面"]');
    await expect(frame.locator('.yb-author-welcome')).toBeVisible();
    await expect(frame.locator('.cd img')).toHaveCount(6);
    await expect(frame.locator('.yb-author-send')).toHaveCount(12);
    const settings=await page.evaluate(()=>JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:jielai-rensheng')));
    expect(settings.source).toBe('official-sidecar');
    expect(settings.enabled).toBe(true);
    expect(settings.allowScripts).toBe(false);
    await expect(page.locator('iframe[title="聊天內作者隔離介面"]')).toHaveAttribute('sandbox','');
    await frame.locator('.yb-author-send').first().click();
    await expect(page.locator('#user-input')).toHaveValue('');
    const before=await page.evaluate(()=>JSON.stringify({messages:Chat.messages,usage:Chat.usage,state:GameState.current}));
    await page.evaluate(()=>{
      const key='bao-lab:author-regex:v1:jielai-rensheng';
      const cfg=JSON.parse(localStorage.getItem(key));
      cfg.allowScripts=true;localStorage.setItem(key,JSON.stringify(cfg));
      // This test sets the opt-in config directly; the real settings UI fires a change event.
      // Request the same inline renderer refresh explicitly after updating this mocked consent.
      window.BAOAuthorInline.refresh();
    });
    await expect(page.locator('iframe[title="聊天內作者隔離介面"]')).toHaveAttribute('sandbox','allow-scripts');
    await frame.locator('.yb-author-send').first().click();
    await expect(page.locator('#user-input')).toHaveValue(/我想從美月的故事開始/);
    const after=await page.evaluate(()=>JSON.stringify({messages:Chat.messages,usage:Chat.usage,state:GameState.current}));
    expect(after).toBe(before);
  });
}
