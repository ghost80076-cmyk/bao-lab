const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.getByRole("button", { name: "探索作品" }).click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.locator("#test-api")).toBeVisible();
};

const openDemoStory = async page => {
  await openModelStep(page);
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
  await expect(page.locator("#export-story-button")).toBeVisible();
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
    await BAOStoryLibrary.deleteStory(storyId);
  }, seeded.oldStoryId);
  await expect.poll(() => page.evaluate(async () => (await BAOStoryLibrary.listStories()).length)).toBe(0);

  let importMessage = "";
  page.once("dialog", async dialog => {
    importMessage = dialog.message();
    await dialog.accept();
  });
  await page.locator("#import-save-file").setInputFiles({
    name: "BAO-LAB-device-migration.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(seeded.bundle))
  });

  await expect.poll(() => page.evaluate(async () => (await BAOStoryLibrary.listStories()).length)).toBe(1);
  await expect.poll(() => importMessage).toContain("匯入完成");
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

  await page.locator("[data-load-slot]").click();
  await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("碼頭");
  await expect.poll(() => page.evaluate(() => Chat.summary)).toBe("碼頭線摘要");
  await expect.poll(() => page.evaluate(() => BAOStoryLibrary.refs().chapterId)).toBe(restored.branch.id);

  await page.locator("#story-branch-button").click();
  await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();
  await expect(page.locator(".story-branch-row")).toHaveCount(2);
});
