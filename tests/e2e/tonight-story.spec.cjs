const { test, expect } = require('@playwright/test');
for (const width of [390, 1440]) {
  test(`tonight choices persist without losing advanced preferences at ${width}px`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    await page.waitForFunction(() => !!window.BAONarrativeSettings);
    await page.evaluate(() => {
      BAONarrativeSettings.set({stylePacks:['male_visual','male_blunt'], customInstructions:['保留有意義的沉默。'], density:'rich'});
      BAONarrativeSettings.open();
    });
    const modal = page.getByRole('dialog', {name:'今晚的故事'});
    await expect(modal.locator('.tonight-advanced')).not.toHaveAttribute('open','');
    await expect(modal.locator('[data-tonight-current]')).toContainText('自訂混搭');
    await modal.locator('[data-night="tender"]').click();
    await expect(modal.locator('[data-night][aria-pressed="true"]')).toHaveCount(1);
    await modal.locator('[data-pref="pacing"]').first().selectOption('slow');
    await modal.locator('[data-pref="characterAgency"]').first().selectOption('active');
    await modal.locator('[data-story-extra="threads"]').check();
    await modal.locator('[data-narrative-save]').click();
    const prefs = await page.evaluate(() => BAONarrativeSettings.get());
    expect(prefs).toMatchObject({stylePacks:['tender'], pacing:'slow',characterAgency:'active',storyExtras:['threads'], density:'rich'});
    expect(prefs.customInstructions[0].text).toBe('保留有意義的沉默。');
    await page.reload();
    await page.waitForFunction(() => !!window.BAONarrativeSettings);
    expect(await page.evaluate(() => BAONarrativeSettings.get())).toEqual(prefs);
    await page.evaluate(() => BAONarrativeSettings.openInstructions());
    await expect(page.locator('.tonight-advanced')).toHaveAttribute('open','');
    await expect(page.locator('[data-instruction-text]')).toBeFocused();
    await page.locator('.bao-modal-close').click();
    await page.evaluate(() => BAONarrativeSettings.open());
    const overflow = await modal.evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(overflow).toBe(false);
    await page.screenshot({path:`/tmp/tonight-${width}.png`});
    await modal.locator('[data-narrative-reset]').click();
    expect(await page.evaluate(() => BAONarrativeSettings.buildPrompt(BAONarrativeSettings.get()))).toBe('');
  });
}

test('story-local choices do not change defaults or another story', async ({page}) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.BAONarrativeSettings);
  await page.evaluate(() => {
    BAONarrativeSettings.set({stylePacks:['natural']});
    App.config={narrative:{stylePacks:['cinematic']}};
    document.getElementById('chat-view').classList.add('active');
    App.saveStory=()=>{};
    BAONarrativeSettings.open();
  });
  await page.locator('[data-night="mystery"]').click();
  await page.locator('[data-story-extra="surroundings"]').check();
  await page.locator('[data-narrative-save]').click();
  expect(await page.evaluate(() => App.config.narrative)).toMatchObject({stylePacks:['suspense'],storyExtras:['surroundings']});
  expect(await page.evaluate(() => BAONarrativeSettings.get().stylePacks)).toEqual(['natural']);
  await page.waitForFunction(() => !!window.BAOStoryControlCenter);
  expect(await page.evaluate(() => BAOStoryControlCenter.snapshot().narrative.detail)).toContain('懸疑氛圍');
});
