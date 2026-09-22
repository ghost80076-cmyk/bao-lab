const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
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
};

const seedNestedBranches = async page => page.evaluate(async () => {
  Chat.messages = Chat.ensureMessageIds([
    { role: "user", content: "第一輪玩家" },
    { role: "assistant", content: "第一輪角色" }
  ]);
  Chat.summary = "主線起點摘要";
  GameState.current.time = "深夜";
  GameState.current.location = "舊城";
  GameState.current.contextPack = { id: "main-base-pack", summary: "主線起點" };
  App.renderChatShell(false);
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const firstAssistantId = Chat.messages[1].id;

  Chat.add("user", "沿主線前進");
  Chat.add("assistant", "主線抵達城門");
  Chat.summary = "主線摘要";
  GameState.current.time = "清晨";
  GameState.current.location = "城門";
  GameState.current.contextPack = { id: "main-pack", summary: "主線目前進度" };
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const mainRefs = BAOStoryLibrary.refs();

  const branchSave = await BAOStoryLibrary.createBranch(firstAssistantId, "秘密線");
  Storage.restoreStory(branchSave);
  Chat.summary = "秘密線摘要";
  GameState.current.time = "凌晨";
  GameState.current.location = "碼頭";
  GameState.current.contextPack = { id: "secret-pack", summary: "秘密線目前進度" };
  Chat.add("user", "只走秘密線");
  Chat.add("assistant", "秘密線抵達碼頭");
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const branchRefs = BAOStoryLibrary.refs();
  const branchAssistantId = Chat.messages.at(-1).id;

  const childSave = await BAOStoryLibrary.createBranch(branchAssistantId, "地下線");
  Storage.restoreStory(childSave);
  Chat.summary = "地下線摘要";
  GameState.current.time = "凌晨兩點";
  GameState.current.location = "地下室";
  GameState.current.contextPack = { id: "underground-pack", summary: "地下線目前進度" };
  Chat.add("user", "繼續深入地下");
  Chat.add("assistant", "地下線打開暗門");
  App.renderChatShell(false);
  App.saveStory(false);
  await BAOStoryLibrary.flush();
  const childRefs = BAOStoryLibrary.refs();

  return { mainRefs, branchRefs, childRefs };
});

const snapshot = page => page.evaluate(() => ({
  location: GameState.current.location,
  time: GameState.current.time,
  summary: Chat.summary,
  contextPackId: GameState.current.contextPack?.id || "",
  messages: Chat.messages.map(message => message.content),
  refs: BAOStoryLibrary.refs()
}));

test.describe("Story branch tree", () => {
  test("nested branches show lineage and restore isolated memory and world state", async ({ page }) => {
    await openDemoStory(page);
    const ids = await seedNestedBranches(page);

    await page.locator("#story-branch-button").click();
    await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();
    await expect(page.locator(".story-branch-current-path")).toContainText("第一章");
    await expect(page.locator(".story-branch-current-path")).toContainText("秘密線");
    await expect(page.locator(".story-branch-current-path")).toContainText("地下線");
    await expect(page.locator(".story-branch-node")).toHaveCount(3);
    await expect(page.locator('.story-branch-node[data-depth="0"]')).toHaveCount(1);
    await expect(page.locator('.story-branch-node[data-depth="1"]')).toHaveCount(1);
    await expect(page.locator('.story-branch-node[data-depth="2"]')).toHaveCount(1);

    const mainRow = page.locator(`[data-chapter="${ids.mainRefs.chapterId}"]`);
    const secretRow = page.locator(`[data-chapter="${ids.branchRefs.chapterId}"]`);
    const childRow = page.locator(`[data-chapter="${ids.childRefs.chapterId}"]`);
    await expect(secretRow).toContainText("從「第一章」分出");
    await expect(childRow).toContainText("從「秘密線」分出");
    await expect(childRow).toHaveAttribute("aria-current", "true");

    await mainRow.getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("城門");
    expect(await snapshot(page)).toMatchObject({
      location: "城門",
      time: "清晨",
      summary: "主線摘要",
      contextPackId: "main-pack",
      refs: { chapterId: ids.mainRefs.chapterId }
    });

    await page.locator("#story-branch-button").click();
    await page.locator(`[data-chapter="${ids.branchRefs.chapterId}"]`).getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("碼頭");
    expect(await snapshot(page)).toMatchObject({
      location: "碼頭",
      time: "凌晨",
      summary: "秘密線摘要",
      contextPackId: "secret-pack",
      refs: { chapterId: ids.branchRefs.chapterId }
    });

    await page.locator("#story-branch-button").click();
    await page.locator(`[data-chapter="${ids.childRefs.chapterId}"]`).getByRole("button", { name: "切換" }).click();
    await expect.poll(() => page.evaluate(() => GameState.current.location)).toBe("地下室");
    expect(await snapshot(page)).toMatchObject({
      location: "地下室",
      time: "凌晨兩點",
      summary: "地下線摘要",
      contextPackId: "underground-pack",
      refs: { chapterId: ids.childRefs.chapterId }
    });
  });

  test("mobile branch tree stays readable without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoStory(page);
    await seedNestedBranches(page);
    await page.locator('[data-story-mobile-action="branches"]').click();
    await expect(page.getByRole("heading", { name: "故事分支" })).toBeVisible();

    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      pageWidth: document.documentElement.scrollWidth,
      modalWidth: Math.round(document.querySelector(".story-branches-modal").getBoundingClientRect().width),
      treeWidth: Math.round(document.querySelector(".story-branch-tree").getBoundingClientRect().width),
      deepestWidth: Math.round(document.querySelector('.story-branch-node[data-depth="2"] .story-branch-row').getBoundingClientRect().width)
    }));
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.modalWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.treeWidth).toBeGreaterThan(250);
    expect(layout.deepestWidth).toBeGreaterThan(220);
  });
});
