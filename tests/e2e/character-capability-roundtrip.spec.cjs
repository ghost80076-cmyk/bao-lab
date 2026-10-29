const {test, expect} = require('@playwright/test');
const fs = require('node:fs/promises');
for (const width of [390, 1280]) {
  test(`import, edit, save and export retains story capabilities at ${width}px`, async ({page}) => {
    await page.setViewportSize({width, height: 844});
    const source = JSON.parse(await fs.readFile('data/characters/community/c4/kept-in-frame-lin-youzhen.json', 'utf8'));
    source.meta.name = '往返測試作品';
    source.presentation.reading_background = 'https://example.com/background.png';
    source.presentation.play_info_surface = 'game-ui';
    source.presentation.phone_ui = {enabled: true, userName: '玩家', contacts: [{id: 'friend', name: '朋友'}], threads: [{id: 'chat', name: '朋友', participants: ['friend'], messages: [{from: 'them', text: '你好'}]}], notes: [{id: 'note', title: '便條', text: '待辦'}]};
    source.gameplay.actor_mode = {enabled: true, role_active: false, default_role: {label: '攝影師'}};
    source.gameplay.timeline_policy = {mode: 'continuous'};
    await page.goto('./character-studio.html');
    await page.waitForFunction(() => Boolean(window.BAOCharacterStudio && window.BAOCharacterStudioFlow));
    await page.locator('#studio-file').setInputFiles({name: 'roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(source))});
    await expect(page.locator('[name="name"]')).toHaveValue('往返測試作品');
    await page.locator('[name="name"]').fill('往返測試作品・修訂');
    const before = await page.evaluate(() => BAOCharacterStudio.readCard());
    await page.locator('[data-flow-step="finish"]').click();
    await page.locator('#studio-save-draft').click();
    await expect(page.locator('#studio-status')).toContainText('已儲存');
    await page.reload();
    await page.waitForFunction(() => Boolean(window.BAOCharacterStudio && window.BAOCharacterStudioFlow));
    await page.locator('#studio-drafts button').filter({hasText: '往返測試作品・修訂'}).first().click();
    await page.locator('[data-flow-step="finish"]').click();
    const downloading = page.waitForEvent('download');
    await page.locator('#studio-export').click();
    const download = await downloading;
    const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
    const restored = await page.evaluate(card => CharacterEngine.normalize(card), exported);
    for (const key of ['story_startup', 'actor_mode', 'timeline_policy', 'gameplay_ui', 'phone_ui', 'reading_background', 'play_info_surface']) {
      expect(restored[key], key).toEqual(before[key]);
    }
    expect(exported.gameplay.ui_schema.builder.kind).toBe('story');
    expect(exported.gameplay.ui_schema.builder.fields[0].presentation).toBe('cards');
    expect(exported.gameplay.story_startup.cases).toEqual(source.gameplay.story_startup.cases);
  });
}
