const { test, expect } = require('@playwright/test');

async function prepare(page,width) {
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  await page.waitForFunction(()=>window.BAOExtensionLoadHealth?.snapshot().story==='ready' &&
    window.BAOChapterMemoryWorkbench && window.BAOChapterMemoryWorkflow &&
    window.BAOStorageWriteGuard && Storage.status().ready && App.characters?.length);
  await page.evaluate(()=>{
    App.activeCharacter={...App.characters[0],id:'chapter-manual-e2e',name:'艾琳',greeting:'燈還亮著。'};
    App.config={
      persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',
      api:{model:'mock'},memory:{mode:'smart',maxRounds:20,maxContext:32000}
    };
    GameState.create(App.activeCharacter,App.config);
    GameState.current.npcs=[{npc_id:'erin',name:'艾琳',aliases:['琳'],presence:'present'}];
    Chat.reset();
    Chat.add('assistant','燈還亮著。');
    for(let i=1;i<=45;i++){
      Chat.add('user','第'+i+'輪，我問港口的信去了哪裡。');
      Chat.add('assistant','第'+i+'輪，艾琳說仍在調查，不會告知不在場的人。');
    }
    App.renderChatShell(false);
    App.showView('chat');
    BAOMemoryWorkbench.open();
  });
}

for(const width of [390,1280]){
  test('reviewed chapter stays story-local, is durable and fails closed after source edit ('+width+'px)',async({page})=>{
    await prepare(page,width);
    const desk=page.getByRole('dialog',{name:'記憶工作台'});
    await expect(desk).toBeVisible();
    await expect(desk.locator('.memory-desk-tab:not([hidden])')).toHaveCount(4);
    await desk.locator('.memory-desk-tab[data-tab="chapters"]').click();
    const pane=desk.locator('[data-pane="chapters"]');
    await expect(pane).toBeVisible();
    expect(await page.evaluate(()=>GameState.current.chapterMemory)).toBeUndefined();
    await pane.locator('[data-chapter-range]').selectOption('1:41');
    await pane.locator('.chapter-memory-source summary').click();
    await expect(pane.locator('[data-chapter-source]')).toContainText('第1輪，我問港口');
    await pane.locator('[data-chapter-text]').fill('艾琳和旅人調查港口舊信，秘密只由艾琳掌握。');
    await pane.locator('[data-chapter-keywords]').fill('港口、舊信、秘密');
    await pane.locator('[data-chapter-scope]').selectOption('actors');
    await pane.locator('[data-chapter-actors]').fill('琳');
    await pane.locator('[data-chapter-approval]').check();
    await pane.locator('[data-chapter-submit]').click();
    await expect(pane.locator('[data-chapter-status]')).toContainText('已確認保存');
    await expect(pane.locator('.chapter-memory-record')).toHaveCount(1);
    const facts=await page.evaluate(()=>({
      runtime:GameState.current.chapterMemory?.chapters?.length,
      disk:Storage.loadStory()?.state?.chapterMemory?.chapters?.length,
      bytes:JSON.stringify(GameState.current.chapterMemory||{}).length,
      valid:BAOChapterMemoryCore.check(GameState.current.chapterMemory.chapters[0],Chat.messages).ok,
      notes:Chat.summary
    }));
    expect(facts.runtime).toBe(1);
    expect(facts.disk).toBe(1);
    expect(facts.valid).toBe(true);
    expect(facts.notes).toBe('');
    await page.evaluate(()=>{
      const saved=Storage.loadStory();
      if(!Storage.restoreStory(saved))throw Error('portable story restore failed');
      BAOMemoryWorkbench.refresh(document.querySelector('.memory-desk-backdrop'),'chapters');
    });
    await expect(pane.locator('.chapter-memory-record')).toHaveCount(1);
    await expect(pane.locator('[data-chapter-valid]')).toContainText('有效 1 章');
    await page.evaluate(()=>{
      Chat.messages[5].content+='（原文已修改）';
      BAOMemoryWorkbench.refresh(document.querySelector('.memory-desk-backdrop'),'chapters');
    });
    await expect(pane.locator('[data-chapter-valid]')).toContainText('來源失效 1 章');
    const noReplay=await page.evaluate(()=>BAOChapterMemoryCore.recall({
      archive:GameState.current.chapterMemory,messages:Chat.messages,
      query:'港口秘密',state:GameState.current,config:App.config,
      primary:'艾琳',resolver:BAOEpisodicMemory
    }));
    expect(noReplay.selected).toHaveLength(0);
    expect(await desk.evaluate(el=>el.scrollWidth<=el.clientWidth+2)).toBe(true);
    await desk.locator('.memory-desk-close').click();
    await expect(desk).toHaveCount(0);
  });
}
