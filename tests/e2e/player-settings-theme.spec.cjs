const { test, expect } = require('@playwright/test');

for (const width of [390, 1280]) {
  test(`player settings use the current site theme without changing saved values at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.waitForFunction(() => !!window.YoruExperience && !!window.BAOPlayerSettings && App.characters?.length);

    await page.evaluate(() => {
      App.activeCharacter = App.characters[0];
      App.config = {
        persona:{name:'測試玩家'}, narrativeMode:'immersive', displayMode:'text',
        api:{model:'mock'}, memory:{maxRounds:20,maxContext:32000,mode:'rounds'}
      };
      GameState.create(App.activeCharacter, App.config);
      Chat.reset();
      App.renderChatShell(true);
      App.showView('chat');
    });

    const before = await page.evaluate(() => ({
      settings:JSON.stringify(BAOPlayerSettings.get()),
      story:JSON.stringify(GameState.current)
    }));
    for (const [theme,surface,text] of [
      ['mist','rgb(255, 250, 243)','rgb(69, 59, 52)'],
      ['rose','rgb(59, 48, 54)','rgb(243, 232, 230)']
    ]) {
      await page.evaluate(theme => YoruExperience.choose({theme}), theme);
      // The original story-sidebar buttons still own the click handlers.
      await page.locator('#bao-player-settings [data-bao-open="reply"]').evaluate(button => button.click());
      const modal = page.locator('.bao-player-modal');
      await expect(modal).toBeVisible();
      await expect(modal).toHaveCSS('background-color', surface);
      await expect(modal).toHaveCSS('color', text);
      await expect(modal.locator('.bao-choice').first()).toHaveCSS('color', text);
      await modal.getByRole('button', {name:'關閉'}).click();

      await page.locator('#bao-player-settings [data-bao-open="appearance"]').evaluate(button => button.click());
      await expect(modal).toBeVisible();
      await expect(modal).toHaveCSS('background-color', surface);
      await expect(modal.locator('.bao-bubble-preview')).toBeVisible();
      await expect(modal.locator('[data-appearance-tab="background"]')).toBeVisible();
      await modal.getByRole('button', {name:'關閉'}).click();
    }
    const after = await page.evaluate(() => ({
      settings:JSON.stringify(BAOPlayerSettings.get()),
      story:JSON.stringify(GameState.current)
    }));
    expect(after).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
  });
}
