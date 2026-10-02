const { test, expect } = require('@playwright/test');

test('Night Sky Magic Academy renders enrollment, fixed mystery, status and choices', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.some(c => c.id === 'night-sky-magic-academy') && Storage.status().ready, null, { timeout: 15000 });

  await page.locator('#home-view [data-view="explore"]').click();
  await page.getByRole('button', { name: '男性' }).click();
  const card=page.locator('article.character-card').filter({hasText:'夜穹魔法學院'});
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole('button', { name: '查看作品', exact: true }).click();

  await expect(page.locator('.magic-detail')).toBeVisible();
  await expect(page.locator('.magic-house-grid article')).toHaveCount(4);
  const heroImage=page.locator('.magic-hero-art img');
  await expect(heroImage).toHaveAttribute('src',/night-sky-academy-cover-v2\.webp/);
  await expect.poll(()=>heroImage.evaluate(img=>img.naturalWidth)).toBeGreaterThanOrEqual(1700);

  await page.locator('[data-magic-start]').click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  await expect(page.locator('#magic-academy-setup')).toHaveCount(1);

  await page.getByRole('button',{name:'下一步'}).click();
  await page.getByRole('button',{name:'下一步'}).click();
  await page.locator('#magic-age').fill('18');
  await page.locator('#magic-gender').fill('女');
  await page.locator('#magic-origin').selectOption({label:'混合魔法家庭'});
  await page.locator('#magic-personality').selectOption({label:'聰明冷靜'});
  await page.locator('#magic-aptitude').selectOption('runes');
  await page.locator('#magic-house').selectOption('ceremony');
  await page.locator('#magic-mystery').selectOption('slow');
  await expect(page.locator('#magic-academy-confirm')).toContainText('入學資料確認');

  await page.getByRole('button',{name:'下一步'}).click();
  await page.locator('#api-advanced-settings > summary').click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button',{name:'下一步'}).click();
  await expect(page.locator('#start-story')).toContainText('確認入學');
  await page.locator('#start-story').click();

  await expect(page.locator('.bao-structured-opening.bao-opening-nightacademy')).toBeVisible();
  await expect(page.locator('.bao-opening-choice')).toHaveCount(4);
  await page.waitForFunction(() => GameState.current?.magicAcademyInitializedVersion === 1);

  await page.locator('#bao-play-status-toggle').click();
  await page.getByRole('button',{name:'狀態',exact:true}).click();
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="status"]')).toBeVisible();
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="status"]')).toContainText('待分院');
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="status"]')).toContainText('下一堂課');

  await page.getByRole('button',{name:'魔法',exact:true}).click();
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="magic"]')).toBeVisible();
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="magic"]')).toContainText('古代魔文');
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="magic"]')).toContainText('14 / 100');

  await page.getByRole('button',{name:'主線',exact:true}).click();
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="mystery"]')).toBeVisible();
  await expect(page.locator('.gameplay-ui-panel[data-gameplay-panel="mystery"]')).toContainText('線索簿');

  const setup=await page.evaluate(()=>({
    config:App.config.magicAcademySetup,
    runes:GameState.current.modules.magic_skills.runes,
    privateSeed:GameState.current.magicAcademyPrivate?.mysterySeed
  }));
  expect(setup.config.age).toBe(18);
  expect(setup.config.aptitude).toBe('runes');
  expect(setup.runes).toBe(14);
  expect(setup.privateSeed).toBe(setup.config.mysterySeed);
  expect(setup.privateSeed.length).toBeGreaterThan(8);

  await page.evaluate(()=>{
    Chat.add('assistant','鐘聲落下，走廊重新安靜。\n\n1. 去圖書館找舊校誌。\n2. 先回宿舍認識室友。\n3. 到星象台看看。\n4. 留在大廳觀察高年級生。\n5. 自由行動');
    window.BAONightSkyAcademy.mountChoices();
  });
  const choices = page.locator('#magic-academy-turn-choices [data-magic-choice]');
  const panel = page.locator('#magic-academy-turn-choices');
  const toggle = page.locator('#magic-academy-turn-choices-toggle');
  await expect(choices).toHaveCount(5);
  await expect(panel).toBeVisible();
  await expect(toggle).toBeHidden();

  await panel.locator('[data-magic-choice-collapse]').click();
  await expect(panel).toBeHidden();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded','false');

  await toggle.click();
  await expect(panel).toBeVisible();
  await expect(toggle).toBeHidden();

  await page.locator('#magic-academy-turn-choices [data-magic-choice="1"]').click();
  await expect(page.locator('#user-input')).toHaveValue('去圖書館找舊校誌。');
  await expect(panel).toBeHidden();
  await expect(toggle).toBeVisible();

  await page.evaluate(()=>{
    Chat.add('assistant','新的鐘聲響起。\n\n1. 前往溫室。\n2. 去餐廳找同學。\n3. 回宿舍整理筆記。\n4. 留在原地觀察。\n5. 自由行動');
    window.BAONightSkyAcademy.mountChoices();
  });
  await expect(page.locator('#magic-academy-turn-choices')).toBeVisible();
  await expect(page.locator('#magic-academy-turn-choices-toggle')).toBeHidden();
});
