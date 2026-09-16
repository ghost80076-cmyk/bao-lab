const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

test('provider diagnostics validates buffered, streaming and key privacy', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => window.BAOProviderDiagnostics && window.BAOProviderBrowserCompat && App.characters.length);
  await page.evaluate(() => {
    App.openCharacter(App.characters[0].id);
    App.openBuilder();
    App.setStep(4);
    const custom = App.modelPresets.findIndex(item => item.provider === 'custom' && item.protocol === 'openai');
    document.getElementById('api-type').value = 'custom';
    App.populateModelOptions();
    document.getElementById('model-select').value = String(custom);
    App.syncSelectedPreset();
    document.getElementById('model-id').value = 'diag-model';
    document.getElementById('base-url').value = new URL('provider-diag-mock', location.href).href;
    document.getElementById('api-key').value = 'E2E-DIAG-SECRET';
  });

  let requestCount = 0;
  await page.route('**/provider-diag-mock', async route => {
    requestCount += 1;
    const body = route.request().postDataJSON();
    if (body.stream) {
      await route.fulfill({
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
        body: [
          'data: {"choices":[{"delta":{"content":"O"}}]}',
          '',
          'data: {"choices":[{"delta":{"content":"K"}}]}',
          '',
          'data: [DONE]',
          ''
        ].join('\n')
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ choices: [{ message: { content: 'OK' } }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } })
    });
  });

  await expect(page.locator('#provider-diagnostics-box')).toBeVisible();
  await page.locator('[data-run-provider-diagnostics]').click();
  await expect(page.locator('#provider-diagnostics-status')).toHaveText(/完整驗收通過/);
  await expect(page.locator('#provider-diagnostics-result')).toContainText('SSE 已確認');
  await expect(page.locator('#provider-diagnostics-result')).toContainText('未發現 Key 持久化');
  expect(requestCount).toBe(2);

  const snapshot = await page.evaluate(() => ({
    result: window.BAOProviderDiagnostics.snapshot(),
    local: Object.keys(localStorage).map(key => localStorage.getItem(key)).join('\n'),
    session: Object.keys(sessionStorage).map(key => sessionStorage.getItem(key)).join('\n'),
    story: (typeof Storage.buildStoryPayload === 'function' && App.activeCharacter && window.GameState?.current) ? JSON.stringify(Storage.buildStoryPayload('diag')) : ''
  }));
  expect(JSON.stringify(snapshot.result)).not.toContain('E2E-DIAG-SECRET');
  expect(snapshot.local).not.toContain('E2E-DIAG-SECRET');
  expect(snapshot.session).not.toContain('E2E-DIAG-SECRET');
  expect(snapshot.story).not.toContain('E2E-DIAG-SECRET');

  await page.locator('[data-clear-provider-key]').click();
  await expect(page.locator('#api-key')).toHaveValue('');
  await expect(page.locator('#provider-diagnostics-status')).toHaveText(/已從輸入框清除/);
});
