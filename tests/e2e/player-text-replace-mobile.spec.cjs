const { test, expect } = require('@playwright/test');

test('mobile text replace keeps operations first and preserves story-scoped rules', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  await page.waitForFunction(() => Boolean(window.BAOPlayerTextReplace && App.characters?.length));

  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], greeting: '港口的燈還亮著。' };
    App.config = {
      persona: { name: '旅人', identity: '記者', relationship: '舊識' },
      narrativeMode: 'world',
      displayMode: 'ui',
      api: { model: 'mock-text-replace', baseUrl: 'https://example.invalid', key: 'EPHEMERAL_TEST_KEY' },
      memory: { maxRounds: 20, maxContext: 64000, mode: 'smart', cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add('assistant', App.activeCharacter.greeting);
    App.renderChatShell(false);
    App.showView('chat');
  });

  const open = page.locator('[data-bao-open="text-replace"]');
  await expect(open).toBeVisible();
  await open.click();

  let dialog = page.getByRole('dialog', { name: '文字替換 MOD' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.bao-modal-head .eyebrow')).toBeHidden();

  const help = dialog.getByRole('button', { name: '文字替換說明' });
  await expect(help).toBeVisible();
  const helpCopy = dialog.locator('p.bao-text-replace-help-copy').first();
  await expect(helpCopy).toBeHidden();

  const layout = await dialog.evaluate(node => ({
    scopeColumns: getComputedStyle(node.querySelector('.bao-choice-grid.two')).gridTemplateColumns.trim().split(/\s+/).length,
    footerPosition: getComputedStyle(node.querySelector('.bao-modal-footer')).position,
    previewOpen: node.querySelector('.bao-text-replace-preview').open
  }));
  expect(layout).toEqual({ scopeColumns: 2, footerPosition: 'sticky', previewOpen: false });

  await help.click();
  await expect(helpCopy).toBeVisible();
  await help.click();
  await expect(helpCopy).toBeHidden();

  await dialog.getByRole('button', { name: '＋ 新增替換' }).click();
  const rule = dialog.locator('[data-text-replace-rule]').first();
  await expect(rule).toBeVisible();
  await rule.getByRole('textbox', { name: '尋找文字' }).fill('二十歲');
  await rule.getByRole('textbox', { name: '替換成' }).fill('年齡保密');

  const preview = dialog.locator('.bao-text-replace-preview');
  await preview.locator('summary').click();
  await preview.locator('[data-text-replace-source]').fill('角色今年二十歲。');
  await preview.getByRole('button', { name: '產生預覽' }).click();
  await expect(preview.locator('[data-text-replace-result]')).toHaveValue('角色今年年齡保密。');

  await dialog.locator('#bao-text-replace-scope-status').check();
  await dialog.getByRole('button', { name: '儲存 MOD' }).click();
  await expect(dialog).toHaveCount(0);

  const saved = await page.evaluate(() => ({
    state: BAOPlayerTextReplace.get(),
    chat: BAOPlayerTextReplace.applyChat('二十歲', BAOPlayerTextReplace.get()),
    status: BAOPlayerTextReplace.applyStatus('二十歲', BAOPlayerTextReplace.get())
  }));
  expect(saved.state.active).toBe(true);
  expect(saved.state.scope).toEqual({ chat: true, status: true });
  expect(saved.state.rules).toHaveLength(1);
  expect(saved.state.rules[0]).toMatchObject({ find: '二十歲', replace: '年齡保密', enabled: true });
  expect(saved.chat).toBe('年齡保密');
  expect(saved.status).toBe('年齡保密');

  await open.click();
  dialog = page.getByRole('dialog', { name: '文字替換 MOD' });
  await expect(dialog.locator('[data-rule-find]')).toHaveValue('二十歲');
  await expect(dialog.locator('[data-rule-replace]')).toHaveValue('年齡保密');
  await expect(dialog.locator('#bao-text-replace-scope-status')).toBeChecked();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
