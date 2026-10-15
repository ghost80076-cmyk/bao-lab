const {test,expect}=require('@playwright/test');
const Core=require('../../js/work-package-core.js');
const fs=require('node:fs');
const png=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6e7sAAAAASUVORK5CYII=','base64'));
const card={schema_version:'1.5',meta:{id:'work-package-e2e',name:'完整作品包'},content:{greeting:'抵達碼頭。',system_prompt:'保存原作設定。'},presentation:{supported_display:{text:true,ui:true}},gameplay:{supported_modes:{immersive:true,world:true},initial_state:{location:'碼頭',modules:{visual:{mood:'微笑'}},worldbookLibrary:{version:1,enabled:['package-book'],pinned:{},installed:[{schema:'yorubay-worldbook-pack',version:1,meta:{id:'package-book',name:'完整世界書'},entries:Array.from({length:100},(_,i)=>({id:'entry-'+i,title:'港口'+i,mode:'keyword',keywords:['港'+i],content:'完整原文'+i,enabled:i!==99}))}]}}},world_modules:[{id:'visual',kind:'object',label:'畫面',context:'ui_only',fields:[{key:'mood',type:'text'}]}],gameplay_ui:{version:1,layout:{preset:'scene-rpg',scene_source:'reading-background'},panels:[{id:'status',label:'狀態',sections:[{type:'stats',items:[{label:'表情',path:'modules.visual.mood'}]}]}]}};
const assets=[{id:'cover',path:'assets/cover.png',role:'cover'},{id:'port',path:'assets/port.png',role:'scene',when:[{path:'location',equals:'碼頭'}]},{id:'library',path:'assets/library.png',role:'scene',when:[{path:'location',equals:'書庫'}]},{id:'smile',path:'assets/smile.png',role:'portrait',when:[{path:'modules.visual.mood',equals:'微笑'}]}];
const bytes=process.env.YORUBAY_CREATOR_PACKAGE_FIXTURE?fs.readFileSync(process.env.YORUBAY_CREATOR_PACKAGE_FIXTURE):Buffer.from(Core.build({character:card,assets,files:Object.fromEntries(assets.map(x=>[x.path,png])),regex:{rules:[{pattern:'測試',replacement:'<img src="embeded://assets/port.png">'}]}}).bytes);
for(const width of [390,1280])test('work package survives cancel, import, reload, scene switch, backup and export ('+width+'px)',async({page})=>{
  await page.setViewportSize({width,height:900});await page.goto('./');
  await page.waitForFunction(()=>Boolean(window.BAOWorkPackage&&window.YoruWorldbookLibraryCore));
  await page.locator('#home-view [data-view="explore"]').click();
  const upload=()=>page.locator('#import-character-file').setInputFiles({name:'complete.yorubay.zip',mimeType:'application/zip',buffer:bytes});
  await upload();const preview=page.getByRole('dialog',{name:'匯入作品包'});await expect(preview).toContainText('4 張圖片');
  await preview.getByRole('button',{name:'取消',exact:true}).click();expect(await page.evaluate(()=>CharacterEngine.loadCustom().length)).toBe(0);
  await upload();await page.getByRole('dialog',{name:'匯入作品包'}).getByRole('button',{name:'匯入到本機'}).click();
  await expect(page.locator('#character-import-status')).toContainText('已匯入：完整作品包');
  await page.reload();await page.waitForFunction(()=>Boolean(window.BAOWorkPackage&&CharacterEngine.loadCustom().some(x=>x.id==='work-package-e2e')));
  const info=await page.evaluate(async()=>{
    let c=CharacterEngine.loadCustom().find(x=>x.id==='work-package-e2e');
    const originalPut=IDBObjectStore.prototype.put;let rejected=false;
    try{IDBObjectStore.prototype.put=function(){throw new DOMException('test quota','QuotaExceededError');};await CharacterEngine.saveCustomAsync({...c,name:'不可覆蓋'});}catch{rejected=true;}finally{IDBObjectStore.prototype.put=originalPut;}
    if(!rejected||CharacterEngine.loadCustom().find(x=>x.id===c.id).name!=='完整作品包')throw new Error('儲存失敗不應覆蓋舊作品');
    const backup=await CharacterEngine.exportCustomLibrary();CharacterEngine.removeCustom(c.id);await CharacterEngine.flushCustomLibrary();await CharacterEngine.importCustomLibrary(backup);
    c=CharacterEngine.loadCustom().find(x=>x.id==='work-package-e2e');App.activeCharacter=c;
    const port=BAOWorkPackage.sceneURL(c,{location:'碼頭'}),library=BAOWorkPackage.sceneURL(c,{location:'書庫'});
    const raw=await CharacterEngine.exportCustomLibrary(),out=await CharacterEngine.exportWorkPackage(c.id);
    const files=await BAOWorkPackageCore.unzip(out.bytes);const restored=BAOWorkPackageCore.assemble(BAOWorkPackageCore.jsonFile(files,'manifest.json'),files);
    App.config={displayMode:'ui',narrativeMode:'world',persona:{name:'旅人'},api:{model:'mock'},memory:{mode:'manual',maxRounds:20,maxContext:32000}};GameState.create(c,App.config);App.showView('chat');App.renderChatShell();BAOGameplayUI.syncGameplayLayout();
    return {count:restored.character.initial_state?.worldbookLibrary?.installed[0].entries.length||restored.character.gameplay?.initial_state?.worldbookLibrary?.installed[0].entries.length,assets:CharacterEngine.getWorkAssets(c.id).length,port,library,backedUp:raw[0].assets.length,avatar:c.avatar,prompt:CharacterEngine.composeSystemPrompt(c,{}),rewritten:BAOWorkPackage.rewriteHTML('<img src="embeded://assets/port.png">',c)};
  });
  await page.evaluate(()=>{
    const frame=document.createElement('iframe');frame.id='work-asset-probe';frame.setAttribute('sandbox','');frame.style.cssText='position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    const html='<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; img-src data:"><img src="embeded://assets/port.png">';
    BAOWorkPackage.setFrameHTML(frame,html,App.activeCharacter);document.body.append(frame);
  });
  await expect.poll(()=>page.frameLocator('#work-asset-probe').locator('img').evaluate(x=>x.naturalWidth)).toBeGreaterThan(0);
  expect(await page.locator('#work-asset-probe').getAttribute('sandbox')).toBe('');
  await page.locator('#work-asset-probe').evaluate(x=>x.remove());
  expect(info.count).toBe(100);expect(info.assets).toBe(4);expect(info.backedUp).toBe(4);expect(info.port).toMatch(/^blob:/);expect(info.library).not.toBe(info.port);expect(info.avatar).toMatch(/^blob:/);expect(info.rewritten).toContain(info.port);expect(info.prompt).not.toContain('embeded://');
  await expect(page.locator('#bao-gameplay-scene-stage img').first()).toHaveAttribute('src',info.port);
  await page.evaluate(()=>{GameState.current.location='書庫';BAOGameplayUI.syncGameplayLayout();});
  await expect(page.locator('#bao-gameplay-scene-stage img').first()).toHaveAttribute('src',info.library);
  if(width<1280){await page.locator('[data-work-current-scene] summary').click();await expect(page.locator('[data-work-current-scene] .work-package-portrait')).toBeVisible();}
  else await expect(page.locator('#bao-gameplay-scene-stage .work-package-portrait')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.evaluate(()=>BAOChatToolNavigation.openDrawer());
  const menu=page.getByRole('dialog',{name:'故事功能選單'});await menu.locator('input[type="search"]').fill('作品圖片');
  await menu.getByRole('button',{name:'作品圖片（4）'}).click();await expect(page.getByRole('dialog',{name:'作品圖片'}).locator('img')).toHaveCount(4);
  await expect.poll(()=>page.getByRole('dialog',{name:'作品圖片'}).locator('img').first().evaluate(x=>x.naturalWidth)).toBeGreaterThan(0);
  await page.screenshot({path:test.info().outputPath('package-gallery.png')});
});
