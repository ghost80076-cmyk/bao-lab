const {test,expect}=require('@playwright/test');
const fs=require('node:fs/promises');
test.use({reducedMotion:'reduce'});

for(const width of [320,390,1280]){
  test('fresh studio uses three fields and keeps advanced content intact at '+width+'px',async({page})=>{
    await page.setViewportSize({width,height:width===320?568:900});
    await page.goto('./character-studio.html');
    await page.waitForFunction(()=>Boolean(window.BAOStudioSimpleCreate && window.BAOCharacterStudio));
    await expect(page.locator('.studio-editor')).toHaveAttribute('data-studio-simple','true');
    await expect(page.locator('[data-simple-step]')).toHaveCount(3);
    await expect(page.locator('[name="name"]')).toBeVisible();
    await expect(page.locator('[name="system_prompt"]')).toBeVisible();
    await expect(page.locator('[name="greeting"]')).toBeHidden();
    await expect(page.locator('[name="id"]')).toBeHidden();
    await expect(page.locator('.studio-flow-nav')).toBeHidden();

    const generatedId=await page.locator('[name="id"]').inputValue();
    expect(generatedId).toMatch(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/);
    await page.locator('[name="name"]').fill('');
    await page.getByRole('button',{name:'下一步：故事開場'}).click();
    await expect(page.locator('#studio-simple-message')).toContainText('角色／作品名稱');

    await page.locator('[name="name"]').fill('精簡創作測試');
    await page.getByRole('button',{name:'下一步：故事開場'}).click();
    await expect(page.locator('#studio-simple-message')).toContainText('核心設定');
    await page.locator('[name="system_prompt"]').fill('角色保留自己的目標、口吻與資訊邊界。');
    await page.getByRole('button',{name:'下一步：故事開場'}).click();
    await expect(page.locator('[name="greeting"]')).toBeVisible();
    await expect(page.locator('[name="name"]')).toBeHidden();
    await page.locator('[name="greeting"]').fill('店門打開時，雨正落在騎樓上。');

    // Advanced mode edits the SAME source form fields, not proxy copies.
    await page.locator('#studio-simple-open-full').click();
    await expect(page.locator('.studio-flow-nav')).toBeVisible();
    await expect(page.locator('[name="name"]')).toBeVisible();
    await expect(page.locator('[name="system_prompt"]')).toBeHidden();
    await page.locator('[data-flow-step="world"]').click();
    await page.locator('[name="world"]').fill('港口城市；世界有自己的日常事件。');
    await page.locator('#studio-return-simple').click();
    await expect(page.locator('.studio-editor')).toHaveAttribute('data-studio-simple','true');
    await expect(page.locator('[name="system_prompt"]')).toHaveValue('角色保留自己的目標、口吻與資訊邊界。');
    await page.locator('[data-simple-step="opening"]').click();
    await expect(page.locator('[name="greeting"]')).toHaveValue('店門打開時，雨正落在騎樓上。');
    await page.locator('[data-simple-step="finish"]').click();
    await expect(page.locator('[data-simple-action="studio-preview-button"]')).toBeVisible();
    await page.locator('[data-simple-action="studio-preview-button"]').click();
    await expect(page.locator('#studio-preview-name')).toHaveText('精簡創作測試');
    await page.locator('[data-simple-action="studio-save-draft"]').click();
    await expect(page.locator('#studio-status')).toContainText('草稿已儲存');

    const downloadPromise=page.waitForEvent('download');
    await page.locator('[data-simple-action="studio-export"]').click();
    const download=await downloadPromise;
    const exported=JSON.parse(await fs.readFile(await download.path(),'utf8'));
    expect(exported.meta.id).toBe(generatedId);
    expect(exported.content.world).toBe('港口城市；世界有自己的日常事件。');
    expect(exported.content.system_prompt).toContain('資訊邊界');
    expect(exported.content.greeting).toContain('雨正落在');
    const widthOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
    expect(widthOverflow).toBeLessThanOrEqual(1);

    await page.reload();
    await page.waitForFunction(()=>Boolean(window.BAOStudioSimpleCreate && window.BAOCharacterStudio));
    await page.locator('.studio-draft-row .studio-draft').first().click();
    await expect(page.locator('.studio-editor')).toHaveAttribute('data-studio-simple','false');
    await page.locator('[data-flow-step="world"]').click();
    await expect(page.locator('[name="world"]')).toHaveValue('港口城市；世界有自己的日常事件。');
  });
}

test('advanced worldbook and role fields survive round-trip through simple UI',async({page})=>{
  await page.goto('./character-studio.html');
  await page.waitForFunction(()=>Boolean(window.BAOStudioSimpleCreate && window.BAOCharacterStudio?.addWorldbookPack));
  await page.locator('#studio-simple-open-all').click();
  await page.locator('[name="name"]').fill('世界書角色');
  await page.locator('[name="system_prompt"]').fill('每個人物各自根據資訊行動。');
  await page.locator('[name="greeting"]').fill('從港口開始。');
  await page.locator('.studio-advanced').first().locator('summary').first().click();
  await page.locator('[name="profile"]').fill('主要角色原始資料');
  const pack=await page.evaluate(()=>{
    const core=window.YoruWorldbookLibraryCore;
    const item=core.migrateLegacy({entries:{"0":{key:["港口"],comment:"地點",content:"原始世界書內容",disable:false}}},'測試世界書');
    return window.BAOCharacterStudio.addWorldbookPack(item);
  });
  expect(pack.entries[0].content).toBe('原始世界書內容');
  await page.locator('#studio-return-simple').click();
  await expect(page.locator('[name="name"]')).toBeVisible();
  await page.locator('[data-simple-step="opening"]').click();
  await page.locator('[data-simple-step="finish"]').click();
  await page.locator('[data-simple-action="studio-save-draft"]').click();
  await expect(page.locator('#studio-status')).toContainText('草稿已儲存');
  const card=await page.evaluate(()=>window.BAOCharacterStudio.readCard());
  expect(card.profile['AI 主角色設定']).toBe('主要角色原始資料');
  expect(card.initial_state.worldbookLibrary.installed[0].entries[0].content).toBe('原始世界書內容');
  expect(card.initial_state.worldbookLibrary.enabled).toHaveLength(0);
});
