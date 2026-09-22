const { test, expect } = require("@playwright/test");

const targetURL = () => process.env.BAO_LIVE_URL || "/";

const openDemoStory = async page => {
  await page.goto(targetURL(), { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.getByRole("button", { name: "探索作品" }).click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
  await expect.poll(() => page.evaluate(() => Boolean(window.BAOStoryLibrary && window.Storage && window.Chat))).toBe(true);
};

test("1,000-round story survives save, reload, reconstruction and a 500-round branch", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Heavy long-story stress is intentionally run once on Chromium; cross-browser UI coverage runs separately.");
  test.setTimeout(90_000);

  await openDemoStory(page);

  const seeded = await page.evaluate(async () => {
    const makeText = (round, side) => `${side} 第 ${round} 輪｜${"場景、動作、關係與事件延續。".repeat(4)}｜ROUND-${String(round).padStart(4, "0")}`;
    Chat.messages = [];
    Chat.summary = "";
    Chat.summarizedUntil = 0;
    App.config.api.key = "E2E-LONG-STORY-SECRET";

    let from = 1;
    let branchPointId = "";
    for (const milestone of [250, 500, 1000]) {
      for (let round = from; round <= milestone; round += 1) {
        Chat.add("user", makeText(round, "PLAYER"));
        Chat.add("assistant", makeText(round, "CHARACTER"));
      }
      GameState.current.time = `里程碑-${milestone}`;
      GameState.current.location = `區域-${milestone}`;
      GameState.current.events = [`完成第 ${milestone} 輪`, `仍在區域-${milestone}`];
      Chat.summary = `截至第 ${milestone} 輪的壓測摘要`;
      Chat.summarizedUntil = Math.max(0, Chat.messages.length - 40);
      App.saveStory(false);
      await Storage.flush();
      await BAOStoryLibrary.flush();
      if (milestone === 500) branchPointId = Chat.messages[999].id;
      from = milestone + 1;
    }

    const refs = BAOStoryLibrary.refs();
    const save = Storage.loadStory();
    return {
      refs,
      branchPointId,
      count: Chat.messages.length,
      ids: [Chat.messages[0].id, Chat.messages[999].id, Chat.messages[1999].id],
      samples: [Chat.messages[0].content, Chat.messages[999].content, Chat.messages[1999].content],
      secretPersisted: JSON.stringify(save).includes("E2E-LONG-STORY-SECRET")
    };
  });

  expect(seeded.count).toBe(2000);
  expect(seeded.secretPersisted).toBe(false);
  expect(seeded.branchPointId).toBe(seeded.ids[1]);

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(() => App.characters?.length > 0 && Boolean(window.BAOStoryLibrary))).toBe(true);

  const restored = await page.evaluate(async seeded => {
    await Storage.ready();
    await BAOStoryLibrary.flush();
    const save = Storage.loadStory();
    if (!save) throw new Error("Autosave missing after page reload");
    if (!Storage.restoreStory(save)) throw new Error("Autosave could not be restored after page reload");

    const ids = [Chat.messages[0]?.id, Chat.messages[999]?.id, Chat.messages[1999]?.id];
    const samples = [Chat.messages[0]?.content, Chat.messages[999]?.content, Chat.messages[1999]?.content];
    const unique = new Set(Chat.messages.map(message => message.id)).size;
    const root = await BAOStoryLibrary.reconstruct(seeded.refs.storyId, seeded.refs.chapterId);
    const branch = await BAOStoryLibrary.createBranch(seeded.branchPointId, "500 輪壓測分支");
    const branchRefs = BAOStoryLibrary.refs();
    const rootAfter = await BAOStoryLibrary.reconstruct(seeded.refs.storyId, seeded.refs.chapterId);
    const branchAfter = await BAOStoryLibrary.reconstruct(seeded.refs.storyId, branchRefs.chapterId);

    return {
      count: Chat.messages.length,
      unique,
      ids,
      samples,
      restoredKey: App.config.api.key,
      rootCount: root.chat.messages.length,
      rootLocation: root.state.location,
      branchCount: branch.chat.messages.length,
      branchLocation: branch.state.location,
      branchParent: branchRefs.parentChapterId,
      rootAfterCount: rootAfter.chat.messages.length,
      rootAfterLocation: rootAfter.state.location,
      branchAfterCount: branchAfter.chat.messages.length,
      branchAfterLocation: branchAfter.state.location,
      branchKey: branch.config.api.key
    };
  }, seeded);

  expect(restored.count).toBe(2000);
  expect(restored.unique).toBe(2000);
  expect(restored.ids).toEqual(seeded.ids);
  expect(restored.samples).toEqual(seeded.samples);
  expect(restored.restoredKey).toBe("");
  expect(restored.rootCount).toBe(2000);
  expect(restored.rootLocation).toBe("區域-1000");
  expect(restored.branchCount).toBe(1000);
  expect(restored.branchLocation).toBe("區域-500");
  expect(restored.branchParent).toBe(seeded.refs.chapterId);
  expect(restored.rootAfterCount).toBe(2000);
  expect(restored.rootAfterLocation).toBe("區域-1000");
  expect(restored.branchAfterCount).toBe(1000);
  expect(restored.branchAfterLocation).toBe("區域-500");
  expect(restored.branchKey).toBe("");
});
