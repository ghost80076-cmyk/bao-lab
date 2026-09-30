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
    await expect(page.locator('#builder-api-guide')).toHaveCount(0);
    await expect(page.locator('#test-api')).toBeHidden();
    await expect(page.locator('#provider-diagnostics-box')).toBeHidden();
    await expect(page.locator('.bao-demo-box')).toBeHidden();
    await expect(page.locator('#bao-demo-mode')).toBeHidden();
    await expect(page.locator('#bao-quick-intro')).toContainText('使用帳號 API 額度');
    await expect(page.locator('#bao-quick-intro')).toContainText('選一個可用模型就能開始');
    await expect(page.locator('#bao-connection-account')).toBeVisible();
    await expect(page.locator('#bao-connection-help')).toHaveAttribute('href', 'quick-start.html');
    await expect(page.locator('#bao-connection-help')).toContainText('三步開始');

    await page.locator('[data-bao-connection="byok"]').click();
    await expect(page.locator('.bao-demo-box')).toBeVisible();
    await expect(page.locator('#bao-demo-mode')).toBeVisible();
    await page.locator('#api-type').selectOption('lmstudio');
    await expect(page.locator('#builder-view')).toHaveAttribute('data-bao-provider', 'lmstudio');
    await expect(page.locator('#bao-lm-builder')).toBeVisible();
    await expect(page.locator('#bao-lm-models')).toBeVisible();
    await expect(page.locator('#model-select').locator('..')).toBeHidden();
    await expect(page.locator('#api-key').locator('..')).toBeHidden();
    await expect(page.locator('#builder-api-guide')).toHaveCount(0);
    await expect(page.locator('#test-api')).toBeHidden();
    await expect(page.locator('#provider-diagnostics-box')).toBeHidden();
    await expect(page.locator('.bao-demo-box')).toBeHidden();
    await expect(page.locator('#bao-demo-mode')).toBeHidden();
    await expect(page.locator('#api-advanced-settings')).toBeHidden();
    await page.locator('#bao-lm-manual > summary').click();
    await page.locator('#bao-lm-model-manual').fill('manual-local-model');
    await expect(page.locator('#model-id')).toHaveValue('manual-local-model');
    await expectAllHidden(page.locator('[data-bao-gemini-cache-open]'));
    await expect(page.locator('#bao-quick-intro')).toContainText('不需要雲端 API Key');
    await expect(page.locator('#bao-connection-account')).toBeHidden();
    await expect(page.locator('#bao-connection-help')).toHaveAttribute('href', 'lm-studio-guide.html');
    await expect(page.locator('#bao-connection-help')).toContainText('LM Studio 連線教學');

    await page.locator('#api-type').selectOption('custom');
    await expect(page.locator('#bao-connection-help')).toHaveAttribute('href', 'api-guide.html');
    await expect(page.locator('#bao-connection-help')).toContainText('完整連線說明');
    await expect(page.locator('#test-api')).toBeHidden();
    await expect(page.locator('[data-run-provider-quick]')).toBeVisible();
    await expect(page.locator('.bao-relay-probe')).toBeVisible();
    await expect(page.locator('.bao-demo-box')).toBeVisible();
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


test('local preview is reset for each new story and is not persisted as a player preference', async ({ page }) => {
  await openBuilder(page, 390);
  await page.locator('button[data-bao-connection="byok"]').click();
  await page.locator('#api-type').selectOption('custom');
  await expect(page.locator('#bao-demo-mode')).toBeVisible();

  await page.locator('#bao-demo-mode').check();
  const storedHasDemoMode = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem('bao-lab:player-settings') || '{}');
    return Object.prototype.hasOwnProperty.call(stored, 'demoMode');
  });
  expect(storedHasDemoMode).toBe(false);

  await page.evaluate(() => App.startStory());
  await expect(page.locator('#chat-view')).toHaveClass(/active/);
  await page.evaluate(() => {
    App.exitChat();
    App.openBuilder();
    App.setStep(4);
  });

  await expect(page.locator('#bao-demo-mode')).not.toBeChecked();
  expect(await page.evaluate(() => App.collectConfig().demoMode)).toBe(false);
});

test('reconnecting AI immediately re-enables message AI tools', async ({ page }) => {
  await openBuilder(page, 390);
  await page.waitForFunction(() => window.BAOChatAPISettings && window.BAOStoryReader);

  await page.evaluate(() => {
    const config = App.collectConfig();
    config.api = {
      type: 'custom',
      protocol: 'openai',
      model: 'reconnect-test-model',
      baseUrl: 'https://example.invalid/v1',
      key: ''
    };
    config.demoMode = false;
    config.offlineWorldPreview = false;
    App.config = config;
    Chat.reset();
    GameState.create(App.activeCharacter, config);
    Chat.add('user', '測試重新連線');
    Chat.add('assistant', '這是一則等待重新連線的回覆。');
    App.renderChatShell(false);
    App.showView('chat');
  });

  const latest = page.locator('#chat-stream .message.assistant').last();
  await expect(latest.locator('[data-rewrite]')).toBeDisabled();
  await expect(latest.locator('[data-inspire]')).toHaveAttribute('title', /尚未連接 AI/);

  await page.evaluate(() => window.BAOChatAPISettings.open());
  const dialog = page.locator('#bao-chat-api-backdrop');
  await expect(dialog).toBeVisible();
  await dialog.locator('input[name="key"]').fill('test-key-not-sent');
  await dialog.getByRole('button', { name: '套用到目前故事' }).click();
  await expect(dialog).toBeHidden();

  await expect(latest.locator('[data-rewrite]')).toBeEnabled();
  await expect(latest.locator('[data-regenerate]')).toBeEnabled();
  await expect(latest.locator('[data-inspire]')).toBeEnabled();
});
