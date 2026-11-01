const {test,expect}=require('@playwright/test');
test.use({reducedMotion:'reduce'});
async function open(page,width=1440,ui){
 await page.setViewportSize({width,height:950});await page.goto('/character-studio.html');
 await page.waitForFunction(()=>window.BAOCharacterStudioGameplayComposer&&window.BAOCharacterStudioFlow);
 await page.waitForFunction(()=>[...document.styleSheets].some(s=>s.href?.includes('character-studio-flow.css')));
 await page.evaluate(()=>document.fonts.ready);
 await page.getByRole('button',{name:'全部欄位',exact:true}).click();
 if(ui)await page.evaluate(ui=>{BAOCharacterStudio.setGameplayUI(ui);BAOCharacterStudioGameplayComposer.refresh();},ui);
 return page.locator('#studio-gameplay-composer');
}
const card=sections=>({version:1,future:{keep:true},builder:{future:7},theme:{preset:'noir',future:8},panels:[{id:'main',label:'主面板',sections}]});
const stats={type:'stats',title:'資訊',items:[{label:'地點',path:'location'}]};
async function pane(root,name){const b=root.getByRole('button',{name,exact:true});if(await b.isVisible())await b.click();}
for(const width of [1440,390])test(`advanced sections and tabs are editable without nested tabs at ${width}px`,async({page},info)=>{
 const root=await open(page,width,card([stats]));
 await root.getByRole('button',{name:'選擇面板：主面板'}).click();await pane(root,'欄位');
 await root.getByLabel('加入組件',{exact:true}).selectOption('cards');await root.getByRole('button',{name:'新增區塊',exact:true}).click();
 await root.getByLabel('資料卡樣式').selectOption('quest');
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().panels[0].sections[1].path)).toBe('modules.quests');
 await pane(root,'結構');await root.getByRole('button',{name:'選擇面板：主面板'}).click();
 await root.getByLabel('加入組件',{exact:true}).selectOption('tabs');await root.getByRole('button',{name:'新增區塊',exact:true}).click();
 await root.getByLabel('預設分頁').selectOption('tab_1');
 await root.getByRole('button',{name:'編輯分頁：分頁 1',exact:true}).click();
 await expect(root.getByLabel('加入組件',{exact:true}).locator('option[value="tabs"]')).toHaveCount(0);
 await root.getByLabel('分頁 ID').fill('quests');await root.getByLabel('分頁 ID').press('Tab');
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().panels[0].sections[2].default_tab)).toBe('quests');
 await root.getByLabel('加入組件',{exact:true}).selectOption('timeline');await root.getByRole('button',{name:'新增區塊',exact:true}).click();
 await root.getByLabel('歷程模式').selectOption('round_diff');await root.getByRole('button',{name:'新增項目',exact:true}).click();
 await root.getByLabel('顯示名稱',{exact:true}).fill('本回合時間');
 await root.getByLabel('資料來源',{exact:true}).selectOption('time');
 await pane(root,'結構');await root.getByRole('button',{name:'選擇分頁：分頁 1'}).click();
 await root.getByLabel('加入組件',{exact:true}).selectOption('location_archive');await root.getByRole('button',{name:'新增區塊',exact:true}).click();
 await root.getByLabel('區域來源',{exact:true}).selectOption('modules');
 await root.getByLabel('區域來源的模組與欄位（例：player.hp）').fill('map.area');
 await root.getByLabel('場景縮放',{exact:true}).selectOption('contain');
 await pane(root,'結構');const loc=root.getByRole('button',{name:'選擇區塊：地點檔案'});await loc.focus();await loc.press('Alt+ArrowUp');await expect(loc).toBeFocused();
 const ui=await page.evaluate(()=>BAOCharacterStudio.getGameplayUI());
 expect(ui.panels[0].sections[2].tabs[0].sections.map(s=>s.type)).toEqual(['location_archive','timeline']);expect(ui.future).toEqual({keep:true});expect(ui.builder).toEqual({future:7});expect(ui.theme.future).toBe(8);
 await root.screenshot({path:info.outputPath('advanced.png')});
});
test('layout aliases are removed only on edit; stage fallback follows the preview viewport',async({page})=>{
 const ui=card([stats]);ui.layout={preset:'terminal',panel:'main',future:4};
 const root=await open(page,1440,ui);
 expect(await page.evaluate(()=>BAOCharacterStudio.toExport().gameplay.ui_schema)).toEqual(ui);
 await root.locator('.composer-layout > summary').click();await root.getByLabel('主要面板').selectOption('main');
 const layout=await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().layout);expect(layout).toEqual({preset:'terminal',primary_panel:'main',future:4});
 await pane(root,'預覽');await root.getByLabel('預覽寬度').selectOption('1440');
 await expect(root.locator('[data-preview-stage]')).toContainText('embedded');
 await root.getByLabel('預覽寬度').selectOption('900');await expect(root.locator('[data-preview-stage]')).toContainText('compact');await expect(root.locator('[data-preview-stage]')).toContainText('panel');
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().layout)).toEqual(layout);
});
test('effect editor trials use copied preview values; invalid effects fail closed',async({page})=>{
 const ui=card([{type:'actions',title:'商店',items:[{label:'購買',draft:'購買',effect:{future:9,changes:[{path:'modules.wallet.gold',delta:-1,future:3}]}}]}]);
 const root=await open(page,1440,ui);await root.getByRole('button',{name:'選擇區塊：商店'}).click();
 await root.locator('.composer-effect > summary').click();
 await root.getByRole('button',{name:'試算',exact:true}).click();await expect(root.locator('.composer-effect [role="status"]')).toContainText('20 → 19');
 await root.getByRole('button',{name:'試算（資源為 0）',exact:true}).click();await expect(root.locator('.composer-effect [role="status"]')).toContainText('無法結算');
 expect(await page.evaluate(()=>BAOCharacterStudio.getGameplayUI())).toEqual(ui);
 await root.getByLabel('變動量',{exact:true}).fill('0');await expect(root.locator('[data-diagnostic-count]')).toContainText('提醒');
 await expect(root.frameLocator('iframe').getByRole('button',{name:'購買',exact:true})).toHaveCount(0);
 const item=await page.evaluate(()=>BAOCharacterStudio.getGameplayUI().panels[0].sections[0].items[0]);expect(item.effect.future).toBe(9);expect(item.effect.changes[0].future).toBe(3);
 await root.getByLabel('變動量',{exact:true}).fill('-2');await expect(root.frameLocator('iframe').getByRole('button',{name:'購買',exact:true})).toBeVisible();
 await root.getByRole('button',{name:'試算',exact:true}).click();await expect(root.locator('.composer-effect [role="status"]')).toContainText('20 → 18');
});
test('preview values can make a list empty and never dirty or overwrite initial state',async({page})=>{
 const root=await open(page,1440,card([{type:'list',title:'任務',path:'modules.quests',empty:'沒有任務'}]));
 await page.locator('[name="name"]').fill('進階預覽');await page.getByRole('button',{name:'儲存草稿',exact:true}).click();await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
 const before=await page.evaluate(()=>BAOCharacterStudio.readCard().initial_state);
 await root.locator('[data-preview-values]').locator('..').locator('summary').click();
 await root.getByLabel('modules.quests',{exact:true}).fill('[]');await expect(root.frameLocator('iframe').locator('.gameplay-ui-panel')).toContainText('沒有任務');
 expect(await page.evaluate(()=>BAOCharacterStudio.getState().dirty)).toBe(false);expect(await page.evaluate(()=>BAOCharacterStudio.readCard().initial_state)).toEqual(before);
 await root.getByRole('button',{name:'重設預覽資料',exact:true}).click();await expect(root.frameLocator('iframe').locator('.gameplay-ui-panel')).not.toContainText('沒有任務');
});
test('the existing demo card survives import and export without schema changes',async({page})=>{
 const fs=require('node:fs');const ui=JSON.parse(fs.readFileSync('tests/fixtures/gameplay-ui-demo-character.json','utf8')).gameplay_ui;
 const root=await open(page,1440,ui);await expect(root.locator('[data-composer-tree]')).not.toBeEmpty();expect(await page.evaluate(()=>BAOCharacterStudio.toExport().gameplay.ui_schema)).toEqual(ui);
});
