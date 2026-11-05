const { test, expect } = require('@playwright/test');

async function openReady(page) {
  await page.goto('/');
  // Wait for the full pipeline before capturing the fixture's immutable state.
  await page.waitForFunction(() => window.BAOExtensionLoadHealth?.snapshot().story === 'ready'
    && BAOExtensionLoadHealth.snapshot().world === 'ready' && window.YoruExperience
    && App.characters?.length && Storage.status().ready);
}

// Optional defaults are read projections; inspecting them must not create save fields.
const defaultsReady = page => page.waitForFunction(() =>
  Array.isArray(window.BAOStoryQuickCommands?.state?.()) &&
  window.BAOCommentaryMods?.ensureState?.().version === 1 &&
  window.BAOInterpretationMods?.ensureState?.().version === 1);

for (const width of [390, 1280]) {
  test('memory workbench matches site themes and preserves story notes (' + width + 'px)', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openReady(page);
    await page.waitForFunction(() => Boolean(
      window.YoruExperience && window.BAOMemoryWorkbenchSimple &&
      window.BAOMemoryWorkbench && App.characters?.length && window.GameState
    ));
    await page.waitForFunction(() => [...document.styleSheets].some(
      sheet => sheet.href?.includes('memory-workbench.css')
    ));
    await page.evaluate(() => {
      App.activeCharacter = { ...App.characters[0], greeting:'燈還亮著。' };
      App.config = {
        persona:{ name:'旅人' }, narrativeMode:'immersive', displayMode:'ui',
        api:{ model:'mock' }, memory:{ mode:'smart', maxRounds:20, maxContext:32000 }
      };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      Chat.add('assistant', '燈還亮著。');
      Chat.add('user', '我翻開港口的筆記。');
      Chat.summary = '旅人曾在碼頭交換一封信。';
      window.BAOMemoryWorkbench.writeSlots([{
        id:'keep-test', title:'碼頭的約定', enabled:true, text:'明天一定要回到港口。'
      }]);
      App.renderChatShell(false);
      App.showView('chat');
    });
    await defaultsReady(page);
    const before = await page.evaluate(() => JSON.stringify(GameState.current));
    for (const theme of ['mist','dawn','dusk','sunset']) {
      await page.evaluate(value => {
        YoruExperience.choose({ theme:value });
        BAOMemoryWorkbench.open();
      }, theme);
      const palette = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement('span');
        document.body.append(probe);
        const pick = (property, cssName = 'backgroundColor') => {
          probe.style[cssName] = root.getPropertyValue(property).trim();
          return getComputedStyle(probe)[cssName];
        };
        const colors = {
          surface:pick('--yoru-surface'),
          card:pick('--yoru-card'),
          tool:pick('--yoru-tool'),
          text:pick('--yoru-text','color'),
          input:pick('--yoru-input')
        };
        probe.remove();
        return colors;
      });
      const desk = page.locator('.memory-desk');
      await expect(desk).toBeVisible();
      await expect(desk).toHaveCSS('background-color', palette.surface);
      await expect(desk).toHaveCSS('color', palette.text);
      await expect(desk.locator('.memory-desk-nav')).toHaveCSS('background-color', palette.tool);
      await expect(desk.locator('.memory-health-card')).toHaveCSS('color', palette.text);
      await expect(desk.locator('.memory-note-card').first()).toHaveCSS('background-color', palette.card);
      await expect(desk.locator('.memory-summary-preview')).toHaveCSS('background-color', palette.card);
      await expect(desk.locator('.summary-review')).toHaveCSS('background-color', palette.card);
      await expect(desk.locator('.summary-review')).toHaveCSS('color', palette.text);
      await desk.locator('.memory-desk-tab[data-tab="notes"]').click();
      await expect(desk.locator('[data-slot-title]')).toHaveValue('碼頭的約定');
      await expect(desk.locator('[data-slot-text]')).toHaveValue('明天一定要回到港口。');
      await desk.locator('[data-slot-scope-label]').click();
      await expect(desk.locator('[data-slot-scope]')).toHaveValue('shared');
      await expect(desk.locator('[data-slot-known-by]')).toBeDisabled();
      await expect(desk.locator('[data-slot-scope]')).toHaveCSS('background-color', palette.input);
      await expect(desk.locator('[data-slot-scope]')).toHaveCSS('color', palette.text);
      expect(await page.evaluate(() => JSON.stringify(GameState.current))).toBe(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      await desk.locator('.memory-desk-close').click();
      await expect(desk).toHaveCount(0);
    }
  });
}

for(const width of [390,1280]){
 test(`memory desk supports keyboard exit and restores the opener at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await openReady(page);
  await page.waitForFunction(()=>window.BAOMemoryWorkbench && window.BAOStoryControlCenter && App.characters?.length);
  await page.evaluate(()=>{
   App.activeCharacter=App.characters[0];App.config={api:{model:'mock'},memory:{mode:'smart',maxRounds:20,maxContext:32000},persona:{name:'旅人'}};
   GameState.create(App.activeCharacter,App.config);Chat.reset();App.renderChatShell(false);App.showView('chat');
  });
  const opener=page.locator(width<=820?'#bao-mobile-composer-tools':'#bao-surface-mode-toggle');
  await defaultsReady(page);
  const before=await page.evaluate(()=>JSON.stringify({state:GameState.current,config:App.config}));
  // Focus and open in one browser task: late shell hydration can replace the
  // launcher between separate automation commands, before open captures it.
  await page.evaluate(w=>{
   const target=document.getElementById(w<=820?'bao-mobile-composer-tools':'bao-surface-mode-toggle');
   target.focus();if(document.activeElement!==target)throw Error('opener did not receive focus');
   BAOMemoryWorkbench.open();
  },width);
  const desk=page.getByRole('dialog',{name:'記憶工作台',exact:true});await expect(desk).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
  await expect(desk.locator('.memory-desk-close')).toBeFocused();
  await desk.evaluate(node=>{const items=[...node.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);items.at(-1).focus();});
  await page.keyboard.press('Tab');expect(await desk.evaluate(n=>n.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(desk).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');await expect(opener).toBeFocused();
  expect(await page.evaluate(()=>JSON.stringify({state:GameState.current,config:App.config}))).toBe(before);
 });
}

for (const width of [390,1280]) {
 test(`manual note knowledge survives editing and portable reload at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await openReady(page);
  await page.waitForFunction(()=>window.BAOMemoryWorkbenchSimple&&window.BAOMemoryWorkbench&&window.BAOPromptCache&&window.BAOEpisodicMemory&&App.characters?.length&&Storage.status().ready);
  await page.evaluate(()=>{
   App.activeCharacter=CharacterEngine.normalize({id:'manual-note-scope-fixture',name:'艾琳',greeting:'燈還亮著。',system_prompt:'依角色已知資訊延續故事。',character_status:{primary_character_name:'艾琳'}});
   App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',api:{model:'mock'},memory:{mode:'rounds',maxRounds:20,maxContext:32000}};
   GameState.create(App.activeCharacter,App.config);Chat.reset();Chat.add('assistant','燈還亮著。');
   GameState.current.npcs=[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}];
   BAOMemoryWorkbench.writeSlots([{id:'scope-note',title:'密函',text:'港口暗號4721。',enabled:true,knowledge_scope:'actors',known_by:['艾琳'],extra:{source:'manual'}}]);
   App.renderChatShell(false);App.showView('chat');BAOMemoryWorkbench.open();
  });
  expect(await page.evaluate(()=>GameState.current.npcs.find(n=>n.name==='艾琳')?.aliases)).toContain('琳');
  const desk=page.getByRole('dialog',{name:'記憶工作台',exact:true});
  await desk.locator('.memory-desk-tab[data-tab="notes"]').click();
  const card=desk.locator('[data-slot="scope-note"]');await card.locator('[data-slot-scope-label]').click();
  const scope=card.locator('[data-slot-scope]'),names=card.locator('[data-slot-known-by]');
  await expect(scope).toHaveValue('actors');await expect(names).toHaveValue('艾琳');
  await names.fill('琳');await names.press('Tab');
  await card.locator('[data-slot-title]').fill('更新密函');await card.locator('[data-slot-title]').press('Tab');
  await card.locator('[data-slot-text]').fill('港口暗號4721。\n\n【固定 Schema】\n只屬於密函的內容。');
  expect(await page.evaluate(()=>GameState.current.memorySlots[0].extra.source)).toBe('manual');
  expect(await page.evaluate(async()=>JSON.stringify(await App.buildMessages()))).toContain('港口暗號4721');
  expect(await page.evaluate(async()=>(await App.buildMessages())[0].content)).not.toContain('港口暗號4721');
  await page.evaluate(()=>GameState.current.npcs.push({name:'守衛',presence:'present'}));
  expect(await page.evaluate(async()=>JSON.stringify(await App.buildMessages()))).not.toContain('港口暗號4721');
  await page.evaluate(()=>GameState.current.npcs.at(-1).presence='away');
  await names.fill('');await names.press('Tab');await expect(card.locator('[data-slot-scope-label]')).toContainText('未提供給模型');
  expect(await page.evaluate(async()=>JSON.stringify(await App.buildMessages()))).not.toContain('港口暗號4721');
  await names.fill('琳');await names.press('Tab');
  await page.screenshot({path:testInfo.outputPath(`manual-note-scope-${width}.png`),fullPage:true});
  expect(await desk.evaluate(node=>node.scrollWidth<=node.clientWidth+2)).toBe(true);
  await names.focus();await page.keyboard.press('Escape');await expect(desk).toHaveCount(0);
  const restored=await page.evaluate(()=>{
   const payload=Storage.buildStoryPayload('知情筆記');Chat.reset();if(!Storage.restoreStory(payload))throw Error('restore failed');
   return GameState.current.memorySlots[0];
  });
  expect(restored).toMatchObject({title:'更新密函',knowledge_scope:'actors',known_by:['琳'],extra:{source:'manual'}});
  expect(await page.evaluate(async()=>JSON.stringify(await App.buildMessages()))).toContain('港口暗號4721');
  await page.evaluate(()=>{App.config.narrativeMode='world';GameState.current.npcs.forEach(n=>n.presence='away');});
  expect(await page.evaluate(async()=>JSON.stringify(await App.buildMessages()))).not.toContain('港口暗號4721');
  await page.evaluate(()=>BAOMemoryWorkbench.open());
  await desk.locator('.memory-desk-tab[data-tab="notes"]').click();
  await desk.locator('[data-slot-text]').fill('同一故事內尚未保存的編輯。');
  const fresh=await page.evaluate(()=>{
   GameState.current={...structuredClone(GameState.current),memorySlots:[{id:'other-note',title:'另一故事',text:'不能覆蓋的新筆記',enabled:true}]};
   window.__noteSavesAfterSwitch=0;App.saveStory=()=>{window.__noteSavesAfterSwitch++;return true;};
   return JSON.stringify(GameState.current);
  });
  await desk.locator('[data-slot-text]').fill('不能跨故事寫入的舊編輯。');
  await expect(desk.locator('[data-pane="notes"] .memory-pane-title p')).toContainText('故事已切換');
  expect(await page.evaluate(()=>JSON.stringify(GameState.current))).toBe(fresh);
  if(width<=820)await desk.locator('[data-memory-editing-done]').click();
  await desk.locator('.memory-desk-close').click();
  expect(await page.evaluate(()=>window.__noteSavesAfterSwitch)).toBe(0);
 });
}

for(const width of [390,1280]){
 test(`optional scene recall uses current audience and survives save at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await openReady(page);
  await page.waitForFunction(()=>window.BAOMemoryWorkbenchSimple&&window.BAOPromptCache&&window.BAOEpisodicMemory&&App.characters?.length&&Storage.status().ready);
  await page.evaluate(()=>{
   App.activeCharacter=CharacterEngine.normalize({id:'scene-memory-fixture',name:'艾琳',greeting:'燈還亮著。',system_prompt:'依角色知情延續故事。',character_status:{primary_character_name:'艾琳'}});
   App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',api:{model:'mock'},memory:{mode:'rounds',maxRounds:4,maxContext:32000}};
   GameState.create(App.activeCharacter,App.config);Chat.reset();
   Chat.messages=[{id:'scene-a',role:'user',content:'我在橋邊遞出信封。'},{id:'scene-b',role:'assistant',content:'艾琳答應明晚到港口等你。'},
    ...Array.from({length:16},(_,i)=>({id:'scene-filler'+i,role:i%2?'assistant':'user',content:'日常對話'})),{id:'scene-query',role:'user',content:'港口約定'}];
   GameState.current.npcs=[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}];
   BAOEpisodicMemory.ingest(GameState.current,{scenes:[{text:'不屬於角色認知的客觀秘密5512',evidenceIds:['scene-a','scene-b'],entities:['艾琳'],keywords:['港口','約定'],
    knowledge:[{actor:'琳',mode:'witnessed',claim:'明晚在港口等旅人的約定7712',evidenceIds:['scene-b']}]}]},Chat.messages.slice(0,2),Chat.messages);
   App.renderChatShell(false);App.showView('chat');BAOMemoryWorkbench.open();
  });
  const desk=page.getByRole('dialog',{name:'記憶工作台',exact:true}),details=desk.locator('[data-hybrid-memory-settings]');
  await details.locator('summary').click();const toggle=details.locator('[data-hybrid-memory]');
  await expect(toggle).not.toBeChecked();
  const prompt=()=>page.evaluate(async()=>JSON.stringify(await App.buildMessages()));
  expect(await prompt()).not.toContain('約定7712');
  await toggle.focus();await page.keyboard.press('Space');await expect(toggle).toBeChecked();
  expect(await prompt()).toContain('約定7712');expect(await prompt()).not.toContain('客觀秘密5512');
  await page.evaluate(()=>GameState.current.npcs.push({name:'守衛',presence:'present'}));expect(await prompt()).not.toContain('約定7712');
  await page.evaluate(()=>GameState.current.npcs.at(-1).presence='away');expect(await prompt()).toContain('約定7712');
  await page.screenshot({path:testInfo.outputPath(`scene-recall-${width}.png`),fullPage:true});
  expect(await desk.evaluate(n=>n.scrollWidth<=n.clientWidth+2)).toBe(true);
  await toggle.focus();await page.keyboard.press('Escape');await expect(desk).toHaveCount(0);
  expect(await page.evaluate(()=>{const payload=Storage.buildStoryPayload('場景回憶');Chat.reset();if(!Storage.restoreStory(payload))throw Error('restore failed');return App.config.memory.hybridRecall;})).toBe(true);
  expect(await prompt()).toContain('約定7712');
  await page.evaluate(()=>BAOMemoryWorkbench.open());await details.locator('summary').click();
  await toggle.uncheck();expect(await prompt()).not.toContain('約定7712');
  expect(await page.evaluate(()=>GameState.current.episodicMemory.scenes.length)).toBe(1,'turning off retains saved scenes');
  await toggle.check();await page.evaluate(()=>{Chat.messages[0].content='原文已改寫';});expect(await prompt()).not.toContain('約定7712');
  await page.evaluate(()=>{App.config={...App.config,memory:{...App.config.memory,hybridRecall:false}};GameState.current={...structuredClone(GameState.current)};window.__sceneMemorySaves=0;App.saveStory=()=>{window.__sceneMemorySaves++;return true;};});
  await toggle.click();await expect(toggle).toBeDisabled();await expect(toggle).toBeChecked();
  expect(await page.evaluate(()=>App.config.memory.hybridRecall)).toBe(false);expect(await page.evaluate(()=>window.__sceneMemorySaves)).toBe(0);
 });
}

for(const width of [390,1280]){
 test(`reviewed summary scope persists and protects pending source at ${width}px`,async({page},testInfo)=>{
  await page.setViewportSize({width,height:844});await openReady(page);
  await page.evaluate(()=>{
   App.activeCharacter=CharacterEngine.normalize({id:'summary-review-fixture',name:'艾琳',greeting:'開始。',system_prompt:'依照角色已知資訊延續故事。',character_status:{primary_character_name:'艾琳'}});
   App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',api:{model:'mock'},memory:{mode:'smart',maxRounds:4,summaryInterval:4,maxContext:32000}};
   GameState.create(App.activeCharacter,App.config);Chat.reset();
   Chat.messages=[{id:'review-source-a',role:'user',content:'我和艾琳交談。'},{id:'review-source-b',role:'assistant',content:'艾琳回答了港口的消息。'},
    ...Array.from({length:30},(_,i)=>({id:'review-tail'+i,role:i%2?'assistant':'user',content:i===0?'後續原文8841。':'日常對話。'}))];
   Chat.summary='港口暗號7712。\n城門開放。\n排除事項9911。';Chat.summarizedUntil=2;GameState.current.memory=[Chat.summary];
   GameState.current.npcs=[{npc_id:'a',name:'艾琳',aliases:['琳'],presence:'away'}];
   App.renderChatShell(false);App.showView('chat');
  });
  await defaultsReady(page);
  const original=await page.evaluate(()=>({summary:Chat.summary,cursor:Chat.summarizedUntil}));
  const prompt=()=>page.evaluate(async()=>JSON.stringify(await App.buildMessages()));
  expect(await prompt()).toContain('排除事項9911');
  await page.evaluate(()=>BAOMemoryWorkbench.open());
  const desk=page.getByRole('dialog',{name:'記憶工作台',exact:true}),section=desk.locator('.summary-review');
  await section.locator('summary').click();await section.locator('[data-summary-review-prepare]').click();
  await expect(section.locator('[data-summary-review-entry]')).toHaveCount(3);
  await section.locator('[data-summary-review-evidence]>summary').click();
  await expect(section.locator('[data-summary-source-messages]')).toContainText('review-source-a');await expect(section.locator('[data-summary-source-messages]')).toContainText('我和艾琳交談');
  await expect(section.locator('[data-summary-source-next]')).toBeDisabled();
  await section.locator('[data-summary-review-evidence]>summary').click();
  await section.locator('[data-summary-review-apply]').click();await expect(section.locator('[data-summary-review-status]')).toContainText('第 1 段');
  expect(await page.evaluate(()=>GameState.current.summaryKnowledge)).toBeUndefined();
  let captured=false;
  const assign=async()=>{
   await section.locator('[data-summary-review-entry="0"] [data-summary-review-actors]').fill('琳');
   await section.locator('[data-summary-review-entry="1"] [data-summary-review-scope]').selectOption('shared');
   await section.locator('[data-summary-review-entry="2"] [data-summary-review-scope]').selectOption('exclude');
   if(!captured){
    const field=section.locator('[data-summary-review-entry="0"] [data-summary-review-actors]');
    await field.scrollIntoViewIfNeeded();await field.focus();
    expect((await field.boundingBox()).height).toBeGreaterThanOrEqual(44);
    expect(await desk.evaluate(n=>n.scrollWidth<=n.clientWidth+2)).toBe(true);
    await page.screenshot({path:testInfo.outputPath(`summary-review-${width}.png`),fullPage:true});captured=true;
   }
   await section.locator('[data-summary-review-apply]').click();await expect(section.locator('[data-summary-review-status]')).toContainText('已保存');
  };
  await assign();expect(await prompt()).toContain('港口暗號7712');expect(await prompt()).toContain('城門開放');expect(await prompt()).not.toContain('排除事項9911');
  expect(await page.evaluate(()=>BAOStoryMaintenanceLock.has(GameState.current))).toBe(false);
  await page.evaluate(()=>GameState.current.npcs.push({name:'守衛',presence:'present'}));expect(await prompt()).not.toContain('港口暗號7712');expect(await prompt()).toContain('城門開放');
  await page.evaluate(()=>GameState.current.npcs.at(-1).presence='away');
  expect(await desk.evaluate(n=>n.scrollWidth<=n.clientWidth+2)).toBe(true);
  await section.locator('[data-summary-review-prepare]').focus();await page.keyboard.press('Escape');await expect(desk).toHaveCount(0);
  expect(await page.evaluate(()=>{const payload=Storage.buildStoryPayload('摘要知情');Chat.reset();if(!Storage.restoreStory(payload))throw Error('restore failed');return GameState.current.summaryKnowledge.active;})).toBe(true);
  expect(await prompt()).toContain('港口暗號7712');expect(await prompt()).not.toContain('排除事項9911');
  expect(await page.evaluate(()=>({summary:Chat.summary,cursor:Chat.summarizedUntil}))).toEqual(original);
  await page.evaluate(()=>BAOMemoryWorkbench.open());await section.locator('summary').click();
  await section.locator('[data-summary-review-undo]').click();await expect(section.locator('[data-summary-review-status]')).toContainText('已保存');
  expect(await page.evaluate(()=>GameState.current.summaryKnowledge)).toBeUndefined();expect(await prompt()).toContain('排除事項9911');
  await section.locator('[data-summary-review-prepare]').click();await assign();
  await page.evaluate(()=>{Chat.summary='尚未審閱新摘要4433。';Chat.summarizedUntil=4;GameState.current.memory=[Chat.summary];BAOMemoryWorkbench.refresh(document.querySelector('.memory-desk-backdrop'),'context');});
  await section.locator('summary').click();await expect(section.locator('[data-summary-review-state]')).toContainText('摘要已更新');await expect(section.locator('[data-summary-review-undo]')).toBeDisabled();
  expect(await prompt()).not.toContain('尚未審閱新摘要4433');expect(await prompt()).toContain('後續原文8841');expect(await page.evaluate(()=>Chat.contextGuard.rawStart)).toBe(2);
  await page.evaluate(()=>Chat.messages[0].content='來源已被改寫。');
  expect(await page.evaluate(async()=>{try{await App.buildMessages();return 'unexpected success';}catch(e){return e.message;}})).toContain('來源已改寫');
  const beforeFailure=await page.evaluate(()=>{window.__summarySave=App.saveStory;App.saveStory=()=>false;return JSON.stringify([GameState.current.summaryKnowledge,GameState.current.summaryKnowledgeBackup]);});
  await section.locator('[data-summary-review-off]').click();await expect(section.locator('[data-summary-review-status]')).toContainText('未受理保存');
  expect(await page.evaluate(()=>JSON.stringify([GameState.current.summaryKnowledge,GameState.current.summaryKnowledgeBackup]))).toBe(beforeFailure);
  expect(await page.evaluate(()=>BAOStoryMaintenanceLock.has(GameState.current))).toBe(false);
  await page.evaluate(()=>App.saveStory=window.__summarySave);
  await section.locator('[data-summary-review-off]').click();await expect(section.locator('[data-summary-review-status]')).toContainText('已保存');expect(await prompt()).toContain('尚未審閱新摘要4433');
  await section.locator('[data-summary-review-prepare]').click();await section.locator('[data-summary-review-scope]').selectOption('shared');
  const switched=await page.evaluate(()=>{GameState.current=structuredClone(GameState.current);App.config={...App.config};window.__crossSummarySaves=0;App.saveStory=()=>{window.__crossSummarySaves++;return true;};return JSON.stringify(GameState.current);});
  await section.locator('[data-summary-review-apply]').click();await expect(section.locator('[data-summary-review-status]')).toContainText('故事已切換');
  expect(await page.evaluate(()=>JSON.stringify(GameState.current))).toBe(switched);expect(await page.evaluate(()=>window.__crossSummarySaves)).toBe(0);
 });
}
