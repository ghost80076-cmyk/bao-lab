const { test, expect } = require("@playwright/test");

test("general commentary demo works without R18 while adult MODs stay gated", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.removeItem("yorubay:content-preferences:v1");
  });
  await page.goto("./");
  await page.waitForFunction(() => Boolean(
    window.BAOContentPreferences &&
    window.BAOCommentaryMods &&
    window.BAOCommentaryModsCore &&
    window.BAOGeneralCommentaryPack &&
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
    Chat.add("assistant", "門沒有完全關上，他停在門邊沒有立刻離開。");
    Chat.add("assistant", "第二幕測試正文。");
    App.renderChatShell(false);
    App.showView("chat");
  });

  expect(await page.evaluate(() => Boolean(document.querySelector('script[src^="js/commentary-mods-adult-pack.js"]')))).toBe(false);

  let summary = await page.evaluate(() => BAOCommentaryMods.summary());
  expect(summary.availableCount).toBe(1);
  expect(summary.enabledCount).toBe(0);
  expect(summary.items.map(item => item.id)).toEqual(["director-commentary"]);

  const hasCommentaryCard = await page.evaluate(() =>
    BAOStoryExtensionsCenter.snapshot().cards.some(card => card.id === "commentary")
  );
  expect(hasCommentaryCard).toBe(true);

  await page.evaluate(() => BAOStoryExtensionsCenter.open({ expandCard: "commentary" }));
  let extensions = page.getByRole("dialog", { name: "故事擴充" });
  const commentaryCard = extensions.locator('[data-extension-card="commentary"]');
  await expect(commentaryCard).toBeVisible();
  await expect(commentaryCard).toContainText("場外人格未啟用");
  await expect(commentaryCard).toContainText("可插拔");
  await commentaryCard.getByRole("button", { name: /管理/ }).click();

  let manager = page.getByRole("dialog", { name: "場外人格 MOD" });
  await expect(manager).toBeVisible();
  await expect(manager).toContainText("導演旁白");
  await expect(manager).toContainText("夜灣官方示範");
  await expect(manager).not.toContainText("淫魔班長");
  await expect(manager).not.toContainText("魅魔肉包");
  await expect(manager).toContainText(/多一次模型請求|Token/);

  await manager.locator('[data-commentary-mod="director-commentary"]').check();
  await manager.getByRole("button", { name: "完成" }).click();

  let state = await page.evaluate(() => GameState.current.commentaryMods);
  expect(state.enabled).toEqual(["director-commentary"]);

  await page.evaluate(() => {
    const messages = Chat.messages.filter(item => item.role === "assistant");
    GameState.current.commentaryMods = BAOCommentaryModsCore.addOutput(
      GameState.current.commentaryMods,
      {
        messageId: messages[0].id,
        content: "🎬 如果這是影集，鏡頭會停在那扇沒有完全關上的門。",
        modIds: ["director-commentary"],
        adult: false
      }
    );
    BAOCommentaryMods.renderAll();
  });

  await expect(page.locator(".bao-commentary-mod-block")).toHaveCount(1);
  await expect(page.locator(".bao-commentary-mod-block")).toContainText("🎬");
  const integrity = await page.evaluate(() => ({
    messages: Chat.messages.map(item => item.content),
    hasCommentaryInChat: Chat.messages.some(item => String(item.content).includes("鏡頭會停在"))
  }));
  expect(integrity.hasCommentaryInChat).toBe(false);
  expect(integrity.messages).toContain("門沒有完全關上，他停在門邊沒有立刻離開。");

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(true, { confirmAge: false }));
  await page.waitForFunction(() => Boolean(window.BAOAdultCommentaryPack?.mods?.length));

  summary = await page.evaluate(() => BAOCommentaryMods.summary());
  expect(summary.availableCount).toBe(3);
  expect(summary.enabledCount).toBe(1);

  await page.evaluate(() => BAOCommentaryMods.open());
  manager = page.getByRole("dialog", { name: "場外人格 MOD" });
  await expect(manager).toContainText("導演旁白");
  await expect(manager).toContainText("淫魔班長");
  await expect(manager).toContainText("魅魔肉包");
  await manager.locator('[data-commentary-mod="yinmo-monitor"]').check();
  await manager.locator('[data-commentary-mod="succubus-bun"]').check();
  await expect(manager.locator("[data-commentary-twins]")).toBeVisible();
  await manager.getByRole("button", { name: "完成" }).click();

  await page.evaluate(() => {
    const messages = Chat.messages.filter(item => item.role === "assistant");
    GameState.current.commentaryMods = BAOCommentaryModsCore.addOutput(
      GameState.current.commentaryMods,
      {
        messageId: messages[1].id,
        content: "這是一段包含成人 MOD 的混合場外評論。",
        modIds: ["director-commentary", "yinmo-monitor", "succubus-bun"],
        adult: true
      }
    );
    BAOCommentaryMods.renderAll();
  });
  await expect(page.locator(".bao-commentary-mod-block")).toHaveCount(2);

  await page.evaluate(() => BAOContentPreferences.setAdultContentEnabled(false, { confirmAge: false }));
  await expect(page.locator(".bao-commentary-mod-block")).toHaveCount(1);
  await expect(page.locator(".bao-commentary-mod-block")).toContainText("鏡頭會停在");

  summary = await page.evaluate(() => BAOCommentaryMods.summary());
  expect(summary.availableCount).toBe(1);
  expect(summary.enabledCount).toBe(1);
  expect(summary.labels).toContain("🎬 導演旁白");

  state = await page.evaluate(() => GameState.current.commentaryMods);
  expect(state.enabled.sort()).toEqual(["director-commentary", "succubus-bun", "yinmo-monitor"]);
  expect(state.outputs).toHaveLength(2);

  await page.evaluate(() => BAOCommentaryMods.open());
  manager = page.getByRole("dialog", { name: "場外人格 MOD" });
  await expect(manager).toContainText("導演旁白");
  await expect(manager).not.toContainText("淫魔班長");
  await expect(manager).not.toContainText("魅魔肉包");
});
