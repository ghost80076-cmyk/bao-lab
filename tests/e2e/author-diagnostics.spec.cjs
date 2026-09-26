const { test, expect } = require('@playwright/test');
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

const minimal = {
  schema_version: '1.5',
  meta: { id: 'audit-test', name: '測試作者', category: 'female' },
  content: { greeting: '角色在雨夜向玩家打招呼。', system_prompt: '你是角色，根據已知資訊行動。' },
  gameplay: { supported_modes: { immersive: true, world: false } },
  presentation: { supported_display: { text: true, ui: false } }
};

test('author can inspect JSON with field paths and safe errors on the real site', async ({ page }) => {
  await page.goto('./');
  await page.locator('#home-view [data-view="explore"]').click();
  const picker = page.locator('input[type="file"][data-character-audit-file="true"]');
  await expect(picker).toHaveCount(1);
  const missing = structuredClone(minimal);
  missing.content.system_prompt = '';
  await picker.setInputFiles({ name: 'bad-card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(missing)) });
  const modal = page.locator('#bao-character-audit-modal');
  await expect(modal).toContainText('尚不可匯入');
  await expect(modal).toContainText('$.content.system_prompt');
  await expect(modal).toContainText('描述角色人格');
  await modal.locator('[data-close]').click();

  await picker.setInputFiles({ name: 'good-card.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(minimal)) });
  await expect(modal).toContainText('結構可匯入');
  await expect(modal).toContainText('不代表模型演出分數');
  await modal.locator('[data-close]').click();

  await picker.setInputFiles({ name: 'syntax.json', mimeType: 'application/json', buffer: Buffer.from('{"meta":,}') });
  await expect(modal).toContainText('JSON 語法錯誤');
  await expect(modal).toContainText('尾端多餘逗號');
});

test('relay browser probe uses a fixed fake key, never the user key', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOAuthorDiagnostics && window.BAOProviderDiagnostics && App.characters?.length));
  await page.evaluate(() => {
    App.openCharacter(App.characters[0].id);
    App.openBuilder();
    App.setStep(4);
    document.getElementById('base-url').value = 'https://relay.example.test/v1/chat/completions';
    document.getElementById('api-key').value = 'USER_SECRET_DO_NOT_TRANSMIT';
  });
  let count = 0;
  await page.route('https://relay.example.test/v1/chat/completions', async route => {
    count++;
    const request = route.request();
    expect(request.headers().authorization || '').not.toContain('USER_SECRET_DO_NOT_TRANSMIT');
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'authorization,content-type' } });
    } else {
      expect(request.headers().authorization).toBe('Bearer BAO_LAB_INVALID_PROBE_KEY');
      await route.fulfill({ status: 401, headers: { 'access-control-allow-origin': '*', 'content-type': 'application/json' }, body: '{"error":{"message":"invalid token"}}' });
    }
  });
  await expect(page.locator('[data-relay-probe]')).toBeVisible();
  await page.locator('[data-relay-probe]').click();
  await expect(page.locator('[data-relay-probe-status]')).toContainText('HTTP 401');
  expect(count).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#api-key')).toHaveValue('USER_SECRET_DO_NOT_TRANSMIT');
  const saved = await page.evaluate(() => JSON.stringify({ local: Object.keys(localStorage).map(key => localStorage.getItem(key)), session: Object.keys(sessionStorage).map(key => sessionStorage.getItem(key)) }));
  expect(saved).not.toContain('USER_SECRET_DO_NOT_TRANSMIT');
});
