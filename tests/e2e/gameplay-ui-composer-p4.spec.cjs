const {test,expect}=require('@playwright/test');
test.use({reducedMotion:'reduce'});
async function open(page,width=1440,ui){
 await page.setViewportSize({width,height:950});await page.goto('/character-studio.html');
 await page.waitForFunction(()=>window.BAOCharacterStudioGameplayComposer&&[...document.styleSheets].some(s=>s.href?.includes('character-studio-flow.css')));
 await page.evaluate(()=>document.fonts.ready);await page.getByRole('button',{name:'全部欄位',exact:true}).click();
 if(ui)await page.evaluate(ui=>{BAOCharacterStudio.setGameplayUI(ui);BAOCharacterStudioGameplayComposer.refresh();},ui);
 return page.locator('#studio-gameplay-composer');
}
const base=()=>({version:1,panels:[{id:'main',label:'主面板',sections:[{type:'meters',title:'狀態',items:[{label:'HP',value_path:'modules.player.hp',max:20}]}]}]});
async function pane(root,name){const b=root.getByRole('button',{name,exact:true});if(await b.isVisible())await b.click();}
test('template preview never enables or dirties an old card; apply and undo restore activation',async({page})=>{
 const root=await open(page);await page.locator('[name="name"]').fill('範本測試');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
 const before=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation);
 await root.locator('.composer-templates>summary').click();await root.getByRole('button',{name:'預覽範本',exact:true}).click();
 await expect(root.frameLocator('iframe').locator('.gameplay-meter')).toHaveCount(2);
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toBeNull();expect(await page.evaluate(()=>BAOCharacterStudio.getState().dirty)).toBe(false);
 await root.getByRole('button',{name:'套用範本並啟用',exact:true}).click();expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().panels[0].id)).toBe('status');
 await root.getByRole('button',{name:'復原到套用範本前',exact:true}).click();
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toBeNull();expect(await page.evaluate(()=>BAOCharacterStudio.toExport().presentation)).toEqual(before);
});
test('template replacement requires confirmation and retains builder, theme and future metadata',async({page})=>{
 const ui={...base(),theme:{preset:'noir',future:4},builder:{future:7},future:{keep:1},layout:{preset:'terminal',primary_panel:'main',future:3}};
 const root=await open(page,1440,ui);await root.locator('.composer-templates>summary').click();await root.getByLabel('選擇範本',{exact:true}).selectOption('shop');
 await root.getByRole('button',{name:'預覽範本',exact:true}).click();expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toEqual(ui);
 page.once('dialog',d=>d.dismiss());await root.getByRole('button',{name:'套用範本並啟用',exact:true}).click();expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toEqual(ui);
 page.once('dialog',d=>d.accept());await root.getByRole('button',{name:'套用範本並啟用',exact:true}).click();
 const next=await page.evaluate(()=>BAOCharacterStudio.getGameplayUI());expect(next.theme).toEqual(ui.theme);expect(next.builder).toEqual(ui.builder);expect(next.future).toEqual(ui.future);expect(next.layout).toBeUndefined();
 await root.getByRole('button',{name:'復原到套用範本前',exact:true}).click();expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toEqual(ui);
});
test('card initial values and empty lists win; seed toggle affects only preview',async({page})=>{
 const root=await open(page);const ui=base();ui.panels[0].sections.push({type:'list',path:'events',empty:'沒有事件'});
 const card={id:'p4-seed',name:'初始值測試',system_prompt:'測試',greeting:'開場',gameplay_ui:ui,initial_state:{modules:{player:{hp:7}},events:[],location:'港口'},world_modules:[{id:'player',kind:'object'}]};
 await page.locator('#studio-file').setInputFiles({name:'seed.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(card))});
 await expect(root.getByRole('button',{name:'選擇面板：主面板',exact:true})).toBeVisible();
 await root.locator('iframe').scrollIntoViewIfNeeded();
 const initial=await page.evaluate(()=>BAOCharacterStudio.readCard().initial_state);
 await expect(root.frameLocator('iframe').locator('.gameplay-meter')).toContainText('7 / 20');await expect(root.frameLocator('iframe').locator('.gameplay-ui-panel')).toContainText('沒有事件');
 await root.getByLabel('帶入作品初始狀態',{exact:true}).uncheck();await expect(root.frameLocator('iframe').locator('.gameplay-meter')).toContainText('12 / 20');
 await root.getByLabel('帶入作品初始狀態',{exact:true}).check();await expect(root.frameLocator('iframe').locator('.gameplay-meter')).toContainText('7 / 20');expect(await page.evaluate(()=>BAOCharacterStudio.readCard().initial_state)).toEqual(initial);
});
for(const width of [390,1440])test(`fullscreen preview returns focus and viewport at ${width}px`,async({page},info)=>{
 const root=await open(page,width,base());await pane(root,'預覽');const opener=root.getByRole('button',{name:'展開預覽',exact:true});await opener.click();
 const dialog=root.getByRole('dialog',{name:'互動 UI 放大預覽'});await expect(dialog).toBeVisible();await dialog.getByLabel('預覽寬度').selectOption('900');
 await expect.poll(()=>dialog.locator('iframe').evaluate(f=>f.contentWindow.innerWidth)).toBe(900);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await dialog.screenshot({path:info.outputPath('fullscreen.png')});await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();await expect(opener).toBeFocused();await expect(root.locator('.composer-grid iframe')).toHaveCount(1);
});
test('contrast is measured from actual renderer CSS and warns without changing schema',async({page})=>{
 const ui={...base(),theme:{preset:'noir',accent:'#111214'}};const root=await open(page,1440,ui);await root.locator('iframe').scrollIntoViewIfNeeded();
 await expect(root.locator('[data-theme-contrast]')).toContainText('強調色對背景的對比為 1');expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toEqual(ui);
 await page.evaluate(()=>{const u=BAOCharacterStudio.getGameplayUI();u.theme.accent='#ffffff';BAOCharacterStudio.setGameplayUI(u);BAOCharacterStudioGameplayComposer.refresh();});
 await expect(root.locator('[data-theme-contrast]')).toContainText('對比檢查通過');
});
test('scene test images remain isolated, survive preview reload, and reject SVG',async({page})=>{
 const ui={version:1,panels:[{id:'archive',label:'地點',sections:[{type:'location_archive',title:'目前地點'}]}]};const root=await open(page,1440,ui);
 await root.locator('[data-preview-image]').locator('..').locator('..').locator('summary').click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await root.getByLabel('選擇場景測試圖',{exact:true}).setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:png});await expect(root.locator('[data-preview-image-status]')).toContainText('測試圖已載入');
 const img=()=>root.frameLocator('iframe').locator('.gameplay-location-media img');await expect(img()).toHaveAttribute('src',/^blob:/);await expect.poll(()=>img().evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);
 const previewFrame=page.frames().find(f=>f.url().includes('gameplay-ui-preview.html'));
 await Promise.all([previewFrame.waitForNavigation({waitUntil:'load'}),previewFrame.evaluate(()=>location.reload())]);await expect(img()).toHaveAttribute('src',/^blob:/);await expect.poll(()=>img().evaluate(i=>i.naturalWidth)).toBeGreaterThan(0);
 await root.getByRole('button',{name:'清除測試圖',exact:true}).click();await expect(img()).not.toHaveAttribute('src',/^blob:/);
 await root.getByLabel('選擇場景測試圖',{exact:true}).setInputFiles({name:'test.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')});await expect(root.locator('[data-preview-image-status]')).toContainText('PNG、JPEG 或 WebP');
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toEqual(ui);
});
