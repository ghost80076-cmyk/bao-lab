const { test, expect } = require("@playwright/test");
const openStoryTools=async page=>{await page.evaluate(()=>BAOChatToolNavigation.openDrawer());const summary=page.locator('#bao-chat-tool-drawer details[data-chat-tool-group="story"] > summary');if(!await summary.evaluate(x=>x.parentElement.open))await summary.click();};

const openModelStep = async page => {
  await page.goto("/");
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await page.waitForFunction(() => !!window.BAOStoryActors && !!window.BAOWorkPackage);
  await page.getByRole("button", {name:"預覽 林沉風 - 見過黑暗的人",exact:true}).click();
  await page.getByRole("button", { name: "查看作品",exact:true }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.locator("#test-api")).toBeVisible();
};

const openDemoStory = async page => {
  await openModelStep(page);
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
  await openStoryTools(page);
  await expect(page.getByRole("dialog",{name:"故事功能選單"}).getByRole("button",{name:"完整故事備份",exact:true})).toBeVisible();
  await page.evaluate(() => BAOChatToolNavigation.closeDrawer());
};

test("full story bundle survives a device-style export and import with branches intact", async ({ page }) => {
  await openDemoStory(page);

  const seeded = await page.evaluate(async () => {
    App.config.api.key = "E2E-SECRET-MUST-NOT-LEAK";
    Chat.messages = Chat.ensureMessageIds([
      { role: "user", content: "第一輪玩家" },
      { role: "assistant", content: "第一輪角色" }
    ]);
    Chat.summary = "分岔前摘要";
    GameState.current.time = "深夜";
    GameState.current.location = "舊城";
    GameState.current.contextPack = { summary: "主線 Context Pack" };
    GameState.current.characterStatuses = { hero: { trust: 3 } };
    GameState.current.modules = { inventory: [{ id: "map", name: "舊城地圖", count: 1 }] };
    App.renderChatShell(false);
    App.saveStory(false);
    await BAOStoryLibrary.flush();
    const firstAssistantId = Chat.messages[1].id;

    Chat.messages.push(...Chat.ensureMessageIds([
      { role: "user", content: "沿主線去城門" },
      { role: "assistant", content: "主線抵達城門" }
    ]));
    Chat.summary = "主線摘要";
    GameState.current.time = "清晨";
    GameState.current.location = "城門";
    GameState.current.contextPack = { summary: "主線最新 Context Pack" };
    GameState.current.characterStatuses = { hero: { trust: 5 } };
    GameState.current.modules = { inventory: [{ id: "map", name: "舊城地圖", count: 1 }, { id: "key", name: "城門鑰匙", count: 1 }] };
    App.saveStory(false);
    await BAOStoryLibrary.flush();
    const rootRefs = BAOStoryLibrary.refs();

    const fork = await BAOStoryLibrary.createBranch(firstAssistantId, "碼頭線");
    Storage.restoreStory(fork);
    Chat.summary = "碼頭線摘要";
    GameState.current.time = "凌晨";
    GameState.current.location = "碼頭";
    GameState.current.contextPack = { summary: "碼頭線 Context Pack" };
    GameState.current.characterStatuses = { hero: { trust: 2 } };
    GameState.current.modules = { inventory: [{ id: "ticket", name: "船票", count: 1 }] };
    Chat.add("user", "前往碼頭");
    Chat.add("assistant", "分支抵達碼頭");
    App.saveStory(false);
    await BAOStoryLibrary.flush();
    const branchRefs = BAOStoryLibrary.refs();

    const bundle = await BAOStoryBackup.buildBundle();
    return { bundle, oldStoryId: rootRefs.storyId, rootChapterId: rootRefs.chapterId, branchChapterId: branchRefs.chapterId };
  });

  expect(seeded.bundle.schema).toBe("bao-lab-story-bundle");
  expect(seeded.bundle.chapters).toHaveLength(2);
  expect(seeded.bundle.activeChapterId).toBe(seeded.branchChapterId);
  expect(JSON.stringify(seeded.bundle)).not.toContain("E2E-SECRET-MUST-NOT-LEAK");

  await page.evaluate(async storyId => {
    // Simulate leaving the source device before importing: stop live-state autosaves.
    await BAOStoryLibrary.flush();
    GameState.current = null;Storage.clearStory();
    await Storage.flush?.();
    await BAOStoryLibrary.deleteStory(storyId);
  }, seeded.oldStoryId);
  await expect.poll(() => page.evaluate(async () => (await BAOStoryLibrary.listStories()).length)).toBe(0);

  await page.locator("#import-save-file").setInputFiles({
    name: "BAO-LAB-device-migration.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(seeded.bundle))
  });

  await expect.poll(() => page.evaluate(async () => (await BAOStoryLibrary.listStories()).length)).toBe(1);
  await expect(page.getByText("存檔匯入並確認寫入完成。",{exact:true})).toBeVisible();
  await expect(page.locator("[data-load-slot]")).toHaveCount(1);

  const restored = await page.evaluate(async () => {
    const stories = await BAOStoryLibrary.listStories();
    const story = stories[0];
    const chapters = await BAOStoryLibrary.listChapters(story.storyId);
    const root = chapters.find(chapter => !chapter.parentChapterId);
    const branch = chapters.find(chapter => chapter.parentChapterId);
    const rootPayload = await BAOStoryLibrary.reconstruct(story.storyId, root.chapterId);
    const branchPayload = await BAOStoryLibrary.reconstruct(story.storyId, branch.chapterId);
    const checkpoints = (await BAOStoryLibrary.allRecords()).filter(record => record.kind === "checkpoint" && record.storyId === story.storyId);
    return {
      storyId: story.storyId,
      title: story.title,
      activeChapterId: story.activeChapterId,
      root: { id: root.chapterId, location: rootPayload.state.location, summary: rootPayload.chat.summary, pack: rootPayload.contextPack?.summary, trust: rootPayload.state.characterStatuses?.hero?.trust, items: rootPayload.state.modules?.inventory?.map(item => item.name) || [] },
      branch: { id: branch.chapterId, parent: branch.parentChapterId, location: branchPayload.state.location, summary: branchPayload.chat.summary, pack: branchPayload.contextPack?.summary, trust: branchPayload.state.characterStatuses?.hero?.trust, items: branchPayload.state.modules?.inventory?.map(item => item.name) || [] },
      checkpointCount: checkpoints.length,
      slotKey: Storage.listSlots()[0]?.config?.api?.key || ""
    };
  });

  expect(restored.storyId).not.toBe(seeded.oldStoryId);
  expect(restored.root.location).toBe("城門");
  expect(restored.root.summary).toBe("主線摘要");
  expect(restored.root.pack).toBe("主線最新 Context Pack");
  expect(restored.root.trust).toBe(5);
  expect(restored.root.items).toContain("城門鑰匙");
  expect(restored.branch.parent).toBe(restored.root.id);
  expect(restored.branch.location).toBe("碼頭");
  expect(restored.branch.summary).toBe("碼頭線摘要");
  expect(restored.branch.pack).toBe("碼頭線 Context Pack");
  expect(restored.branch.trust).toBe(2);
  expect(restored.branch.items).toEqual(["船票"]);
  expect(restored.activeChapterId).toBe(restored.branch.id);
  expect(restored.checkpointCount).toBeGreaterThanOrEqual(2);
  expect(restored.slotKey).toBe("");

  await openStoryTools(page);
  await page.getByRole("dialog",{name:"故事功能選單"}).getByRole("button",{name:"手動備份清單",exact:true}).click();
  await page.locator("[data-load-slot]").click();
  await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("碼頭");
  await expect.poll(() => page.evaluate(() => Chat.summary)).toBe("碼頭線摘要");
  await expect.poll(() => page.evaluate(() => BAOStoryLibrary.refs().chapterId)).toBe(restored.branch.id);

  await openStoryTools(page);
  await page.getByRole("dialog",{name:"故事功能選單"}).getByRole("button",{name:/故事分支/}).click();
  await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();
  await expect(page.locator(".story-branch-row")).toHaveCount(2);
});

test('backup waits for the correct chapter and refuses stale data after a library failure', async ({ page, context }) => {
  await context.route('**/story-library-test-harness', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><script src="/js/storage.js"></script><script>window.Storage=Storage;</script><script src="/js/story-library.js"></script><script src="/js/story-backup.js"></script>'
  }));
  await page.goto('/story-library-test-harness');
  const result = await page.evaluate(async () => {
    const library = BAOStoryLibrary;
    await library.open();
    const payload = label => ({ characterId: 'hero', characterName: 'Hero', savedAt: new Date().toISOString(), config: {},
      chat: { messages: [{ id: 'u', role: 'user', content: label }, { id: 'a', role: 'assistant', content: label }], summary: '' }, state: {} });
    const a = library.beginStory('A');
    let release;
    library._writeQueue = new Promise(resolve => { release = resolve; });
    const queued = library.queuePersist(payload('A-progress'));
    const b = library.beginStory('B');
    release(); await queued;
    const aSaved = await library.reconstruct(a.storyId, a.chapterId);
    const bSaved = await library.reconstruct(b.storyId, b.chapterId);
    const stillB = library.refs().storyId === b.storyId;
    const snapshotId = 'snapshot:' + a.storyId + ':' + a.chapterId;
    try { await library.transaction('readwrite', store => { store.delete(snapshotId); throw Error('abort probe'); }); } catch {}
    const rolledBack = Boolean(await library.reconstruct(a.storyId, a.chapterId));
    library.adoptRefs({ _library: a });
    const persist = library.persist.bind(library);
    library.persist = async () => { throw Error('injected disk failure'); };
    Storage.saveStory = () => { library.queuePersist({ ...payload('latest'), _library: a }); return true; };
    let error = '';
    try { await BAOStoryBackup.buildBundle(); } catch (failure) { error = failure.message; }
    const prior = await library.reconstruct(a.storyId, a.chapterId);
    library.persist = persist;
    const bundle = await BAOStoryBackup.buildBundle();
    library.persist = async value => value._library.parentChapterId ? false : persist(value);
    let branchError = '';
    try { await library.createBranch('a', 'failed branch'); } catch (failure) { branchError = failure.message; }
    return { aText: aSaved?.chat.messages[0].content, bSaved, stillB, rolledBack, error,
      priorText: prior?.chat.messages[0].content, latestText: bundle.chapters[0].payload.chat.messages[0].content,
      branchError, originalChapter: library.refs().chapterId === a.chapterId };
  });
  expect(result.aText).toBe('A-progress');
  expect(result.bSaved).toBeNull();
  expect(result.stillB).toBe(true);
  expect(result.rolledBack).toBe(true);
  expect(result.error).toContain('最新章節尚未成功寫入');
  expect(result.priorText).toBe('A-progress');
  expect(result.latestText).toBe('latest');
  expect(result.branchError).toContain('新分支尚未成功寫入');
  expect(result.originalChapter).toBe(true);
});

test('restore failures preserve the active story and undo preference side effects', async ({ page }) => {
  await openDemoStory(page);
  await page.waitForFunction(() => !!window.BAOPlayerSettings && !!window.BAONarrativeSettings && !!window.BAOMemoryWorkbench && !!window.BAOWorldModules);
  await page.waitForTimeout(450);
  const result = await page.evaluate(async () => {
    const keys = ['bao-lab:player-settings', 'bao-lab:narrative-settings-v1', 'bao-lab:player-memory-slots'];
    // Building a payload normalizes message IDs and replaces Chat.messages.
    // Capture the baseline after that preparation, immediately before restore.
    const save = Storage.buildStoryPayload('restore probe');
    const original = { characters: App.characters, character: App.activeCharacter, config: App.config,
      messages: Chat.messages, state: GameState.current, raw: keys.map(key => localStorage.getItem(key)),
      player: BAOPlayerSettings.get(), narrative: BAONarrativeSettings.get() };
    save.chat.messages = [{ id: 'new-message', role: 'user', content: 'candidate story' }];
    save.preferences.player.appearance.fontSize = 23;
    save.preferences.memorySlots = [{ id: 'probe-note', title: 'probe', text: 'new note', enabled: true }];
    const intact = () => ({ characters: App.characters === original.characters, character: App.activeCharacter === original.character,
      config: App.config === original.config, messages: Chat.messages === original.messages, state: GameState.current === original.state });
    const prototype = Object.getPrototypeOf(localStorage), setItem = prototype.setItem;
    let failed = false;
    prototype.setItem = function(key, value) {
      if (!failed && key === keys[1]) { failed = true; throw new DOMException('injected quota failure', 'QuotaExceededError'); }
      return setItem.call(this, key, value);
    };
    let quotaResult;
    try { quotaResult = Storage.restoreStory(save); } finally { prototype.setItem = setItem; }
    const quotaPreserved = { ...intact(), raw: JSON.stringify(keys.map(key => localStorage.getItem(key))) === JSON.stringify(original.raw) };
    const ensure = BAOWorldModules.ensureState;
    const saveStory = App.saveStory;
    let saves = 0;
    App.saveStory = function(...args) { saves++; return saveStory.apply(this, args); };
    BAOWorldModules.ensureState = () => { GameState.current.injectedFailure = true; throw Error('world module probe'); };
    let moduleResult;
    try { moduleResult = Storage.restoreStory(save); } finally { BAOWorldModules.ensureState = ensure; }
    const runtimePreserved = { ...intact(), player: JSON.stringify(BAOPlayerSettings.get()) === JSON.stringify(original.player),
      narrative: JSON.stringify(BAONarrativeSettings.get()) === JSON.stringify(original.narrative),
      raw: JSON.stringify(keys.map(key => localStorage.getItem(key))) === JSON.stringify(original.raw) };
    await new Promise(resolve => setTimeout(resolve, 500));
    App.saveStory = saveStory;
    const retried = Storage.restoreStory(save);
    return { quotaResult, quotaPreserved, moduleResult, runtimePreserved, saves, retried,
      text: Chat.messages[0].content, error: Storage.status().lastRestoreError };
  });
  expect(result.quotaResult).toBe(false);
  expect(result.quotaPreserved).toEqual({ characters: true, character: true, config: true, messages: true, state: true, raw: true });
  expect(result.moduleResult).toBe(false);
  expect(result.runtimePreserved).toEqual({ characters: true, character: true, config: true, messages: true, state: true, raw: true, player: true, narrative: true });
  expect(result.saves).toBe(0);
  expect(result.retried).toBe(true);
  expect(result.text).toBe('candidate story');
  expect(result.error).toBe('');
});
