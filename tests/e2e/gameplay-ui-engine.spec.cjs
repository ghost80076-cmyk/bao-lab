const { test, expect } = require('@playwright/test');

async function ready(page) {
  await page.goto('/');
  await page.waitForFunction(() => typeof App !== 'undefined' && typeof CharacterEngine !== 'undefined' && window.BAOGameplayUI && window.BAOGameplayUICore);
  await page.waitForTimeout(500);
}

test('legacy cards without gameplay_ui do not get the new builder', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    App.activeCharacter = CharacterEngine.normalize({
      id: 'legacy-ui-test',
      name: 'Legacy UI Test',
      system_prompt: 'test',
      greeting: 'hello',
      initial_state: {}
    });
    App.openBuilder();
  });
  await expect(page.locator('#bao-gameplay-builder')).toHaveCount(0);
});

test('gameplay schema renders builder, applies state, and drafts actions without auto-send', async ({ page }) => {
  await ready(page);
  const card = await page.evaluate(async () => (await fetch('tests/fixtures/gameplay-ui-demo-character.json')).json());
  await page.evaluate(raw => {
    App.activeCharacter = CharacterEngine.normalize(raw);
    App.openBuilder();
    App.setStep(3);
  }, card);

  const builder = page.locator('#bao-gameplay-builder');
  await expect(builder).toBeVisible();
  await expect(builder).toContainText('剩餘 6 / 6');

  const plus = page.locator('[data-gameplay-attribute="strength"] [data-gameplay-step="plus"]');
  await plus.click();
  await plus.click();
  await plus.click();
  await expect(builder).toContainText('剩餘 3 / 6');
  await page.locator('[data-gameplay-field="origin"]').selectOption('世家子弟');

  await page.evaluate(() => {
    const config = App.collectConfig();
    config.displayMode = 'ui';
    App.config = config;
    GameState.create(App.activeCharacter, config);
    BAOGameplayUI.renderPanel('status');
  });

  const panel = page.locator('#ui-panel');
  await expect(panel).toContainText('700 / 810');
  await expect(panel).toContainText('力量');
  await expect(panel).toContainText('11');
  await expect(panel).toContainText('世家子弟');

  await page.evaluate(() => BAOGameplayUI.renderPanel('combat'));
  await page.getByRole('button', { name: '穩健迎戰' }).click();
  await expect(page.locator('#user-input')).toHaveValue('我採取穩健策略迎戰，優先保命並觀察對手破綻。');
});
