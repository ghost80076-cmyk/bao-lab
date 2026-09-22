const { test, expect } = require("@playwright/test");

const ROOT_URL = process.env.BAO_LIVE_URL || "/";

const openDemoStory = async page => {
  await page.goto(ROOT_URL);
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
  await page.waitForFunction(() => Boolean(window.BAOStoryTools && window.BAOContextPackResume));
};

test("Context Pack AI draft source survives a full page reload", async ({ page }) => {
  await openDemoStory(page);

  await page.evaluate(() => {
    Chat.messages = Chat.ensureMessageIds([
      { role: "user", content: "第一輪：走進舊城。" },
      { role: "assistant", content: "第一輪：角色看向玩家。" },
      { role: "user", content: "第二輪：詢問鐘樓。" },
      { role: "assistant", content: "第二輪：角色指出北方。" },
      { role: "user", content: "第三輪：答應稍後前往。" },
      { role: "assistant", content: "第三輪：角色記住這個約定。" }
    ]);
    App.saveStory(false);
  });

  await page.locator("[data-bao-open='story-tools']").click();
  await expect(page.getByRole("heading", { name: "故事管理" })).toBeVisible();
  await page.locator("[data-create]").click();
  await expect(page.getByRole("heading", { name: "劇情摘要包（Context Pack）編輯與確認" })).toBeVisible();

  await expect.poll(() => page.evaluate(() => Boolean(GameState.current?.contextPackDraftResume?.source?.fingerprint))).toBe(true);
  const beforeReload = await page.evaluate(() => ({
    kind: GameState.current.contextPackDraftResume.source.kind,
    count: GameState.current.contextPackDraftResume.source.messageCount,
    hasEmbeddedMessages: Array.isArray(GameState.current.contextPackDraftResume.source.messages),
    saved: Boolean(Storage.loadStory()?.state?.contextPackDraftResume)
  }));
  expect(beforeReload).toEqual({ kind: "current-story", count: 6, hasEmbeddedMessages: false, saved: true });

  await page.reload();
  await page.waitForFunction(async () => {
    await Storage.ready();
    return Boolean(window.BAOStoryTools && window.BAOContextPackResume && Storage.loadStory());
  });
  await page.evaluate(() => {
    const saved = Storage.loadStory();
    if (!Storage.restoreStory(saved)) throw new Error("failed to restore story");
    App.renderChatShell(false);
    App.showView("chat");
  });
  await expect(page.locator("#user-input")).toBeVisible();
  await page.waitForFunction(() => Boolean(document.querySelector("[data-bao-open='story-tools']")));

  await page.locator("[data-bao-open='story-tools']").click();
  await page.locator("[data-edit-draft]").click();
  const aiButton = page.locator("[data-ai]");
  await expect(aiButton).toBeVisible();
  await expect(aiButton).toBeEnabled();
  await expect(page.locator("[data-organize-status]")).toContainText("關閉頁面");

  const restored = await page.evaluate(() => ({
    sourceCount: BAOContextPackResume.resolveSource(GameState.current.contextPackDraftResume.source)?.length || 0,
    summary: GameState.current.contextPackDraft.summary,
    resumeState: JSON.stringify(GameState.current.contextPackDraftResume)
  }));
  expect(restored.sourceCount).toBe(6);
  expect(restored.resumeState).not.toContain("E2E-SECRET-MUST-NOT-LEAK");
});
