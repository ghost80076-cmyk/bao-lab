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

test('deleting a post also removes descendant replies and related read locks',async({page})=>{
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudioPhoneBuilder && window.BAOStudioSimpleCreate);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('.studio-phone-raw > summary').click();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({
    userName:'故事主人',tweets:[
      '原有貼文',
      {id:'root-1',authorName:'社團',text:'開場公告'},
      {id:'reply-1',replyTo:'root-1',authorName:'學生',text:'第一層回覆'},
      {id:'reply-2',replyTo:'reply-1',authorName:'朋友',text:'第二層回覆'},
      {id:'root-2',authorName:'校方',text:'其他內容'}
    ],notes:[{id:'keep',title:'備忘錄',text:'保留'}],
    interactions:{version:1,locks:[{target:{app:'x',id:'reply-1'},code:'0427'}],
      events:[{id:'ref-post',when:{action:'read',target:{app:'x',id:'root-1'}},
        unlock:[{app:'x',id:'reply-1'}],notification:'更新'}]}
  }));
  await expect(page.locator('[data-phone-x-list] li')).toHaveCount(5);
  await page.locator('[data-phone-x-list] li').filter({hasText:'開場公告'}).getByRole('button',{name:/移除/}).click();
  const raw=JSON.parse(await page.locator('[name=phone_ui_json]').inputValue());
  expect(raw.tweets.map(item=>typeof item==='string'?item:item.id)).toEqual(['原有貼文','root-2']);
  expect(raw.interactions.locks).toHaveLength(0);
  expect(raw.interactions.events).toHaveLength(0);
  expect(raw.notes).toHaveLength(1);
  const normalized=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation.phone_ui);
  expect(normalized.tweets.map(tweet=>tweet.text)).toEqual(['原有貼文','其他內容']);
});

test('studio X composer may reply to an existing reply without rewriting earlier posts',async({page})=>{
  await page.goto('/character-studio.html');
  await page.waitForFunction(()=>window.BAOCharacterStudioPhoneBuilder && window.BAOStudioSimpleCreate);
  await page.getByRole('button',{name:'全部欄位'}).click();
  await page.locator('[name=phone_ui_enabled]').check();
  await page.locator('.studio-phone-raw > summary').click();
  await page.locator('[name=phone_ui_json]').fill(JSON.stringify({
    apps:['x'],tweets:[
      {id:'parent',authorName:'社團',text:'原貼文'},
      {id:'comment',replyTo:'parent',authorName:'同學甲',text:'第一層留言'}
    ]
  }));
  await expect(page.locator('[data-phone-x-reply] option[value="comment"]')).toHaveCount(1);
  await page.locator('[data-phone-x-author]').fill('同學乙');
  await page.locator('[data-phone-x-text]').fill('回覆第一層的意見');
  await page.locator('[data-phone-x-reply]').selectOption('comment');
  await page.locator('[data-phone-add-x-post]').click();
  const phone=await page.evaluate(()=>BAOCharacterStudio.toExport().presentation.phone_ui);
  expect(phone.tweets).toHaveLength(3);
  expect(phone.tweets[0].text).toBe('原貼文');
  expect(phone.tweets[1].replyTo).toBe('parent');
  expect(phone.tweets[2]).toMatchObject({authorName:'同學乙',replyTo:'comment',text:'回覆第一層的意見'});
});
