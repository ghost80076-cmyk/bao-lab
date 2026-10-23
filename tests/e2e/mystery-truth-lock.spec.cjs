const { test, expect } = require('@playwright/test');

// This verifies the actual story-local authoring UI and the existing reveal-flag
// mechanism without issuing a model request or changing the base prompt.
for (const width of [390, 1280]) {
  test(`author can precommit a mystery and reveal its clues without early spoiler at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto('./');
    await page.waitForFunction(() => window.YoruWorldbookLibrary && window.YoruWorldbookLibraryCore);
    await page.evaluate(() => {
      GameState.current = { location: '', npcs: [], events: [], worldbookLibrary: {
        version: 1, enabled: [], installed: [], pinned: {}
      } };
      window.mysterySaves = 0;
      App.saveStory = () => { window.mysterySaves++; };
      YoruWorldbookLibrary.open();
    });
    const modal = page.getByRole('dialog', { name: '世界書' });
    await expect(modal).toBeVisible();
    const details = modal.locator('.ylb-mystery-builder');
    await details.locator('summary').click();
    const form = details.locator('[data-mystery-form]');
    await form.locator('[name="title"]').fill('港口失蹤案');
    await form.locator('[name="truth"]').fill('真正的犯人是值班警衛。');
    await form.locator('[name="opening"]').fill('港口傳出失蹤消息。');
    await form.locator('[name="clues"]').fill('凌晨兩點有艘未登記船隻。\n監視器短暫中斷。');
    page.once('dialog', dialog => dialog.accept());
    await form.getByRole('button', { name: '固定案件真相 · 存入本故事' }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.worldbookLibrary.installed.length)).toBe(1);

    const initial = await page.evaluate(() => {
      const local = GameState.current.worldbookLibrary;
      const book = local.installed[0];
      return {
        source: book.meta.source,
        private: book.meta.visibility,
        enabled: local.enabled,
        saved: window.mysterySaves,
        truth: book.entries.find(entry => entry.id === 'sealed-truth').content,
        flags: book.entries.filter(entry => entry.requires.length).map(entry => entry.requires[0]),
        prompt: YoruWorldbookLibraryCore.select([book], [book.meta.id],
          {latestUser: '港口', flags: []}, {maxChars:10000,maxEntries:12}).text
      };
    });
    expect(initial).toMatchObject({ source: 'yorubay-mystery-case', private: 'private', enabled: [] });
    expect(initial.saved).toBe(1);
    expect(initial.truth).toContain('真正的犯人是值班警衛');
    expect(initial.flags).toHaveLength(3);
    expect(initial.prompt).toContain('港口傳出失蹤消息');
    expect(initial.prompt).not.toContain('真正的犯人');
    expect(initial.prompt).not.toContain('未登記船隻');
    expect(initial.prompt).not.toContain('監視器短暫中斷');

    const section = modal.locator('.ylb-collection').filter({hasText:'懸疑案件｜港口失蹤案'});
    await expect(section).toBeVisible();
    await section.locator('.ylb-collection-head input[type="checkbox"]').check();
    await section.locator('.ylb-chapters > summary').click();
    await section.locator('.ylb-condition-list > summary').click();
    await section.getByRole('checkbox', { name: '玩家已取得線索 1' }).check();
    const clueText = await page.evaluate(() => {
      const book = GameState.current.worldbookLibrary.installed[0];
      return YoruWorldbookLibraryCore.select([book], [book.meta.id],
        {latestUser:'港口',flags:GameState.current.worldbookFlags},
        {maxChars:10000,maxEntries:12}).text;
    });
    expect(clueText).toContain('未登記船隻');
    expect(clueText).not.toContain('真正的犯人');
    expect(clueText).not.toContain('監視器短暫中斷');

    page.once('dialog', dialog => dialog.dismiss());
    await section.getByRole('checkbox', { name: '真相已公開（解除模型保密鎖）' }).check();
    expect(await page.evaluate(() => GameState.current.worldbookFlags.some(f => f.endsWith('-truth-public')))).toBe(false);
    // Check again with intentional confirmation, using the same story-local flag.
    page.once('dialog', dialog => dialog.accept());
    await section.getByRole('checkbox', { name: '真相已公開（解除模型保密鎖）' }).check();
    const revealed = await page.evaluate(() => {
      const book = GameState.current.worldbookLibrary.installed[0];
      return YoruWorldbookLibraryCore.select([book], [book.meta.id],
        {latestUser:'港口',flags:GameState.current.worldbookFlags},
        {maxChars:10000,maxEntries:12}).text;
    });
    expect(revealed).toContain('真正的犯人是值班警衛');
    expect(revealed).not.toContain('監視器短暫中斷');
    expect(await page.evaluate(() => window.mysterySaves)).toBeGreaterThan(2);
  });
}
