const { test, expect } = require('@playwright/test');

const expectAllHidden = async locator => {
  const matches = await locator.all();
  expect(matches.length).toBeGreaterThan(0);
  for (const match of matches) await expect(match).toBeHidden();
};

const openBuilder = async (page, width) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOPlayerBuilderV2 && window.BAOLMStudio &&
    window.BAOProviderDiagnostics && document.querySelector('#api-type option[value="bao-credits"]') &&
    document.querySelector('#api-type option[value="lmstudio"]') && document.querySelector('#bao-demo-mode') && App.characters.length);
  await page.evaluate(async () => {
    const character = App.characters.find(item => item.id !== 'autonomous-npc-world');
    await App.openCharacter(character.id);
    App.openBuilder();
  });
  await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-setup', 'quick');
};

for (const width of [390, 1440]) {
  test(`connection routes expose only relevant controls at ${width}px`, async ({ page }) => {
    await openBuilder(page, width);

    await page.locator('#api-type').selectOption('bao-credits');
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-connection', 'hosted');
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-provider', 'bao-credits');
    await expect(page.locator('#model-select')).toBeVisible();
    await expect(page.locator('#api-type').locator('..')).toBeHidden();
    await expect(page.locator('#api-key').locator('..')).toBeHidden();
    await expect(page.locator('#builder-api-guide')).toBeHidden();
    await expect(page.locator('#test-api')).toBeHidden();
    await expect(page.locator('#provider-diagnostics-box')).toBeHidden();
    await expect(page.locator('#bao-demo-mode')).toBeHidden();
    await expect(page.locator('#bao-quick-intro')).toContainText('選一個模型就能開始');

    await page.locator('[data-bao-connection="byok"]').click();
    await expect(page.locator('#bao-demo-mode')).toBeVisible();
    await page.locator('#api-type').selectOption('lmstudio');
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-provider', 'lmstudio');
    await expect(page.locator('#bao-lm-builder')).toBeVisible();
    await expect(page.locator('#bao-lm-models')).toBeVisible();
    await expect(page.locator('#model-select').locator('..')).toBeHidden();
    await expect(page.locator('#api-key').locator('..')).toBeHidden();
    await expect(page.locator('#builder-api-guide')).toBeHidden();
    await expect(page.locator('#test-api')).toBeHidden();
    await expect(page.locator('#provider-diagnostics-box')).toBeHidden();
    await expect(page.locator('#bao-demo-mode')).toBeHidden();
    await expectAllHidden(page.locator('[data-bao-gemini-cache-open]'));
    await expect(page.locator('#bao-quick-intro')).toContainText('不需要雲端 API Key');

    await page.locator('#api-type').selectOption('custom');
    await expect(page.locator('#test-api')).toBeHidden();
    await expect(page.locator('[data-run-provider-quick]')).toBeVisible();
    await expect(page.locator('.bao-relay-probe')).toBeVisible();
    await expect(page.locator('#bao-demo-mode')).toBeVisible();
    await expectAllHidden(page.locator('[data-bao-gemini-cache-open]'));

    const viewport = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: innerWidth }));
    expect(viewport.content).toBeLessThanOrEqual(viewport.viewport + 1);
  });
}

test('local preview does not offer AI-only message actions', async ({ page }) => {
  await openBuilder(page, 390);
  await page.locator('[data-bao-setup="advanced"]').click();
  await page.evaluate(() => App.setStep(4));
  await page.locator('#bao-demo-mode').check();
  await page.evaluate(() => App.startStory());
  await page.locator('#user-input').fill('測試本機預覽按鈕');
  await page.locator('#chat-view .composer button.primary').click();
  const latest = page.locator('#chat-stream .message.assistant').last();
  await expect(latest.locator('[data-rewrite]')).toBeDisabled();
  await expect(latest.locator('[data-regenerate]')).toBeDisabled();
  await expect(latest.locator('[data-inspire]')).toBeDisabled();
  await expect(latest.locator('[data-inspire]')).toHaveAttribute('title', /連接 AI 後/);
  await expect(latest.locator('[data-edit]')).toBeEnabled();
  await expect(latest.locator('[data-copy]')).toBeEnabled();
});
