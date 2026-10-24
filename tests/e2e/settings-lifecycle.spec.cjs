const {test,expect}=require('@playwright/test');
const ready=page=>page.waitForFunction(()=>window.BAOSettingsEffects && window.BAOStoryBackup && window.BAOSceneStoryPreferences && window.BAOInterpretationMods && window.BAOCommentaryMods && window.BAOMemoryWorkbench && Storage.status().ready && App.characters?.length);
async function seed(page,width){
  await page.setViewportSize({width,height:900});await page.goto('./');await ready(page);
  await page.evaluate(async()=>{
    App.activeCharacter={...App.characters[0],id:'lifecycle-audit',name:'生命週期測試',system_prompt:'LIFECYCLE_CARD',
      world_modules:[{id:'audit_relevant',label:'選用資料',context:'relevant',tracking:'manual',triggers:['LIFECYCLE_QUERY']},
        {id:'audit_display',label:'畫面資料',context:'ui_only',tracking:'manual'}],
      initial_state:{modules:{audit_relevant:{marker:'LIFECYCLE_MODULE'},audit_display:{marker:'LIFECYCLE_DISPLAY_ONLY'}}},
      character_status:{enabled:true,fields:[{key:'manual_field',label:'手動欄位',context:'core',track:false,default:'LIFECYCLE_FIELD'}]},gameplay:{}};
    App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',stateTracking:false,
      scenePresentation:{mode:'free',status:'hidden'},narrative:{playerPortrayal:'coauthor',observationMode:'one_turn',stylePacks:['realist_subtext','natural'],storyExtras:['threads','daily'],
        density:'rich',paragraphs:'3-5',innerThoughts:'restrained',physicalContinuity:true,intimacyDetailMod:true,matureDrama:'mature',characterAgency:'autonomous',
        responseLength:'long',pacing:'slow',sceneFocus:'protect',storyExpectation:'LIFECYCLE_EXPECTATION',dialogueBalance:'balanced',customInstructions:[{text:'保留 LIFECYCLE_CUSTOM 停頓。',enabled:true}]},
      api:{type:'custom',protocol:'openai',model:'audit',key:'LIFECYCLE_SECRET',baseUrl:'https://lifecycle-audit.invalid/v1/chat/completions',stream:false,retryEnabled:false},
      memory:{mode:'full',maxRounds:20,maxContext:64000,summaryApi:null,summaryApiMode:'same',summaryModel:''}};
    BAOPlayerSettings.set({language:'en',pov:'third',replyLength:'long',dialogueFormat:'named'});
    BAONarrativeSettings.set({density:'concise',playerPortrayal:'strict'});
    Chat.reset();GameState.create(App.activeCharacter,App.config);Chat.add('user','LIFECYCLE_QUERY');
    Object.assign(GameState.current,{
      actorMode:{enabled:true,roleActive:true,role:{label:'LIFECYCLE_IDENTITY'}},phoneSurface:{version:1,enabled:true,userName:'LIFECYCLE_OWNER'},
      interpretationMods:{enabled:['bun-interpreter','class-monitor'],detailMode:'detailed',monitorTone:'banter',showAdvisor:false},
      commentaryMods:{enabled:['director-commentary']},memorySlots:[{id:'manual',title:'手動筆記',text:'LIFECYCLE_NOTE',enabled:true}],
      worldbookLibrary:{version:1,enabled:['lifecycle-book'],pinned:{},recallMode:'auto',installed:[YoruWorldbookLibraryCore.normalizePack({schema:YoruWorldbookLibraryCore.SCHEMA,version:1,
        meta:{id:'lifecycle-book',name:'Book',world:'general'},entries:[{id:'fixed',mode:'constant',content:'LIFECYCLE_FIXED'},
          {id:'dynamic',mode:'keyword',keywords:['LIFECYCLE_QUERY'],content:'LIFECYCLE_DYNAMIC'}]})]}});
    // This is a world-style work with modules. Only an actual in-scene person
    // may carry character fields; the work title must never become an NPC.
    GameState.upsertNPC({name:'範圍角色',role:'同行者',presence:'present',location:GameState.current.location});
    App.showView('chat');App.renderChatShell(false);BAONarrativeSettings.open();
  });
  const modal=page.getByRole('dialog',{name:'今晚的故事',exact:true});
  await modal.locator('[data-pref="responseLength"]').selectOption('short');await modal.locator('[data-narrative-save]').click();
}
const selected=page=>page.evaluate(()=>({narrative:structuredClone(App.config.narrative),memory:structuredClone(App.config.memory),scene:structuredClone(App.config.scenePresentation),
  actor:GameState.current.actorMode.role.label,phone:GameState.current.phoneSurface.userName,books:[...GameState.current.worldbookLibrary.enabled],
  interpretation:structuredClone(GameState.current.interpretationMods),commentary:[...GameState.current.commentaryMods.enabled],notes:BAOMemoryWorkbench.readSlots().map(x=>x.text),
  browser:{language:BAOPlayerSettings.get().language,pov:BAOPlayerSettings.get().pov},defaults:BAONarrativeSettings.get().density}));
for(const width of [390,1440])test(`choices survive real storage, reload, story switch and file import at ${width}px`,async({page,browser})=>{
  const bodies=[];await page.route('https://lifecycle-audit.invalid/**',route=>{bodies.push(route.request().postDataJSON());return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'ok'}}]})});});
  await seed(page,width);
  await page.evaluate(async()=>{await App.buildMessages(App.config);});
  const expected=await selected(page);
  const backup=await page.evaluate(async()=>{const slot=Storage.saveSlot('LIFECYCLE_A');await Storage.flush();await BAOStoryLibrary.flush();return slot;});
  expect(JSON.stringify(backup)).not.toContain('LIFECYCLE_SECRET');
  await page.evaluate(backup=>{
    BAOPlayerSettings.set({...BAOPlayerSettings.get(),language:'zh-Hant',pov:'second'});BAONarrativeSettings.set({density:'standard'});
    const other=structuredClone(backup);other.config.narrative={density:'concise',playerPortrayal:'strict'};other.config.scenePresentation={mode:'native',status:'author'};
    other.state.actorMode.enabled=false;other.state.phoneSurface.enabled=false;other.state.interpretationMods.enabled=[];other.state.commentaryMods.enabled=[];
    if(!Storage.restoreStory(other))throw Error('cannot restore B');
    if(!Storage.restoreStory(backup))throw Error('cannot restore A');
  },backup);
  const currentExpected={...expected,browser:{language:'zh-Hant',pov:'second'},defaults:'standard'};
  expect(await selected(page)).toEqual(currentExpected);expect(bodies).toHaveLength(0);
  await page.reload();await ready(page);
  await page.evaluate(()=>{const a=Storage.listSlots().find(s=>s.label==='LIFECYCLE_A');if(!Storage.restoreStory(a))throw Error('reload restore failed');App.renderChatShell(false);App.showView('chat');});
  expect(await selected(page)).toEqual(currentExpected);
  await page.locator('#import-save-file').setInputFiles({name:'lifecycle.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(page.getByText('存檔匯入並確認寫入完成。',{exact:true})).toBeVisible();
  await page.evaluate(backup=>{if(!Storage.restoreStory(backup))throw Error('import restore failed');},backup);
  expect(await selected(page)).toEqual(currentExpected);expect(bodies).toHaveLength(0);
  const cache=await page.evaluate(async()=>{
    const first=await App.buildMessages(App.config),user=Chat.messages.findLast(m=>m.role==='user'),original=user.content;
    user.content='普通閒聊';const second=await App.buildMessages(App.config);user.content=original;
    return {first:first[0].content,second:second[0].content,matched:JSON.stringify(first).includes('LIFECYCLE_MODULE'),unmatched:JSON.stringify(second).includes('LIFECYCLE_MODULE')};
  });
  expect(cache.matched).toBe(true);expect(cache.unmatched).toBe(false);expect(cache.first).toBe(cache.second);
  await page.evaluate(async()=>{App.config.api.key='test';const ms=await App.buildMessages(App.config);await API.send(App.config.api,ms);});
  expect(bodies).toHaveLength(1);
  const body=JSON.stringify(bodies[0]);for(const marker of ['LIFECYCLE_CARD','玩家已授權小說共創','300–600','LIFECYCLE_IDENTITY','LIFECYCLE_OWNER','LIFECYCLE_FIXED','LIFECYCLE_DYNAMIC','LIFECYCLE_CUSTOM'])expect(body).toContain(marker);
  expect(body).toContain('LIFECYCLE_MODULE');expect(body).toContain('LIFECYCLE_FIELD');expect(body).not.toContain('LIFECYCLE_DISPLAY_ONLY');
  const evidence=await page.evaluate(()=>BAOSettingsEffects.snapshot().rows);
  for(const id of ['playerPortrayal','responseLength','phone-owner','worldbook','language'])expect(evidence.find(r=>r.id===id).evidence,id).toBe('included');

  // A truly fresh browser has only automatically migrated appearance defaults.
  // Backup reply fields must still hydrate; an existing target device is not reset.
  const device=await browser.newContext({viewport:{width,height:900}}),newPage=await device.newPage();
  await newPage.goto('./');await ready(newPage);
  await newPage.locator('#import-save-file').setInputFiles({name:'new-device.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
  await expect(newPage.getByText('存檔匯入並確認寫入完成。',{exact:true})).toBeVisible();
  await newPage.evaluate(()=>{const slot=Storage.listSlots().find(s=>s.label==='LIFECYCLE_A');if(!Storage.restoreStory(slot))throw Error('fresh-device restore failed');});
  expect(await selected(newPage)).toEqual(expected);
  expect(await newPage.evaluate(()=>App.config.api.key)).toBe('');await device.close();
});
