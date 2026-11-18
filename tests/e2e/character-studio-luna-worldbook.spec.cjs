const {test, expect} = require('@playwright/test');
const fs = require('node:fs/promises');

test('Creator Studio imports Luna numbered worldbook into a portable card without auto-running source rules', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('./character-studio.html');
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudio?.addWorldbookPack && window.YoruWorldbookLibraryCore));
  await page.locator('[data-creation-route="lorebook"]').click();
  await expect(page.locator('#studio-import-worldbook')).toBeVisible();

  const exportFile = {
    name:'角色附屬世界書',
    entries:{
      '0':{uid:0,key:['茶店'],comment:'茶店資訊',content:'茶店早上六點開門。',constant:false,disable:false,order:0},
      '1':{uid:1,key:['裝扮'],comment:'來源規則',content:'當裝扮時加入 <img src="x" onerror="window.__worldbookExecuted = true">',constant:false,disable:false,order:1},
      '2':{uid:2,key:['封存'],comment:'停用資料',content:'這一條不能召回。',constant:false,disable:true,order:2}
    },
    extensions:{lunatalk:{worldbookExport:{format:'lunatalk.worldbook-export',original:{
      book:{name:'角色附屬世界書'},
      entries:[
        {name:'茶店資訊',content:'茶店早上六點開門。',category:'character',keywords:'["茶店"]',isEnabled:true,isConstant:false,priority:50},
        {name:'來源規則',content:'當裝扮時加入 <img src="x" onerror="window.__worldbookExecuted = true">',category:'rule',keywords:'["裝扮"]',isEnabled:true,isConstant:false,priority:60},
        {name:'停用資料',content:'這一條不能召回。',category:'character',keywords:'["封存"]',isEnabled:false,isConstant:false,priority:50}
      ]
    }}}}
  };
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#studio-worldbook-file').setInputFiles({
    name:'sample-worldbook.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(exportFile),'utf8')
  });
  await expect(page.locator('#studio-worldbook-import-status')).toContainText('已附加');
  await expect(page.locator('.studio-worldbook-pack')).toContainText('3 條');
  expect(await page.evaluate(() => window.__worldbookExecuted)).toBeUndefined();

  const book = await page.evaluate(() => window.BAOCharacterStudio.getWorldbookLibrary());
  expect(book.installed).toHaveLength(1);
  expect(book.enabled).toHaveLength(0);
  expect(book.installed[0].entries[0].content).toBe('茶店早上六點開門。');
  expect(book.installed[0].entries[1].review_required).toBe(true);
  expect(book.installed[0].entries[2].enabled).toBe(false);

  await page.locator('.studio-worldbook-pack > details > summary').click();
  const review = page.locator('.studio-worldbook-pack > details > details').first();
  await review.locator('summary').click();
  await expect(review.locator('pre')).toContainText('onerror=');
  expect(await page.evaluate(() => window.__worldbookExecuted)).toBeUndefined();
  await review.getByRole('button', {name:/已閱讀/}).click();
  await expect(page.locator('.studio-worldbook-pack')).toContainText('0 條外部規則待審');

  await page.locator('.studio-worldbook-activation input').check();
  await page.getByRole('button', {name:'全部欄位'}).click();
  await page.locator('[name="name"]').fill('試匯角色');
  await page.locator('[name="id"]').fill('luna-import-test-001');
  await page.locator('[name="system_prompt"]').fill('角色保留自己的立場。');
  await page.locator('[name="greeting"]').fill('歡迎來到茶店。');
  await page.locator('#studio-save-draft').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');

  const downloadPromise = page.waitForEvent('download');
  await page.locator('#studio-export').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await fs.readFile(await download.path(),'utf8'));
  const attached = exported.gameplay.initial_state.worldbookLibrary;
  expect(attached.installed).toHaveLength(1);
  expect(attached.enabled).toEqual([book.installed[0].meta.id]);
  expect(attached.installed[0].entries[1].review_required).toBe(false);
  expect(attached.installed[0].entries[2].enabled).toBe(false);
  expect(attached.installed[0].entries[1].content).toContain('onerror=');

  await page.reload();
  await page.waitForFunction(() => Boolean(window.BAOCharacterStudio?.getWorldbookLibrary));
  await page.getByRole('button', {name:'全部欄位'}).click();
  await page.locator('.studio-draft-row .studio-draft').first().click();
  await expect(page.locator('.studio-worldbook-pack')).toContainText('角色附屬世界書');
  const restored = await page.evaluate(() => window.BAOCharacterStudio.getWorldbookLibrary());
  expect(restored.installed).toHaveLength(1);
  expect(restored.enabled).toEqual(attached.enabled);
});
