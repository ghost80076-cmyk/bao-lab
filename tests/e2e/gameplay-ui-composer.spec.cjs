const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
async function open(page,width=1440){
 await page.setViewportSize({width,height:950});await page.goto('/character-studio.html');
 await page.waitForFunction(()=>window.BAOCharacterStudioGameplayComposer&&window.BAOCharacterStudioFlow);
 await page.getByRole('button',{name:'全部欄位',exact:true}).click();
 return page.locator('#studio-gameplay-composer');
}
async function pane(root,name){const b=root.getByRole('button',{name,exact:true});if(await b.isVisible())await b.click();}
for(const width of [1440,390])test(`authors compose, preview, sort and save without JSON at ${width}px`,async({page},testInfo)=>{
 const root=await open(page,width);
 expect(await page.evaluate(()=>BAOCharacterStudio.readCard().gameplay_ui)).toBeNull();
 expect(await root.locator('iframe').getAttribute('src')).toBeNull();
 await root.getByRole('button',{name:'啟用互動 UI',exact:true}).click();
 await root.getByRole('button',{name:'新增面板',exact:true}).click();
 await pane(root,'欄位');
 await root.getByLabel('面板名稱',{exact:true}).fill('角色狀態');
 await root.getByLabel('加入組件',{exact:true}).selectOption('meters');
 await root.getByRole('button',{name:'新增區塊',exact:true}).click();
 await root.getByLabel('區塊標題',{exact:true}).fill('生存狀態');
 await root.getByLabel('顯示名稱',{exact:true}).fill('生命力');
 await root.getByLabel('固定最大值',{exact:true}).fill('80');
 expect(await page.evaluate(()=>BAOCharacterStudio.getState().dirty)).toBe(true);
 await pane(root,'預覽');
 const frame=root.frameLocator('iframe');
 await expect(frame.locator('.gameplay-meter')).toContainText('生命力');
 await expect(frame.locator('.gameplay-meter')).toContainText('48 / 80');
 expect(await root.locator('iframe').evaluate(f=>Object.keys(f.contentWindow.GameState.current).every(k=>['time','location','events','npcs','modules','moduleDefinitions'].includes(k)))).toBe(true);
 await root.screenshot({path:testInfo.outputPath('composer.png')});
 await root.getByLabel('預覽寬度').selectOption('390');
 await expect.poll(()=>root.locator('iframe').evaluate(f=>f.contentWindow.innerWidth)).toBe(390);
 expect(await page.evaluate(()=>BAOCharacterStudio.readCard().initial_state.modules?.player)).toBeUndefined();
 await pane(root,'結構');
 await root.getByRole('button',{name:'選擇面板：角色狀態',exact:true}).click();
 await root.getByLabel('加入組件',{exact:true}).selectOption('stats');
 await root.getByRole('button',{name:'新增區塊',exact:true}).click();
 await root.getByLabel('區塊標題',{exact:true}).fill('故事資訊');
 await pane(root,'結構');
 const selected=root.getByRole('button',{name:'選擇區塊：故事資訊',exact:true});
 await expect(selected).toBeVisible();await selected.focus();await selected.press('Alt+ArrowUp');
 await expect(selected).toBeFocused();
 expect(await page.evaluate(()=>BAOCharacterStudio.readCard().gameplay_ui.panels[0].sections.map(s=>s.type))).toEqual(['stats','meters']);
 await page.locator('[name="name"]').fill('編排測試');
 await page.getByRole('button',{name:'儲存草稿',exact:true}).click();
 await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
 await pane(root,'預覽');
 await root.getByLabel('預覽寬度').selectOption('900');
 expect(await page.evaluate(()=>BAOCharacterStudio.getState().dirty)).toBe(false);
 await page.reload();await page.waitForFunction(()=>window.BAOCharacterStudioGameplayComposer);
 await page.getByRole('button',{name:'全部欄位',exact:true}).click();
 await page.locator('.studio-draft').filter({hasText:'編排測試'}).click();
 await expect(root.getByRole('button',{name:'選擇面板：角色狀態',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>BAOCharacterStudio.readCard().gameplay_ui.panels[0].sections[1].items[0].max)).toBe(80);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('import/export preserves unknown schema and theme fields; edits keep atomic effects',async({page})=>{
 const root=await open(page);
 const ui={version:1,theme:{preset:'noir',surface:'#123456',future:{keep:true}},builder:{future:7},future:{keep:true},panels:[{id:'shop',label:'商店',future:5,sections:[{type:'actions',title:'行動',items:[{label:'原生購買',draft:'我買下物品。',effect:{changes:[{path:'modules.money.gold',delta:-1}]},future:8}]}]}]};
 const card={schema_version:'1.5',meta:{id:'composer-roundtrip',name:'保留測試'},content:{system_prompt:'測試設定',greeting:'測試開場'},gameplay:{ui_schema:ui,world_modules:[{id:'legacy'}]},presentation:{play_info_surface:'reader-context',supported_display:{text:false,ui:true}}};
 await page.locator('#studio-file').setInputFiles({name:'card.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(card))});
 await expect(root.getByRole('button',{name:'選擇面板：商店'})).toBeVisible();
 expect(await page.evaluate(()=>BAOCharacterStudio.toExport().gameplay.ui_schema)).toEqual(ui);
 await root.getByRole('button',{name:'選擇區塊：行動'}).click();
 await expect(root.frameLocator('iframe').locator('.gameplay-ui-panel')).toBeVisible();
 await root.getByLabel('顯示名稱',{exact:true}).fill('修改後購買');
 const result=await page.evaluate(()=>BAOCharacterStudio.toExport().gameplay.ui_schema);
 const presentation=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation);
 expect(presentation.play_info_surface).toBe('reader-context');
 expect(presentation.supported_display).toEqual({text:false,ui:true});
 expect(result.theme).toEqual(ui.theme);expect(result.builder).toEqual(ui.builder);expect(result.future).toEqual(ui.future);
 expect(result.panels[0].sections[0].items[0]).toEqual({...ui.panels[0].sections[0].items[0],label:'修改後購買'});
 await page.locator('#studio-gameplay-theme > summary').click();
 await page.locator('[name="gameplay_density"]').selectOption('compact');
 const themed=await page.evaluate(()=>BAOCharacterStudio.toExport().gameplay.ui_schema.theme);
 expect(themed).toEqual({...ui.theme,density:'compact'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'匯出夜灣 JSON',exact:true}).click();
 const exported=JSON.parse(await fs.readFile(await (await download).path(),'utf8'));
 expect(exported.gameplay.ui_schema.panels[0].future).toBe(5);
});

test('legacy purchase builder and composer share one draft; delete clears layout references',async({page})=>{
 const root=await open(page);
 await page.locator('#studio-gameplay-theme > summary').click();
 await page.locator('#studio-add-inventory-action').click();
 await expect(root.getByRole('button',{name:'選擇面板：資源與背包'})).toBeVisible();
 await page.getByRole('button',{name:'編輯 購買罐頭',exact:true}).click();
 await root.getByRole('button',{name:'新增面板',exact:true}).click();
 await expect(root.locator('[data-composer-message]')).toContainText('請先儲存或取消');
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().panels.length)).toBe(1);
 await page.locator('#studio-cancel-action-edit').click();
 await page.evaluate(()=>{const ui=BAOCharacterStudio.getGameplayUI();ui.layout={preset:'rpg-dashboard',left_panel:ui.panels[0].id};BAOCharacterStudio.setGameplayUI(ui);BAOCharacterStudioGameplayComposer.refresh();});
 page.once('dialog',dialog=>dialog.accept());
 await root.locator('.composer-tree-row').first().getByRole('button',{name:'刪除',exact:true}).click();
 const ui=await page.evaluate(()=>BAOCharacterStudio.getGameplayUI());
 expect(ui.panels).toEqual([]);expect(ui.layout.left_panel).toBeUndefined();
 await expect(page.locator('#studio-action-list li')).toHaveCount(0);
});


test('drag sorting changes the raw order and keeps focus on the moved panel',async({page})=>{
 const root=await open(page);
 await page.evaluate(()=>{
  BAOCharacterStudio.setGameplayUI({version:1,panels:[{id:'a',label:'面板甲',sections:[]},{id:'b',label:'面板乙',sections:[]}]});
  BAOCharacterStudioGameplayComposer.refresh();
 });
 const rows=root.locator('.composer-tree-group > .composer-tree-row');
 await root.getByRole('button',{name:'拖曳排序：面板甲'}).dragTo(rows.nth(1));
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().panels.map(p=>p.id))).toEqual(['b','a']);
 await expect(root.getByRole('button',{name:'選擇面板：面板甲'})).toBeFocused();
});
