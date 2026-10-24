const { test, expect } = require('@playwright/test');

for (const width of [390, 1440]) test(`selected story features survive regenerate and rewrite at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const bodies = [];
  await page.route('https://feature-audit.invalid/**', route => {
    bodies.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      choices: [{ message: { content: 'AUDIT_NEW_REPLY' } }], usage: { prompt_tokens: 100, completion_tokens: 5 }
    }) });
  });
  const alerts = [];
  page.on('dialog', dialog => {
    if (dialog.type() === 'prompt') return dialog.accept('保留結果，調整語氣。');
    alerts.push(dialog.message()); return dialog.dismiss();
  });
  await page.goto('./');
  await page.waitForFunction(() => window.BAOSettingsEffects && window.BAOContextInspector && window.BAOMobileReadingLayout && window.BAOStoryRevisionState && window.BAOActorMode && window.BAOStoryControlCenter && window.BAOPhoneStoryBridge && App.characters?.length && Storage.status().ready);
  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], id: 'feature-audit', name: '測試角色', system_prompt: 'AUDIT_CHARACTER', world_modules: [], character_status: { fields: [] }, gameplay: {} };
    App.config = { persona: { name: '旅人' }, narrativeMode: 'immersive', displayMode: 'text', stateTracking: false,
      narrative: {}, api: { type: 'custom', protocol: 'openai', model: 'audit', key: 'local-test',
        baseUrl: 'https://feature-audit.invalid/v1/chat/completions', stream: false, retryEnabled: false },
      memory: { mode: 'full', maxRounds: 20, maxContext: 64000 } };
    Chat.reset(); GameState.create(App.activeCharacter, App.config);
    Chat.add('user', 'AUDIT_QUERY');
    Chat.add('assistant', 'AUDIT_REJECTED_REPLY');
    // Toggle controls AFTER the original reply: revision rewind must keep them.
    GameState.current.actorMode = { enabled: true, roleActive: true, role: { label: 'AUDIT_IDENTITY' } };
    GameState.current.phoneSurface = { version: 1, enabled: true, userName: 'AUDIT_PHONE_OWNER' };
    GameState.current.worldbookLibrary = { version: 1, enabled: ['audit-pack'], pinned: {}, installed: [
      YoruWorldbookLibraryCore.normalizePack({ schema: YoruWorldbookLibraryCore.SCHEMA, version: 1,
        meta: { id: 'audit-pack', name: 'Audit', world: 'general' }, entries: [
          { id: 'fixed', mode: 'constant', content: 'AUDIT_FIXED' },
          { id: 'dynamic', mode: 'keyword', keywords: ['AUDIT_QUERY'], content: 'AUDIT_DYNAMIC' }
        ] })
    ] };
    App.showView('chat'); App.renderChatShell(false);
    BAONarrativeSettings.open();
  });
  // Exercise real controls, save handler, production wrappers and HTTP body.
  const modal = page.getByRole('dialog', { name: '今晚的故事' });
  await modal.locator('[data-pref="playerPortrayal"]').selectOption('coauthor');
  await modal.locator('[data-pref="responseLength"]').selectOption('short');
  await modal.locator('[data-narrative-save]').click();
  expect(bodies).toHaveLength(0);
  const openReplyActions = async () => {
    await page.evaluate(() => BAOMobileReadingLayout.syncMessageActions());
    const more = page.locator('.story-message-tools').last().locator('details.bao-message-more');
    if (await more.count() && await more.getAttribute('open') === null) {
      await more.locator('summary').click();
    }
  };
  await openReplyActions();
  await page.locator('[data-regenerate]').last().click();
  await expect.poll(() => bodies.length).toBe(1);
  await expect.poll(() => page.evaluate(() => Chat.messages.at(-1).content)).toBe('AUDIT_NEW_REPLY');
  const serialized = JSON.stringify(bodies[0]);
  for (const expected of ['AUDIT_CHARACTER', '玩家已授權小說共創', '300–600', 'AUDIT_IDENTITY', 'AUDIT_PHONE_OWNER', 'AUDIT_FIXED', 'AUDIT_DYNAMIC', '【本輪】']) expect(serialized).toContain(expected);
  expect(serialized).not.toContain('AUDIT_REJECTED_REPLY');
  await expect.poll(() => page.evaluate(() => GameState.current.actorMode?.role?.label)).toBe('AUDIT_IDENTITY');
  const checkEvidence = async kind => {
    await page.evaluate(()=>BAOStoryRevisionState.whenIdle());
    const snap=await page.evaluate(()=>BAOContextInspector.snapshot());
    expect(snap).not.toBeNull();expect(snap.kind).toBe(kind);expect(snap.status).toBe('success');
    for(const id of ['playerPortrayal','responseLength','phone-owner','worldbook']){
      expect(snap.settingsEffects.find(row=>row.id===id).evidence,`${kind}: ${id}`).toBe('included');
    }
    await page.evaluate(()=>BAOContextInspector.open());
    const inspector=page.getByRole('dialog',{name:'故事總覽',exact:true});
    await expect(inspector).toContainText(kind==='rewrite'?'AI 改寫':'重新生成');
    await expect(inspector).not.toContainText('AUDIT_CHARACTER');
    await inspector.getByRole('button',{name:'關閉故事總覽'}).click();
  };
  await checkEvidence('regenerate');
  await openReplyActions();
  await expect(page.locator('[data-rewrite]').last()).toBeEnabled();
  await page.locator('[data-rewrite]').last().click();
  await expect.poll(() => bodies.length).toBe(2);
  expect(JSON.stringify(bodies[1])).toContain('【本次任務】');
  expect(JSON.stringify(bodies[1])).toContain('AUDIT_IDENTITY');
  expect(JSON.stringify(bodies[1])).toContain('保留結果，調整語氣。');
  await checkEvidence('rewrite');
  await page.evaluate(()=>{Chat.messages.at(-1).content='AUDIT_DIFFERENT_VARIANT';});
  expect(await page.evaluate(()=>BAOContextInspector.snapshot())).toBeNull();
  expect(alerts).toEqual([]);
});
