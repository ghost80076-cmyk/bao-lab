const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });
for (const width of [1440, 390]) {
  test(`work titles never become NPCs or status subjects at ${width}px`, async ({page}) => {
    test.setTimeout(180000);
    page.setDefaultTimeout(15000);
    if (process.env.BAO_LIVE_URL) {
      await expect.poll(async () => (await page.request.get('js/character-status.js?title-fix=' + Date.now())).text(), {timeout:120000,intervals:[5000]}).toContain('const isWorkTitleName');
    }
    await page.setViewportSize({width,height:844});
    await page.goto('./');
    await page.waitForFunction(() => window.BAOCharacterStatusUI && window.BAOStorySurface && App.characters?.length);
    for (const id of ['spicy-89-girl', 'awakened-silver-dawn', 'linchenfeng']) {
      const snapshot = await page.evaluate(async id => {
        const c = await App.loadCharacter(id);
        if (!c) throw new Error(id + ': missing card');
        App.activeCharacter = c;
        App.config = {narrativeMode:'world',displayMode:'ui',persona:{name:'測試玩家'},api:{model:'offline-test',key:'',baseUrl:''},memory:{mode:'smart',maxRounds:20,maxContext:32000}};
        Chat.reset(); GameState.create(c,App.config);
        const fakeTitle = c.title === c.name ? c.name : c.title;
        const validName = '新登場人物';
        GameState.applyUpdate({npcs:[{name:fakeTitle,status:{mood:'誤建'}},{name:validName,role:'路人'}],character_statuses:{[fakeTitle]:{mood:'誤建'}}});
        // Simulate a polluted existing save rather than only a fresh story.
        GameState.current.npcs.push({name:fakeTitle,role:'誤建'});
        GameState.current.characterStatuses[fakeTitle]={mood:'舊資料'};
        BAOCharacterStatus.ensureState(c);
        App.renderChatShell(false); App.showView('chat');
        BAOStorySurface.openStatus(); App.renderUIPanel('npc');
        return {fakeTitle, validName,names:BAOCharacterStatus.npcRoster().map(n=>n.name),statuses:BAOCharacterStatus.statusNames(c)};
      }, id);
      expect(snapshot.names, id).not.toContain(snapshot.fakeTitle);
      expect(snapshot.statuses, id).not.toContain(snapshot.fakeTitle);
      expect(snapshot.names).toContain(snapshot.validName);
      if (id === 'linchenfeng') expect(snapshot.names).toContain('林沉風');
      const info = page.locator('#bao-play-status-toggle');
      if (await info.getAttribute('aria-expanded') !== 'true') await info.click();
      await page.locator('#game-ui .ui-tab[data-panel="npc"]').click();
      await page.locator('[data-npc-roster-open]').click();
      const roster = page.getByRole('dialog',{name:'NPC 名冊／場景參與者'});
      await expect(roster).toBeVisible();
      await expect(roster.locator('.npc-roster-row b')).not.toContainText([snapshot.fakeTitle]);
      await expect(roster).toContainText(snapshot.validName);
      await roster.getByRole('button', {name:'關閉',exact:true}).click();
    }
  });
}
