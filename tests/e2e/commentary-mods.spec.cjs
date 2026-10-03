const { test, expect } = require("@playwright/test");

test("adult commentary MODs stay opt-in and outside story messages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.waitForFunction(() => Boolean(
    window.BAOContentPreferences &&
    window.BAOCommentaryMods &&
    window.BAOCommentaryModsCore &&
    window.BAOStoryExtensionsCenter &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], id: "commentary-mod-test", name: "場外人格測試" };
    App.config = {
      persona: { name: "玩家" },
      narrativeMode: "immersive",
      displayMode: "text",
      demoMode: true,
      api: {},
      memory: { maxRounds: 20, maxContext: 32000, mode: "smart", cache: true }
    };
    GameState.create(App.activeCharacter, App.config);
    Chat.reset();
    Chat.add("assistant", "這是只屬於故事正文的測試內容。");
    App.renderChatShell(false);
    App.showView("chat");
  });

  expect(await page.evaluate(() => BAOCommentaryMods.summary())).toBeNull();
  expect(await page.evaluate(() => BAOStoryExtensionsCenter.snapshot().cards.some(card => card.id === "commentary"))).toBe(false);
  await expect(page.getByText("淫魔班長", { exact: false })).toHaveCount(0);

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(true, { confirmAge: false }));
  await page.waitForFunction(() => Boolean(window.BAOAdultCommentaryPack?.mods?.length));

  const summary = await page.evaluate(() => BAOCommentaryMods.summary());
  expect(summary.availableCount).toBe(2);
  expect(summary.enabledCount).toBe(0);

  await page.evaluate(() => BAOStoryExtensionsCenter.open({ expandCard: "commentary" }));
  const extensions = page.getByRole("dialog", { name: "故事擴充" });
  const commentaryCard = extensions.locator('[data-extension-card="commentary"]');
  await expect(commentaryCard).toBeVisible();
  await expect(commentaryCard).toContainText("場外人格未啟用");
  await commentaryCard.getByRole("button", { name: /管理/ }).click();

  const manager = page.getByRole("dialog", { name: "場外人格 MOD" });
  await expect(manager).toBeVisible();
  await expect(manager).toContainText("淫魔班長");
  await expect(manager).toContainText("魅魔肉包");
  await expect(manager).toContainText(/額外模型請求|Token/);

  await manager.locator('[data-commentary-mod="yinmo-monitor"]').check();
  await manager.locator('[data-commentary-mod="succubus-bun"]').check();
  await expect(manager.locator("[data-commentary-twins]")).toBeVisible();

  let state = await page.evaluate(() => GameState.current.commentaryMods);
  expect(state.enabled.sort()).toEqual(["succubus-bun", "yinmo-monitor"]);

  await page.evaluate(() => {
    const message = Chat.messages.find(item => item.role === "assistant");
    GameState.current.commentaryMods = BAOCommentaryModsCore.addOutput(
      GameState.current.commentaryMods,
      {
        messageId: message.id,
        content: "這是場外評論，不應寫回正文。",
        modIds: ["yinmo-monitor", "succubus-bun"]
      }
    );
    BAOCommentaryMods.renderAll();
  });

  const block = page.locator(".bao-commentary-mod-block");
  await expect(block).toBeVisible();
  await expect(block).toContainText("場外人格");
  const integrity = await page.evaluate(() => ({
    messages: Chat.messages.map(item => item.content),
    hasCommentaryInChat: Chat.messages.some(item => String(item.content).includes("這是場外評論"))
  }));
  expect(integrity.hasCommentaryInChat).toBe(false);
  expect(integrity.messages).toContain("這是只屬於故事正文的測試內容。");

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(false, { confirmAge: false }));
  await expect(page.locator(".bao-commentary-mod-block")).toHaveCount(0);
  expect(await page.evaluate(() => BAOCommentaryMods.summary())).toBeNull();

  state = await page.evaluate(() => GameState.current.commentaryMods);
  expect(state.enabled.sort()).toEqual(["succubus-bun", "yinmo-monitor"]);
  expect(state.outputs).toHaveLength(1);
});
