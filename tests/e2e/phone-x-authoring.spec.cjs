const {test,expect}=require('@playwright/test');

test('studio X form creates multi-author posts, replies and retains old data on export',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudioPhoneBuilder && window.BAOStudioSimpleCreate);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('[name=name]').fill('校慶社群');
  await page.locator('[name=id]').fill('x-posts-e2e');
  await page.locator('[name=system_prompt]').fill('校園群像設定');
  await page.locator('[name=greeting]').fill('校慶開始。');
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('.studio-phone-raw > summary').click();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({
    userName:'玩家',tweets:['既有舊貼文'],weather:{place:'基隆'}
  }));
  await page.locator('[data-phone-x-author]').fill('目擊同學');
  await page.locator('[data-phone-x-handle]').fill('@witness');
  await page.locator('[data-phone-x-text]').fill('舞台上有爭執。');
  await page.locator('.studio-phone-x-advanced > summary').click();
  await page.locator('[data-phone-x-source]').selectOption('witness');
  await page.locator('[data-phone-x-event]').fill('festival-1');
  await page.locator('[data-phone-add-x-post]').click();
  const first=await page.evaluate(()=>JSON.parse(document.querySelector('[name=phone_ui_json]').value).tweets[1]);
  expect(first).toMatchObject({authorName:'目擊同學',authorHandle:'@witness',sourceKind:'witness',eventId:'festival-1'});
  await page.locator('[data-phone-x-author]').fill('另一位學生');
  await page.locator('[data-phone-x-text]').fill('我聽說的不一樣。');
  await page.locator('[data-phone-x-reply]').selectOption(first.id);
  await page.locator('[data-phone-add-x-post]').click();
  await expect(page.locator('[data-phone-x-list] li')).toHaveCount(3);
  const before=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation.phone_ui);
  expect(before.tweets[0].text).toBe('既有舊貼文');
  expect(before.tweets[2].replyTo).toBe(first.id);
  expect(before.weather.place).toBe('基隆');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await page.locator('#studio-save-draft').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  await page.reload();
  await page.waitForFunction(()=>window.BAOCharacterStudioPhoneBuilder && window.BAOStudioSimpleCreate);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('.studio-draft').filter({hasText:'校慶社群'}).click();
  const after=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation.phone_ui);
  expect(after.tweets[2].replyTo).toBe(first.id);
  expect(after.tweets[1].sourceKind).toBe('witness');
});