const {test,expect}=require('@playwright/test');
const openStoryTools=async page=>{await page.evaluate(()=>BAOChatToolNavigation.openDrawer());const summary=page.getByRole('dialog',{name:'故事功能選單'}).locator('summary').filter({hasText:/故事.*存檔/});if(!await summary.evaluate(x=>x.parentElement.open))await summary.click();};
const fs=require('node:fs');
for(const width of [390,1280])test(`People JSON/TXT, backup and transcript at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{
  if(!localStorage.getItem('bao-lab:actor-presets-v1'))localStorage.setItem('bao-lab:actor-presets-v1',JSON.stringify([{id:'my-npc',label:'調查員',actor:{name:'青柚',identity:'調查員',personality:'冷靜',background:'原始背景',role:'additional'}}]));
  if(!localStorage.getItem('bao-lab:persona-presets-v1'))localStorage.setItem('bao-lab:persona-presets-v1',JSON.stringify([{id:'my-player',label:'旅人',persona:{name:'旅人',identity:'攝影師'}}]));
 });
 await page.goto('/');await page.waitForFunction(()=>window.BAOStoryActors&&window.BAODeviceTransfer&&window.BAOStoryBackup&&App.characters?.length);
 await page.evaluate(()=>BAOStoryActors.openLibrary('actor'));
 const modal=page.getByRole('dialog',{name:'我的人物庫'});
 await modal.locator('.bao-library-more>summary').click();
 await page.screenshot({path:test.info().outputPath('people-library.png')});
 const [download]=await Promise.all([page.waitForEvent('download'),modal.getByRole('button',{name:'下載 JSON',exact:true}).click()]);
 const bytes=fs.readFileSync(await download.path());const pack=JSON.parse(bytes);
 expect(pack.actors[0].actor.background).toBe('原始背景');expect(pack.players).toHaveLength(0);
 const [txt]=await Promise.all([page.waitForEvent('download'),modal.getByRole('button',{name:'下載 TXT',exact:true}).click()]);
 expect(fs.readFileSync(await txt.path(),'utf8')).toContain('原始背景');
 await modal.getByText('匯入／匯出人物',{exact:true}).click();
 page.once('dialog',d=>d.accept());
 await modal.locator('input[type=file]').setInputFiles({name:'people.json',mimeType:'application/json',buffer:bytes});
 await expect(modal.locator('.bao-library-card')).toHaveCount(2);
 expect(await page.evaluate(async()=>{const b=await BAODeviceTransfer.build();return [b.people.actors.length,b.people.players.length];})).toEqual([2,1]);
 await modal.getByRole('button',{name:'關閉',exact:true}).click();
 await page.evaluate(()=>{
  App.activeCharacter=App.characters[0];App.config={persona:{name:'旅人'},narrativeMode:'immersive',displayMode:'text',api:{model:'mock',key:'NEVER_EXPORT'},memory:{maxRounds:20,maxContext:32000,mode:'rounds'}};
  GameState.create(App.activeCharacter,App.config);Chat.reset();Chat.add('user','你好');Chat.add('assistant','歡迎回來。');App.renderChatShell(true);App.showView('chat');
 });
 await openStoryTools(page);
 const [chat]=await Promise.all([page.waitForEvent('download'),page.getByRole('dialog',{name:'故事功能選單'}).getByRole('button',{name:'下載本章對話 TXT',exact:true}).click()]);
 const text=fs.readFileSync(await chat.path(),'utf8');expect(text).toContain('你好');expect(text).toContain('歡迎回來。');expect(text).not.toContain('NEVER_EXPORT');
 await page.reload();await page.waitForFunction(()=>!!window.BAOStoryActors);expect(await page.evaluate(()=>BAOStoryActors.readActorPresets().length)).toBe(2);
});
test('Admin ZIP preview includes all images and publication request contains Regex/media',async({page})=>{
 await page.goto('/admin-wallet.html');await page.waitForFunction(()=>!!window.BAOWorkPackageCore&&!!window.BAOCharacterImport);
 const bytes=await page.evaluate(()=>{
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6e7sAAAAASUVORK5CYII='),x=>x.charCodeAt(0));
 return Array.from(BAOWorkPackageCore.build({character:{schema_version:'1.5',meta:{id:'admin-package',name:'管理頁作品',category:'general'},content:{greeting:'原始開場',system_prompt:'完整設定'}},files:{'assets/cover.png':png,'assets/port.png':png},assets:[{id:'cover',path:'assets/cover.png',role:'cover',bytes:png},{id:'port',path:'assets/port.png',role:'scene',bytes:png,when:[{path:'location',equals:'碼頭'}]}],regex:{rules:[{pattern:'x',replacement:'<img src="embeded://assets/port.png">'}]}}).bytes);
 });
 await page.locator('#publish-character-file').setInputFiles({name:'work.zip',mimeType:'application/zip',buffer:Buffer.from(bytes)});
 await page.locator('#publish-load').click();await expect(page.locator('#publish-source-summary')).toContainText('圖片 2 張');
 expect(await page.locator('#publish-name').inputValue()).toBe('管理頁作品');
 await page.evaluate(()=>{window.__publication=null;YoruBayAdmin.isAuthenticated=()=>true;YoruBayAdmin.api=async(path,opts)=>{window.__publication=JSON.parse(opts.body);return {pr_number:123};};});
 await page.locator('#publish-rights').check();await page.locator('#publish-create-pr').click();
 await page.waitForFunction(()=>!!window.__publication);
 const result=await page.evaluate(()=>({images:__publication.package_assets.length,regex:__publication.card.import_metadata.work_package_regex,assets:__publication.card.asset_manifest.assets.length}));
 expect(result.images).toBe(2);expect(result.assets).toBe(2);expect(JSON.stringify(result.regex)).toContain('embeded://assets/port.png');
});
test('Published scene and opaque Regex frame load static package images',async({page})=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6e7sAAAAASUVORK5CYII=','base64');
 await page.route('**/assets/community/static-probe/media/scene.png',r=>r.fulfill({contentType:'image/png',body:png}));
 await page.goto('/');await page.waitForFunction(()=>!!window.BAOWorkPackage);
 const url=await page.evaluate(()=>{
  const c={id:'static-probe',asset_manifest:{version:1,assets:[{id:'scene',path:'assets/scene.png',public_url:'assets/community/static-probe/media/scene.png',role:'scene',when:[{path:'location',equals:'碼頭'}]}]}};
  App.activeCharacter=c;
  const frame=document.createElement('iframe');frame.id='static-image-probe';frame.setAttribute('sandbox','');document.body.append(frame);
  BAOWorkPackage.setFrameHTML(frame,'<img src="https://yorubay.com/assets/community/static-probe/media/scene.png">',c);
  return BAOWorkPackage.sceneURL(c,{location:'碼頭'});
 });
 expect(url).toBe('assets/community/static-probe/media/scene.png');
 await expect(page.frameLocator('#static-image-probe').locator('img')).toHaveJSProperty('naturalWidth',1);
 expect(await page.locator('#static-image-probe').getAttribute('sandbox')).toBe('');
});
