const { test, expect } = require('@playwright/test');

const THEMES = [
  { id:'night', name:'夜港', dark:true, surface:'#080d14' },
  { id:'mist', name:'月白', dark:false, surface:'#f5f0e9' },
  { id:'dawn', name:'晨霧', dark:false, surface:'#edf3f5' },
  { id:'dusk', name:'暮霞', dark:true, surface:'#302c3c' },
  { id:'sunset', name:'夕燈', dark:false, surface:'#fff0df' },
];
const color = hex => {
  const raw = hex.replace('#', '');
  const values = raw.length === 3
    ? [...raw].map(x => parseInt(x + x, 16))
    : [0,2,4].map(i => parseInt(raw.slice(i,i+2),16));
  return values.map(value => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055)/1.055)**2.4;
  });
};
const luminance = hex => color(hex).reduce((total,v,i) => total+v*[.2126,.7152,.0722][i],0);
const ratio = (a,b) => {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
};

test('five named time-of-day appearances expose readable semantic surfaces', async ({page}) => {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await page.waitForFunction(() => window.YoruExperience?.choose && document.querySelector('link[href^="css/experience-preferences.css"]')?.sheet &&
    document.querySelector('#home-view .brand-cinematic-hero h1'));
  const heroColors = [];
  for (const item of THEMES) {
    await page.evaluate(theme => YoruExperience.choose({theme}),item.id);
    const state = await page.evaluate(() => {
      const root = document.documentElement;
      const value = name => getComputedStyle(root).getPropertyValue(name).trim();
      return {
        theme:root.dataset.yoruTheme,
        scheme:getComputedStyle(root).colorScheme,
        bg:value('--yoru-night'),
        surface:value('--yoru-card'),
        text:value('--yoru-text'),
        reading:value('--yoru-reading'),
        readingText:value('--yoru-story-text'),
        muted:value('--yoru-muted'),
        hero:getComputedStyle(document.querySelector('#home-view .brand-cinematic-hero'),'::before').backgroundImage,
        title:getComputedStyle(document.querySelector('#home-view .brand-cinematic-hero h1')).color,
        meta:document.querySelector('meta[name="theme-color"]').content,
      };
    });
    expect(state.theme).toBe(item.id);
    expect(state.bg).toBe(item.surface);
    expect(state.meta).toBe(item.id === 'night' ? '#15191d' : item.surface);
    if (item.id !== 'night') expect(state.scheme).toContain(item.dark ? 'dark' : 'light');
    expect(ratio(state.bg,state.text), item.name+' body text').toBeGreaterThanOrEqual(4.5);
    expect(ratio(state.surface,state.text), item.name+' cards').toBeGreaterThanOrEqual(4.5);
    expect(ratio(state.reading,state.readingText), item.name+' reading').toBeGreaterThanOrEqual(4.5);
    expect(state.hero).toContain('linear-gradient');
    heroColors.push(state.hero);
  }
  expect(new Set(heroColors).size).toBe(5);
});

test('five choices fit mobile without horizontal scroll and persist', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await page.waitForFunction(() => window.YoruExperience?.choose);
  await page.locator('#yoru-experience-open').click();
  const panel = page.locator('#yoru-experience-dialog');
  await expect(panel).toBeVisible();
  expect(await panel.locator('input[name="yoru-theme"]').count()).toBe(5);
  for (const item of THEMES) {
    const choice = panel.locator(`label[data-exp-theme="${item.id}"]`);
    await expect(choice).toContainText(item.name);
    await choice.click();
    await expect(page.locator('html')).toHaveAttribute('data-yoru-theme',item.id);
    await expect(choice.locator('input')).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
  }
  await panel.getByRole('button',{name:'完成'}).click();
  await page.reload();
  await page.waitForFunction(() => Boolean(window.YoruExperience?.get));
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','sunset');
  await page.locator('#bao-mobile-nav [data-player-nav="me"]').click();
  await expect(page.locator('#me-view [data-bao-experience-state]')).toHaveText('夕燈 · 輕鬆');
});

test('old rose choice upgrades to dusk without touching local story state', async ({page}) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('yorubay:experience:v1',JSON.stringify({theme:'rose',level:'standard'})));
  const before = await page.evaluate(() => ({
    story:localStorage.getItem('bao-lab:current-story'),
    api:localStorage.getItem('bao-lab:api'),
  }));
  await page.reload();
  await page.waitForFunction(() => window.YoruExperience?.get);
  await expect(page.locator('html')).toHaveAttribute('data-yoru-theme','dusk');
  await page.locator('#yoru-experience-open').click();
  await expect(page.locator('input[name="yoru-theme"][value="dusk"]')).toBeChecked();
  const after = await page.evaluate(() => ({
    story:localStorage.getItem('bao-lab:current-story'),
    api:localStorage.getItem('bao-lab:api'),
  }));
  expect(after).toEqual(before);
});
