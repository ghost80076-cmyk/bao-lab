const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test('memory workbench matches site themes and preserves story notes (' + width + 'px)', async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('./');
    await page.waitForFunction(() => Boolean(
      window.YoruExperience && window.BAOMemoryWorkbenchSimple &&
      window.BAOMemoryWorkbench && App.characters?.length && window.GameState
    ));
    await page.waitForFunction(() => [...document.styleSheets].some(
      sheet => sheet.href?.includes('memory-workbench.css')
    ));
    await page.evaluate(() => {
      App.activeCharacter = { ...App.characters[0], greeting:'燈還亮著。' };
      App.config = {
        persona:{ name:'旅人' }, narrativeMode:'immersive', displayMode:'ui',
        api:{ model:'mock' }, memory:{ mode:'smart', maxRounds:20, maxContext:32000 }
      };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      Chat.add('assistant', '燈還亮著。');
      Chat.add('user', '我翻開港口的筆記。');
      Chat.summary = '旅人曾在碼頭交換一封信。';
      window.BAOMemoryWorkbench.writeSlots([{
        id:'keep-test', title:'碼頭的約定', enabled:true, text:'明天一定要回到港口。'
      }]);
      App.renderChatShell(false);
      App.showView('chat');
    });
    const before = await page.evaluate(() => JSON.stringify(GameState.current));
    for (const theme of ['mist','dawn','dusk','sunset']) {
      await page.evaluate(value => {
        YoruExperience.choose({ theme:value });
        BAOMemoryWorkbench.open();
      }, theme);
      const palette = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const probe = document.createElement('span');
        document.body.append(probe);
        const pick = (property, cssName = 'backgroundColor') => {
          probe.style[cssName] = root.getPropertyValue(property).trim();
          return getComputedStyle(probe)[cssName];
        };
        const colors = {
          surface:pick('--yoru-surface'),
          card:pick('--yoru-card'),
          tool:pick('--yoru-tool'),
          text:pick('--yoru-text','color')
        };
        probe.remove();
        return colors;
      });
      const desk = page.locator('.memory-desk');
      await expect(desk).toBeVisible();
      await expect(desk).toHaveCSS('background-color', palette.surface);
      await expect(desk).toHaveCSS('color', palette.text);
      await expect(desk.locator('.memory-desk-nav')).toHaveCSS('background-color', palette.tool);
      await expect(desk.locator('.memory-health-card')).toHaveCSS('color', palette.text);
      await expect(desk.locator('.memory-note-card').first()).toHaveCSS('background-color', palette.card);
      await expect(desk.locator('.memory-summary-preview')).toHaveCSS('background-color', palette.card);
      await desk.locator('.memory-desk-tab[data-tab="notes"]').click();
      await expect(desk.locator('[data-slot-title]')).toHaveValue('碼頭的約定');
      await expect(desk.locator('[data-slot-text]')).toHaveValue('明天一定要回到港口。');
      expect(await page.evaluate(() => JSON.stringify(GameState.current))).toBe(before);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
      await desk.locator('.memory-desk-close').click();
      await expect(desk).toHaveCount(0);
    }
  });
}

for(const width of [390,1280]){
 test(`memory desk supports keyboard exit and restores the opener at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.goto('/');
  await page.waitForFunction(()=>window.BAOMemoryWorkbench && window.BAOStoryControlCenter && App.characters?.length);
  await page.evaluate(()=>{
   App.activeCharacter=App.characters[0];App.config={api:{model:'mock'},memory:{mode:'smart',maxRounds:20,maxContext:32000},persona:{name:'旅人'}};
   GameState.create(App.activeCharacter,App.config);Chat.reset();App.renderChatShell(false);App.showView('chat');
  });
  const opener=page.locator(width<=820?'#bao-mobile-composer-tools':'#bao-surface-mode-toggle');await opener.focus();
  const before=await page.evaluate(()=>JSON.stringify({state:GameState.current,config:App.config}));
  await page.evaluate(()=>BAOMemoryWorkbench.open());
  const desk=page.getByRole('dialog',{name:'記憶工作台',exact:true});await expect(desk).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert','');
  await expect(desk.locator('.memory-desk-close')).toBeFocused();
  await desk.evaluate(node=>{const items=[...node.querySelectorAll('button,input,textarea,select,a[href],summary,[tabindex]')].filter(n=>!n.disabled&&n.tabIndex>=0&&n.getClientRects().length);items.at(-1).focus();});
  await page.keyboard.press('Tab');expect(await desk.evaluate(n=>n.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');await expect(desk).toHaveCount(0);
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert','');await expect(opener).toBeFocused();
  expect(await page.evaluate(()=>JSON.stringify({state:GameState.current,config:App.config}))).toBe(before);
 });
}
