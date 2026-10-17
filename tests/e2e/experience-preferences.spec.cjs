const { test, expect } = require('@playwright/test');

test('desktop: theme and experience mode persist without changing story state', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience);
  await expect(page.locator('#yoru-experience-open')).toBeVisible();
  const before = await page.evaluate(() => ({
    story: localStorage.getItem('bao-lab:current-story'),
    api: localStorage.getItem('bao-lab:api')
  }));
  await page.locator('#yoru-experience-open').click();
  const modal = page.locator('#yoru-experience-dialog');
  await expect(modal).toBeVisible();
  await modal.locator('label[data-exp-theme="mist"]').click();
  await modal.locator('.yoru-exp-levels label').nth(2).click();
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','mist');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-experience','pro');
  await expect.poll(() => page.locator('html').evaluate(el =>
    getComputedStyle(el).getPropertyValue('--yoru-night').trim())).toBe('#f5f0e9');
  await modal.getByRole('button', { name: '完成' }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.YoruExperience);
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','mist');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-experience','pro');
  const after = await page.evaluate(() => ({
    story: localStorage.getItem('bao-lab:current-story'),
    api: localStorage.getItem('bao-lab:api')
  }));
  expect(after).toEqual(before);
});

test('mobile: new preference dialog is reachable, scrollable and does not overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience);
  const entry = page.locator('#yoru-experience-open');
  await expect(entry).toBeVisible();
  await entry.click();
  const dialog = page.locator('#yoru-experience-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('label[data-exp-theme="dusk"]').click();
  await dialog.locator('.yoru-exp-levels label').first().click();
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','dusk');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-experience','easy');
  const sizes = await page.evaluate(() => {
    const rect = document.querySelector('#yoru-experience-dialog').getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: innerWidth };
  });
  expect(sizes.left).toBeGreaterThanOrEqual(0);
  expect(sizes.right).toBeLessThanOrEqual(sizes.width+1);
  await dialog.getByRole('button', { name: '完成' }).click();
  await expect(dialog).not.toBeVisible();
});


for (const {theme,color,heroStop,cardSurface} of [
  {theme:'mist',color:'rgb(69, 59, 52)',heroStop:'rgb(251, 247, 241)'},
  {theme:'dusk',color:'rgb(246, 237, 244)',heroStop:'rgb(67, 56, 77)'}
]) {
  test('theme ' + theme + ' harmonizes the home, discovery and controls', async ({page}) => {
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    await page.waitForFunction(() => window.YoruExperience && document.querySelector('#home-view .brand-cinematic-hero h1'));
    await page.evaluate(theme => window.YoruExperience.choose({theme}),theme);
    const styles = await page.evaluate(() => {
      const hero = document.querySelector('#home-view .brand-cinematic-hero');
      const title = hero.querySelector('h1');
      return {
        title: getComputedStyle(title).color,
        hero: getComputedStyle(hero,'::before').backgroundImage,
        bg: getComputedStyle(document.documentElement).getPropertyValue('--yoru-night').trim()
      };
    });
    expect(styles.title).toBe(color);
    expect(styles.hero).toContain(heroStop);
    await expect(page.locator('#yoru-experience-open')).toBeVisible();
    // The selected palette persists and does not alter the text of the sample story.
    const prose = await page.locator('#home-view .brand-paper-prose').textContent();
    await page.reload();
    await page.waitForFunction(() => !!window.YoruExperience);
    await expect(page.locator('html')).toHaveAttribute('data-yoru-theme', theme);
    await expect(page.locator('#home-view .brand-paper-prose')).toHaveText(prose.trim());
    const card = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--yoru-card').trim());
    expect(card).toBe(theme === 'mist' ? '#fffaf4' : '#42394d');
    const paperInk = await page.locator('#home-view .brand-paper-page').evaluate(node => getComputedStyle(node).color);
    expect(paperInk).toBe('rgb(53, 44, 56)');
  });
}


test('My settings uses one shared appearance dialog and updates the selected theme and level', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience && !!window.BAOPlayerShellV2);
  await page.locator('#bao-mobile-nav [data-player-nav="me"]').click();
  const settings = page.locator('#me-view .bao-player-experience-setting');
  await expect(settings).toBeVisible();
  await expect(settings.locator('[data-bao-experience-state]')).toHaveText('夜港 · 輕鬆');
  await settings.getByRole('button', {name:'調整外觀'}).click();
  const dialog = page.locator('#yoru-experience-dialog');
  await expect(dialog).toBeVisible();
  await dialog.locator('label[data-exp-theme="mist"]').click();
  await dialog.locator('.yoru-exp-levels label').nth(1).click();
  await dialog.getByRole('button', {name:'完成'}).click();
  await expect(settings.locator('[data-bao-experience-state]')).toHaveText('月白 · 標準');
  await expect(page.locator('#yoru-experience-open')).toHaveAttribute('aria-label','外觀與操作設定');
  await page.reload();
  await page.waitForFunction(() => !!window.YoruExperience && !!window.BAOPlayerShellV2);
  await page.locator('#bao-mobile-nav [data-player-nav="me"]').click();
  await expect(page.locator('#me-view [data-bao-experience-state]')).toHaveText('晨霧 · 標準');
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','mist');
});

test('desktop appearance control has a visible label instead of a mystery icon', async ({page}) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/');
  await page.waitForFunction(() => !!window.YoruExperience);
  const entry = page.locator('#yoru-experience-open');
  await expect(entry).toBeVisible();
  await expect(entry.locator('.yoru-exp-label')).toHaveText('外觀');
  await expect(entry.locator('.yoru-exp-label')).toBeVisible();
  await entry.click();
  await expect(page.locator('#yoru-experience-dialog')).toBeVisible();
});
