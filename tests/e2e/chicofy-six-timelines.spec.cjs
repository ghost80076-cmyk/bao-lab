const { test, expect } = require('@playwright/test');
for (const width of [390, 1280]) {
  test(`齊格飛六人 3D 轉盤與本地圖片無腳本亦能運作（${width}px）`, async ({page}) => {
    await page.setViewportSize({width,height:844});
    await page.goto('./');
    await page.waitForFunction(() => Boolean(window.BAOAuthorInline && window.BAOAuthorCardBind && App.loadCharacter && App.characters?.length));
    await page.evaluate(async () => {
      const id='jielai-rensheng';
      localStorage.removeItem('bao-lab:author-regex:v1:'+encodeURIComponent(id));
      const character=await App.loadCharacter(id);
      if(!character)throw new Error('Missing official character '+id);
      App.activeCharacter=character;
      App.config={
        narrativeMode:'immersive', displayMode:'text',
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
    await expect(frame.locator('.yb-route-radio')).toHaveCount(6);
    await expect(frame.locator('.yb-route-tab')).toHaveCount(6);
    await expect(frame.locator('.yb-author-send')).toHaveCount(12);
    const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:jielai-rensheng')));
    expect(stored.source).toBe('official-sidecar');
    expect(stored.enabled).toBe(true);
    expect(stored.allowScripts).toBe(false);
    expect(stored.allowExternalAssets).toBe(false);
    await expect(page.locator('iframe[title="聊天內作者隔離介面"]')).toHaveAttribute('sandbox','');
    // All 6 images must load from the same first-party path despite both
    // author-script and third-party image permissions remaining OFF.
    await expect.poll(() => frame.locator('.cd img').evaluateAll(imgs => imgs.every(img =>
      img.complete && img.naturalWidth >= 300 &&
      new URL(img.currentSrc || img.src).pathname.includes('/assets/characters/chicofy-six-timelines/')
    ))).toBe(true);
    const initialN=await frame.locator('.yb-static-rotor').evaluate(el=>getComputedStyle(el).getPropertyValue('--n').trim());
    expect(initialN).toBe('0');
    await frame.locator('.yb-rotor-next.yb-at-0').click();
    await expect(frame.locator('#yb-route-1')).toBeChecked();
    await expect.poll(()=>frame.locator('.yb-static-rotor').evaluate(el=>getComputedStyle(el).getPropertyValue('--n').trim())).toBe('1');
    await expect(frame.locator('.pn.k1')).toBeVisible();
    await frame.locator('.yb-route-tab[for="yb-route-5"]').click();
    await expect(frame.locator('#yb-route-5')).toBeChecked();
    await expect.poll(()=>frame.locator('.yb-static-rotor').evaluate(el=>getComputedStyle(el).getPropertyValue('--n').trim())).toBe('5');
    await expect(frame.locator('.pn.k5')).toBeVisible();
    await frame.locator('.yb-route-tab[for="yb-route-0"]').click();
    await expect(frame.locator('.pn.k0')).toBeVisible();
    await frame.locator('.pn.k0 .yb-author-send').click();
    await expect(page.locator('#user-input')).toHaveValue('');
    const before=await page.evaluate(()=>JSON.stringify({messages:Chat.messages,usage:Chat.usage,state:GameState.current}));
    page.once('dialog', dialog=>dialog.accept());
    await host.getByRole('button',{name:'啟用選角確認'}).click();
    await expect(page.locator('iframe[title="聊天內作者隔離介面"]')).toHaveAttribute('sandbox','allow-scripts');
    const granted=await page.evaluate(()=>JSON.parse(localStorage.getItem('bao-lab:author-regex:v1:jielai-rensheng')));
    expect(granted.allowScripts).toBe(true);
    expect(granted.allowExternalAssets).toBe(false);
    expect(granted.allowStateSharing).toBe(false);
    await frame.locator('.pn.k0 .yb-author-send').click();
    await expect(page.locator('#user-input')).toHaveValue(/我想從美月的故事開始/);
    const after=await page.evaluate(()=>JSON.stringify({messages:Chat.messages,usage:Chat.usage,state:GameState.current}));
    expect(after).toBe(before);
  });
}
