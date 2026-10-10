const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
 test(`studio builds and exports inventory actions at ${viewport.width}px`,async({page})=>{
  await page.setViewportSize(viewport);
  await page.goto('./character-studio.html');
  await page.locator('[name="name"]').fill('原生交易商店');
  await page.locator('[name="id"]').fill('studio-actions-test');
  await page.locator('[name="system_prompt"]').fill('商店經營。');
  await page.locator('[name="greeting"]').fill('歡迎光臨。');
  await page.locator('#studio-gameplay-theme > summary').click();
  await page.locator('#studio-add-inventory-action').click();
  await expect(page.locator('#studio-action-status')).toContainText('已加入「購買罐頭」');
  await expect(page.locator('[name="gameplay_theme"]')).toBeEnabled();
  await page.locator('[name="action_kind"]').selectOption('consume');
  await page.locator('[name="action_label"]').fill('食用罐頭');
  await page.locator('[name="action_quantity"]').fill('1');
  await expect(page.locator('[name="action_price"]')).toBeHidden();
  await page.locator('#studio-add-inventory-action').click();
  await expect(page.locator('#studio-action-list li')).toHaveCount(2);
  const state=await page.evaluate(()=>{
   const card=BAOCharacterStudio.readCard();
   const state={moduleDefinitions:card.world_modules,modules:structuredClone(card.initial_state.modules)};
   const actions=card.gameplay_ui.panels[0].sections.find(s=>s.type==='actions').items;
   const buy=BAOGameplayUICore.executeActionEffect(state,actions[0].effect);
   const consume=BAOGameplayUICore.executeActionEffect(state,actions[1].effect);
   return {buy:buy.ok,consume:consume.ok,modules:state.modules};
  });
  expect(state).toEqual({buy:true,consume:true,modules:{inventory:[{id:'cans',name:'罐頭',quantity:1}],economy:{crystals:5}}});
  await page.locator('#studio-save-draft').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await page.reload();
  await page.locator('.studio-draft').filter({hasText:'原生交易商店'}).click();
  await page.locator('#studio-gameplay-theme > summary').click();
  await expect(page.locator('#studio-action-list li')).toHaveCount(2);
  const promise=page.waitForEvent('download');await page.locator('#studio-export').click();
  const downloaded=await promise;
  const json=JSON.parse(await fs.readFile(await downloaded.path(),'utf8'));
  expect(json.gameplay.initial_state.modules.inventory).toEqual([]);
  expect(json.gameplay.initial_state.modules.economy.crystals).toBe(20);
  expect(json.gameplay.ui_schema.panels[0].sections.find(s=>s.type==='actions').items).toHaveLength(2);
  await page.locator('#studio-file').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
  await expect(page.locator('#studio-status')).toContainText('夜灣角色卡已載入');
  expect(await page.evaluate(()=>BAOCharacterStudio.toExport().gameplay)).toEqual(json.gameplay);
 });
}
test('invalid legacy inventory is not silently rewritten by author form',async({page})=>{
 await page.goto('./character-studio.html');
 const card={schema_version:'1.5',meta:{id:'legacy-bag',name:'舊背包'},content:{system_prompt:'商店',greeting:'歡迎'},gameplay:{world_modules:[{id:'inventory',kind:'collection'}],initial_state:{modules:{inventory:[{name:'罐頭',quantity:2}]}}}};
 await page.locator('#studio-file').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(card))});
 await expect(page.locator('#studio-status')).toContainText('夜灣角色卡已載入');
 const before=await page.evaluate(()=>BAOCharacterStudio.toExport());
 await page.locator('#studio-gameplay-theme > summary').click();
 await page.locator('#studio-add-inventory-action').click();
 await expect(page.locator('#studio-status')).toContainText('既有背包需使用唯一物品 id');
 expect(await page.evaluate(()=>BAOCharacterStudio.toExport())).toEqual(before);
});
