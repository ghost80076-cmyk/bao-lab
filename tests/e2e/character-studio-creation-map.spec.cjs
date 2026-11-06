const { test, expect } = require('@playwright/test');
test.use({ reducedMotion: 'reduce' });

for (const width of [390, 1280]) {
  test('P3 creation map connects existing people, world, status and UI at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('./character-studio.html');
    await page.waitForFunction(() => Boolean(
      window.BAOStudioCreationMap && window.BAOCharacterStudio && window.BAOCharacterStudioFlow
    ));
    await page.evaluate(() => BAOCharacterStudioFlow.go('world'));

    const map = page.locator('#studio-creation-map');
    await expect(map).toBeVisible();
    await expect(map.locator('[data-creation-area]')).toHaveCount(4);
    await expect(map.locator('[data-creation-area="people"] [data-creation-state]')).toHaveText('尚未補充人物資料');
    await expect(map.locator('[data-creation-area="status"] [data-creation-state]')).toHaveText('尚未設定人物數值');
    await expect(map.locator('[data-creation-area="ui"] [data-creation-state]')).toHaveText('沿用夜灣原生閱讀介面');

    await page.evaluate(() => {
      BAOCharacterStudio.setInitialNPCs([{name:'林曼',role:'旅店老闆'}]);
      const data = BAOCharacterStudio.getAuthorStatusData();
      data.character_status = {enabled:true,fields:[{
        key:'affinity',label:'好感',type:'meter',min:-100,max:100,default:0,context:'relevant',track:true,description:'依互動證據調整。'
      }]};
      data.initial_state.character_statuses = {林曼:{affinity:12}};
      BAOCharacterStudio.setAuthorStatusData(data);
    });

    await expect(map.locator('[data-creation-area="people"] [data-creation-state]')).toHaveText('1 位初始 NPC');
    await expect(map.locator('[data-creation-area="status"] [data-creation-state]')).toHaveText('1 個欄位 · 1 位人物初始值');
    await expect(page.locator('[data-flow-step="world"]')).toHaveAttribute('data-state', 'complete');

    await map.locator('[data-creation-go="npcs"]').click();
    await expect(page.locator('#studio-npc-editor')).toHaveAttribute('open', '');
    await expect(page.locator('#studio-npc-editor summary')).toBeFocused();

    await page.evaluate(() => BAOCharacterStudioFlow.go('world'));
    await map.locator('[data-creation-go="status"]').click();
    await expect(page.locator('#studio-status-templates')).toHaveAttribute('open', '');
    await expect(page.locator('#studio-status-templates summary')).toBeFocused();

    await page.evaluate(() => BAOCharacterStudioFlow.go('world'));
    await map.locator('[data-creation-go="world"]').click();
    await expect(page.locator('[name="world"]')).toBeFocused();
    await page.locator('[name="world"]').fill('雨港終年多雨，旅店依港務時間營業。');
    await page.locator('[name="lore"]').fill('【世界書：港區｜港區】\n碼頭只在退潮時開放。\n【/世界書】');
    await expect(map.locator('[data-creation-area="world"] [data-creation-state]')).toHaveText('世界規則 ＋ 背景／按需世界書');

    await page.evaluate(() => BAOCharacterStudioFlow.go('world'));
    await map.locator('[data-creation-go="ui"]').click();
    await expect(page.locator('[data-flow-step="appearance"]')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('[name="phone_ui_enabled"]')).toBeFocused();
    await page.locator('[name="phone_ui_enabled"]').check();
    await page.evaluate(() => BAOCharacterStudioFlow.go('world'));
    await expect(map.locator('[data-creation-area="ui"] [data-creation-state]')).toContainText('手機');

    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      buttons: [...document.querySelectorAll('#studio-creation-map button')].map(button => button.getBoundingClientRect().height),
      columns: getComputedStyle(document.querySelector('.studio-creation-map-grid')).gridTemplateColumns.split(' ').length
    }));
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(Math.min(...geometry.buttons)).toBeGreaterThanOrEqual(44);
    expect(geometry.columns).toBe(width <= 800 ? 1 : 2);
  });
}
