const { test, expect } = require('@playwright/test');

async function setup(page, width, legacy = false) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('./');
  await page.waitForFunction(() => window.BAONarrativeSettings && window.BAOPromptCache && window.BAOPromptOrchestrator && window.BAOStoryControlCenter && Storage.status().ready && App.characters?.length);
  await page.evaluate(legacy => {
    // Deliberately reverse catalog order: merely opening the UI must not reorder a saved prompt.
    BAONarrativeSettings.set({ stylePacks: ['realist_subtext', 'natural'], storyExtras: ['threads', 'daily'],
      responseLength: 'long', pacing: 'slow', characterAgency: 'autonomous', density: 'rich',
      customInstructions: [{ text: '保留停頓。', enabled: true }] });
    App.activeCharacter = App.characters[0];
    App.config = { narrativeMode: 'world', displayMode: 'text', persona: { name: '旅人' },
      api: { type: 'custom', model: 'offline-test', key: '', baseUrl: '' },
      memory: { mode: 'manual', maxRounds: 20, maxContext: 32000, cache: true } };
    if (!legacy) App.config.narrative = BAONarrativeSettings.get();
    GameState.create(App.activeCharacter, App.config);
    GameState.current.storySessionId = 'cache-test-fixed-session';
    App.showView('chat');
    App.renderChatShell(false);
    window.preferenceSaves = 0;
    window.preferenceCalls = 0;
    App.saveStory = () => { window.preferenceSaves++; };
    API.send = () => { window.preferenceCalls++; throw new Error('Settings must not call a model'); };
    Chat.context = async () => [{ role: 'user', content: '繼續散步。' }];
    window.preferenceSnapshot = async () => {
      // Prompt assembly lazily initializes existing worldbook/actor state. Capture
      // after that work so the baseline is not a pre-initialization snapshot.
      const messages = JSON.stringify(await App.buildMessages(App.config));
      return ({
      config: JSON.stringify(App.config),
      state: JSON.stringify(GameState.current),
      defaults: localStorage.getItem('bao-lab:narrative-settings-v1'),
      messages,
      saves: window.preferenceSaves,
      calls: window.preferenceCalls
      });
    };
  }, legacy);
}

for (const width of [390, 1440]) {
  test(`reply controls preserve requests on cancel, reset-cancel and unchanged save at ${width}px`, async ({ page }) => {
    await setup(page, width);
    const before = await page.evaluate(() => preferenceSnapshot());
    await page.evaluate(() => BAONarrativeSettings.open());
    const modal = page.getByRole('dialog', { name: '今晚的故事' });
    for (const key of ['responseLength', 'pacing', 'characterAgency', 'dialogueBalance']) {
      await expect(modal.locator(`[data-pref="${key}"]`)).toHaveCount(1);
      await expect(modal.locator(`[data-pref="${key}"]`)).toBeVisible();
    }
    await modal.locator('[data-pref="responseLength"]').selectOption('short');
    await modal.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    await page.evaluate(() => BAONarrativeSettings.open());
    await modal.locator('[data-narrative-reset]').click();
    await expect(modal.locator('[data-pref="responseLength"]')).toHaveValue('card');
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);
    await modal.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    await page.evaluate(() => BAONarrativeSettings.open());
    await modal.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    // Selecting one axis must not rewrite saved styles, extras, instructions or other settings.
    const original = await page.evaluate(() => structuredClone(App.config.narrative));
    await page.evaluate(() => BAONarrativeSettings.open());
    await modal.locator('[data-pref="responseLength"]').selectOption('short');
    await modal.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => App.config.narrative)).toEqual({ ...original, responseLength: 'short' });
    const after = await page.evaluate(() => preferenceSnapshot());
    expect(after.defaults).toBe(before.defaults);
    expect(after.calls).toBe(0);
    expect(after.saves).toBe(1);
    expect(after.messages).toBe(before.messages.replace('900–1400', '300–600')
      .replace('以有效內容密度為優先，不為湊字數重複描寫或替玩家補行動。', '若當下只需要一句回應、停頓或短動作，可自然更短，不為湊字數重複。'));
    expect(await page.evaluate(() => GameState.current.storySessionId)).toBe('cache-test-fixed-session');

    await page.evaluate(() => BAONarrativeSettings.open());
    await modal.locator('[data-narrative-reset]').click();
    await modal.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => BAONarrativeSettings.buildPrompt(App.config.narrative))).toBe('');
    expect(await page.evaluate(() => preferenceCalls)).toBe(0);
  });
}

test('unchanged save leaves a legacy story without narrative fields intact', async ({ page }) => {
  await setup(page, 390, true);
  const before = await page.evaluate(() => preferenceSnapshot());
  await page.evaluate(() => BAONarrativeSettings.open());
  await page.locator('[data-narrative-save]').click();
  expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);
  expect(await page.evaluate(() => Object.hasOwn(App.config, 'narrative'))).toBe(false);
});

for (const width of [390, 1440]) {
  test(`story length takes precedence over reply defaults at ${width}px`, async ({ page }) => {
    await setup(page, width);
    await page.evaluate(() => BAOPlayerSettings.set({ ...BAOPlayerSettings.get(), replyLength: 'short' }));
    const before = await page.evaluate(() => preferenceSnapshot());
    expect(before.messages).toContain('900–1400');
    expect(before.messages).not.toContain('使用精簡回覆');

    await page.locator('[data-bao-open="reply"]').evaluate(button => button.click());
    const reply = page.getByRole('dialog', { name: '回覆設定' });
    await expect(reply).toContainText('會優先使用故事設定');
    await reply.locator('[data-setting="replyLength"][data-value="long"]').click();
    await reply.locator('.bao-modal-save').click();
    const after = await page.evaluate(() => preferenceSnapshot());
    expect(after.messages).toBe(before.messages);
    expect(after.config).toBe(before.config);
    expect(after.state).toBe(before.state);
    expect(after.calls).toBe(0);

    await page.evaluate(() => BAONarrativeSettings.open());
    await page.locator('[data-pref="responseLength"]').selectOption('card');
    await page.locator('[data-narrative-save]').click();
    const fallback = await page.evaluate(() => preferenceSnapshot());
    expect(fallback.messages).toContain('使用完整場景回覆');
    expect(fallback.messages).not.toContain('900–1400');
    expect(fallback.calls).toBe(0);
  });
}
