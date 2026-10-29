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
  test(`author styles stay advisory until explicit story save at ${width}px`, async ({ page }) => {
    await setup(page, width);
    await page.evaluate(() => {
      App.activeCharacter = { ...App.activeCharacter, narrative_profile: {
        recommended_styles: ['電影感', 'cinematic', '第二人稱', '慢熱關係', '<img src=x onerror=alert(1)>']
      } };
      App.config.narrative.playerPortrayal = 'coauthor';
      App.config.narrative.observationMode = 'one_turn';
    });
    const before = await page.evaluate(() => preferenceSnapshot());
    const prefs = await page.evaluate(() => structuredClone(App.config.narrative));
    await page.evaluate(() => BAONarrativeSettings.open());
    const modal = page.getByRole('dialog', { name: '今晚的故事' });
    const section = modal.locator('[data-author-style-section]');
    const cinematic = section.locator('[data-author-style="cinematic"]');
    await expect(section).toBeVisible();
    await expect(section.locator('[data-author-style]')).toHaveCount(1);
    await expect(section).toContainText('第二人稱');
    await expect(section).toContainText('慢熱關係');
    await expect(section.locator('img')).toHaveCount(0);
    await expect(cinematic).toHaveAttribute('aria-pressed', 'false');
    await cinematic.click();
    await expect(cinematic).toHaveAttribute('aria-pressed', 'true');
    await expect(section.locator('[data-author-style-status]')).toContainText('待按「套用設定」');
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);
    await modal.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    await page.evaluate(() => BAONarrativeSettings.open());
    await cinematic.click();
    await modal.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => App.config.narrative)).toEqual({
      ...prefs, stylePacks: [...prefs.stylePacks, 'cinematic']
    });
    expect(await page.evaluate(() => localStorage.getItem('bao-lab:narrative-settings-v1'))).toBe(before.defaults);
    expect(await page.evaluate(() => preferenceSaves)).toBe(1);
    expect(await page.evaluate(() => preferenceCalls)).toBe(0);
    await page.evaluate(() => BAONarrativeSettings.open());
    await expect(cinematic).toHaveAttribute('aria-pressed', 'true');
    await modal.locator('[data-narrative-reset]').click();
    await expect(cinematic).toHaveAttribute('aria-pressed', 'false');
    await modal.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => App.config.narrative.stylePacks)).toEqual([...prefs.stylePacks, 'cinematic']);

    await page.evaluate(() => {
      App.activeCharacter = { ...App.activeCharacter, narrative_profile: { recommended_styles: [] } };
      BAONarrativeSettings.open();
    });
    await expect(modal.locator('[data-author-style-section]')).toHaveCount(0);
  });

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

for (const width of [390, 1440]) {
  test(`player portrayal is explicit, story-local and cache-stable at ${width}px`, async ({ page }) => {
    await setup(page, width);
    const before = await page.evaluate(() => preferenceSnapshot());
    await page.evaluate(() => BAONarrativeSettings.open());
    const select = page.locator('[data-pref="playerPortrayal"]');
    await expect(select).toBeVisible();
    await expect(select).toHaveValue('strict');
    await select.selectOption('coauthor');
    await page.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    for (const mode of ['coauthor', 'natural', 'strict']) {
      await page.evaluate(() => BAONarrativeSettings.open());
      await select.selectOption(mode);
      await page.locator('[data-narrative-save]').click();
      const current = await page.evaluate(() => preferenceSnapshot());
      expect(await page.evaluate(() => App.config.narrative.playerPortrayal)).toBe(mode);
      expect(current.defaults).toBe(before.defaults);
      expect(current.calls).toBe(0);
      expect(current.messages).toContain('重要決策權');
      if (mode === 'coauthor') {
        expect(current.messages).toContain('玩家已授權小說共創');
        expect(current.messages).not.toMatch(/不替玩家補寫未輸入|不得替玩家決定台詞、心理或行動|不得自行生成玩家/);
      }
      expect(current.messages).not.toMatch(/不能扮演或控制玩家|角色之台詞、心理、決定與行動只能由玩家提供|除非忠實引用玩家已輸入的原話，不得生成玩家的新台詞/);
      if (mode === 'natural') expect(current.messages).toContain('不得新增玩家未表達');
      if (mode === 'strict') expect(current.messages).toContain('不替玩家補寫未輸入');
      await page.evaluate(() => BAONarrativeSettings.open());
      await page.locator('[data-narrative-save]').click();
      expect(await page.evaluate(() => preferenceSnapshot())).toEqual(current);
    }
    expect((await page.evaluate(() => preferenceSnapshot())).messages).toBe(before.messages);
  });
}

test('legacy stories do not inherit coauthor authorization from browser defaults', async ({ page }) => {
  await setup(page, 390, true);
  await page.evaluate(() => BAONarrativeSettings.set({ playerPortrayal: 'coauthor' }));
  const before = await page.evaluate(() => preferenceSnapshot());
  expect(before.messages).not.toContain('玩家已授權小說共創');
  expect(before.messages).toContain('不替玩家補寫未輸入');
  await page.evaluate(() => BAONarrativeSettings.open());
  await expect(page.locator('[data-pref="playerPortrayal"]')).toHaveValue('strict');
  await page.locator('[data-narrative-save]').click();
  expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);
  expect(await page.evaluate(() => App.collectConfig().narrative.playerPortrayal)).toBe('coauthor');
});

test('live NPC updates and discoveries preserve the actual request prefix', async ({ page }) => {
  await setup(page, 390);
  const result = await page.evaluate(async () => {
    App.activeCharacter = CharacterEngine.normalize({ id: 'npc-cache-test', name: '王宮',
      system_prompt: '世界自行運作。', initial_state: { npcs: [
        { name: '威廉', role: '侍從', personality: '冷靜', mood: '平靜', location: '大廳', outfit: '制服' }
      ] } });
    GameState.create(App.activeCharacter, App.config);
    const before = await App.buildMessages(App.config);
    GameState.current.npcs = [
      { name: '威廉', role: '管家', mood: '緊張', location: '庭院', outfit: '深藍外套', presence: 'present' },
      { name: '新朋友', role: '商人', location: '庭院', presence: 'present' }
    ];
    const after = await App.buildMessages(App.config);
    return { before, after };
  });
  expect(result.after[0].content).toBe(result.before[0].content);
  expect(result.after[0].content).not.toMatch(/深藍外套|新朋友/);
  expect(result.after.at(-1).content).toContain('深藍外套');
  expect(result.after.at(-1).content).toContain('新朋友｜商人');
});

// Opt-in story direction shares the existing narrative modal and never triggers an extra API call.
for (const width of [390, 1440]) {
  test(`scene focus and out-of-character expectations stay story-local at ${width}px`, async ({ page }) => {
    await setup(page, width);
    const before = await page.evaluate(() => preferenceSnapshot());
    await page.evaluate(() => BAONarrativeSettings.open());
    const focus = page.locator('[data-pref="sceneFocus"]');
    const expectation = page.locator('[data-pref-text="storyExpectation"]');
    await expect(focus).toHaveValue('card');
    await expect(expectation).toHaveValue('');
    await focus.selectOption('protect');
    await expectation.fill('希望兩人重新建立信任，但不能保證和好。');
    await page.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    await page.evaluate(() => BAONarrativeSettings.open());
    await focus.selectOption('protect');
    await expectation.fill('希望兩人重新建立信任，但不能保證和好。');
    await page.locator('[data-narrative-save]').click();
    const after = await page.evaluate(() => preferenceSnapshot());
    expect(after.saves).toBe(1);
    expect(after.calls).toBe(0);
    expect(after.defaults).toBe(before.defaults);
    expect(after.messages).toContain('【場景投入保護】');
    expect(after.messages).toContain('【玩家場外劇情期待｜非角色意圖】');
    expect(after.messages).toContain('希望兩人重新建立信任，但不能保證和好。');
    expect(await page.evaluate(() => App.config.narrative.sceneFocus)).toBe('protect');
    expect(await page.evaluate(() => App.config.narrative.storyExpectation)).toContain('希望兩人');
    expect(await page.evaluate(() => GameState.current.storySessionId)).toBe('cache-test-fixed-session');

    await page.evaluate(() => BAONarrativeSettings.open());
    await page.locator('[data-narrative-save]').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(after);
    await page.evaluate(() => BAONarrativeSettings.open());
    await focus.selectOption('card');
    await expectation.fill('');
    await page.locator('[data-narrative-save]').click();
    const reverted = await page.evaluate(() => preferenceSnapshot());
    expect(reverted.messages).toBe(before.messages);
    expect(reverted.calls).toBe(0);
  });
}


for (const width of [390, 1440]) {
  test(`one-turn spectator handoff is opt-in, cancelable and cache-friendly at ${width}px`, async ({ page }) => {
    await setup(page, width);
    const before = await page.evaluate(() => preferenceSnapshot());
    await page.evaluate(() => BAONarrativeSettings.open());
    const mode = page.locator('[data-pref="observationMode"]');
    await expect(mode).toHaveValue('off');
    await mode.selectOption('one_turn');
    await page.locator('.bao-modal-close').click();
    expect(await page.evaluate(() => preferenceSnapshot())).toEqual(before);

    await page.evaluate(() => BAONarrativeSettings.open());
    await mode.selectOption('one_turn');
    await page.locator('[data-narrative-save]').click();
    const on = await page.evaluate(() => preferenceSnapshot());
    expect(on.saves).toBe(1);
    expect(on.calls).toBe(0);
    expect(on.defaults).toBe(before.defaults);
    expect(on.messages).toContain('可選觀賞授權｜僅限本輪');
    expect(on.messages).not.toContain('【本輪觀賞授權】');
    await page.evaluate(() => {
      Chat.context = async () => [{ role: 'user', content: '繼續' }];
    });
    const observe = await page.evaluate(() => App.buildMessages(App.config));
    expect(observe[0].content).toContain('可選觀賞授權');
    expect(observe.at(-1).content).toContain('【本輪觀賞授權】');
    await page.evaluate(() => {
      Chat.context = async () => [{ role: 'user', content: '我推開門走出去。' }];
    });
    const playerTurn = await page.evaluate(() => App.buildMessages(App.config));
    expect(playerTurn[0].content).toBe(observe[0].content);
    expect(playerTurn.at(-1).content).not.toContain('【本輪觀賞授權】');
    expect(await page.evaluate(() => GameState.current.storySessionId)).toBe('cache-test-fixed-session');

    await page.evaluate(() => BAONarrativeSettings.open());
    await page.locator('[data-narrative-save]').click();
    expect((await page.evaluate(() => preferenceSnapshot())).saves).toBe(1);
    await page.evaluate(() => BAONarrativeSettings.open());
    await mode.selectOption('off');
    await page.locator('[data-narrative-save]').click();
    const off = await page.evaluate(() => App.buildMessages(App.config));
    expect(off[0].content).not.toContain('可選觀賞授權');
    expect(off.at(-1).content).not.toContain('【本輪觀賞授權】');
    expect(await page.evaluate(() => preferenceCalls)).toBe(0);
  });
}
