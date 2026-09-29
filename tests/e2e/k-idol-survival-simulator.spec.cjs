const { test, expect } = require('@playwright/test');

test('K-idol survival simulator renders setup, generated show state and action choices', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => App.characters?.some(c => c.id === 'k-idol-survival-simulator') && Storage.status().ready, null, { timeout: 15000 });

  await page.locator('#home-view [data-view="explore"]').click();
  await page.getByRole('button', { name: '男性' }).click();
  const card=page.locator('article.character-card').filter({hasText:'韓國偶像選秀模擬器'});
  await expect(card).toBeVisible();
  await card.click();

  await expect(page.locator('.idol-detail')).toBeVisible();
  await expect(page.locator('.idol-feature-grid article')).toHaveCount(4);
  await expect(page.locator('.idol-hero-art img')).toHaveAttribute('src',/k-idol-survival-cover\.webp/);

  await page.locator('[data-idol-start]').click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  await expect(page.locator('#idol-survival-setup')).toHaveCount(1);

  await page.getByRole('button',{name:'下一步'}).click();
  await page.getByRole('button',{name:'下一步'}).click();
  await page.locator('#idol-name').fill('韓知雨');
  await page.locator('#idol-age').fill('19');
  await page.locator('#idol-gender').fill('女');
  await page.locator('#idol-nationality').fill('韓國');
  await page.locator('#idol-vocal').selectOption({label:'B'});
  await page.locator('#idol-dance').selectOption({label:'A'});
  await page.locator('#idol-visual').selectOption({label:'B'});
  await page.locator('#idol-talent').selectOption({label:'C'});
  await page.locator('#idol-trait').selectOption({label:'舞台體質'});
  await page.locator('#idol-entry').selectOption('B');
  await page.locator('#idol-romance').selectOption({label:'慢熱開啟'});
  await page.locator('#idol-npc-mode').selectOption({label:'現實偶像／團體二創'});
  await page.locator('#idol-npc-text').fill('只保留公開舞台形象，轉成平行世界同場練習生');
  await expect(page.locator('#idol-survival-confirm')).toContainText('練習生資料確認');

  await page.getByRole('button',{name:'下一步'}).click();
  await page.locator('#api-advanced-settings > summary').click();
  await page.locator('#model-id').fill('local-browser-test');
  await page.locator('#base-url').fill('https://test.invalid/v1');
  await page.locator('#api-key').fill('TEMP_TEST_KEY');
  await page.getByRole('button',{name:'下一步'}).click();
  await expect(page.locator('#start-story')).toContainText('確認資料');
  await page.locator('#start-story').click();

  await expect(page.locator('.bao-structured-opening.bao-opening-idolsurvival')).toBeVisible();
  await expect(page.locator('.bao-opening-choice')).toHaveCount(4);
  await page.waitForFunction(() => GameState.current?.idolSurvivalInitializedVersion === 1);

  await page.locator('#bao-play-status-toggle').click();
  await page.getByRole('button',{name:'狀態',exact:true}).click();
  await expect(page.locator('.idol-status-shell')).toBeVisible();
  await expect(page.locator('.idol-status-card.profile')).toContainText('舞台體質');
  await expect(page.locator('.idol-status-card.profile')).toContainText('A');

  const setup=await page.evaluate(()=>({
    config:App.config.idolSurvivalSetup,
    show:GameState.current.modules.survival_show,
    profile:GameState.current.modules.trainee_profile,
    privateState:GameState.current.idolSurvivalPrivate
  }));
  expect(setup.config.name).toBe('韓知雨');
  expect(setup.config.entry).toBe('B');
  expect(setup.profile.company).not.toBe('無');
  expect(setup.profile.dance).toBe('A');
  expect(setup.show.program_name).toBe(setup.config.programName);
  expect(setup.show.debut_group).toBe(setup.config.debutGroup);
  expect(setup.privateState.npcMode).toBe('現實偶像／團體二創');

  await page.evaluate(()=>{
    Chat.add('assistant','紅燈亮起，練習室突然安靜。\n\n1. 留下來把副歌再跳五遍。\n2. 去找隊友確認走位。\n3. 先去補水休息。\n4. 問導師剛才最明顯的問題。\n5. 自由行動');
    window.BAOIdolSurvival.mountChoices();
  });
  await expect(page.locator('#idol-survival-turn-choices button')).toHaveCount(5);
  await page.locator('#idol-survival-turn-choices button[data-idol-choice="1"]').click();
  await expect(page.locator('#user-input')).toHaveValue('留下來把副歌再跳五遍。');
});
