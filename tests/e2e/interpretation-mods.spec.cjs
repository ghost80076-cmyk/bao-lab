const { test, expect } = require("@playwright/test");

test("two-way interpretation MODs stay outside story memory and expose independent stages", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("./");
  await page.waitForFunction(() => Boolean(
    window.BAOInterpretationMods &&
    window.BAOInterpretationModsCore &&
    window.BAOInterpretationOfficialPack &&
    window.BAOStoryExtensionsCenter &&
    App.characters?.length
  ));

  await page.evaluate(() => {
    App.activeCharacter = { ...App.characters[0], id: "interpretation-mod-test", name: "雙向解讀測試" };
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
    Chat.add("assistant", "她把書闔上，看了過來。");
    Chat.add("assistant", "她停頓了一下，才輕聲回答。");
    App.renderChatShell(false);
    App.showView("chat");
  });

  let summary = await page.evaluate(() => BAOInterpretationMods.summary());
  expect(summary.availableCount).toBe(2);
  expect(summary.enabledCount).toBe(0);
  expect(summary.items.map(item => [item.id, item.stage])).toEqual([
    ["bun-interpreter", "pre_response_advisor"],
    ["class-monitor", "post_response_observer"]
  ]);

  const card = await page.evaluate(() =>
    BAOStoryExtensionsCenter.snapshot().cards.find(item => item.id === "interpretation")
  );
  expect(card).toBeTruthy();
  expect(card.title).toBe("雙向解讀未啟用");
  expect(card.scopes).toContain("生成前顧問");
  expect(card.scopes).toContain("生成後觀察");

  await page.evaluate(() => BAOStoryExtensionsCenter.open({ expandCard: "interpretation" }));
  const extensions = page.getByRole("dialog", { name: "故事擴充" });
  const interpretationCard = extensions.locator('[data-extension-card="interpretation"]');
  await expect(interpretationCard).toBeVisible();
  await expect(interpretationCard).toContainText("肉包");
  await expect(interpretationCard).toContainText("班長");
  await interpretationCard.getByRole("button", { name: /管理/ }).click();

  const manager = page.getByRole("dialog", { name: "雙向解讀 MOD" });
  await expect(manager).toBeVisible();
  await expect(manager).toContainText("生成前顧問");
  await expect(manager).toContainText("生成後觀察");
  await expect(manager).toContainText("不是讀心");
  await expect(manager).toContainText("不會增加模型請求");

  await manager.locator('[data-interpretation-mod="bun-interpreter"]').check();
  await expect(manager.locator("[data-interpretation-cost]")).toContainText("最多增加 1 次");
  await manager.locator('[data-interpretation-mod="class-monitor"]').check();
  await expect(manager.locator("[data-interpretation-cost]")).toContainText("最多增加 2 次");
  await manager.locator("[data-interpretation-detail]").selectOption("detailed");
  await manager.locator("[data-interpretation-tone]").selectOption("banter");
  await manager.getByRole("button", { name: "完成" }).click();

  let state = await page.evaluate(() => GameState.current.interpretationMods);
  expect(state.enabled.sort()).toEqual(["bun-interpreter", "class-monitor"]);
  expect(state.detailMode).toBe("detailed");
  expect(state.monitorTone).toBe("banter");

  await page.evaluate(() => {
    const messages = Chat.messages.filter(item => item.role === "assistant");
    GameState.current.interpretationMods = BAOInterpretationModsCore.addOutput(
      GameState.current.interpretationMods,
      {
        messageId: messages[0].id,
        advisor: "玩家可能是在試探性邀約；目前不足以斷定浪漫意圖。",
        observer: "她把書闔上並看過來，表示注意力轉向玩家；單靠這點不能判斷好感。",
        playerMessageId: "fake-user"
      }
    );
    BAOInterpretationMods.renderAll();
  });

  await expect(page.locator(".bao-interpretation-mod-block")).toHaveCount(2);
  await expect(page.locator(".bao-interpretation-advisor")).toContainText("不足以斷定");
  await expect(page.locator(".bao-interpretation-observer")).toContainText("不能判斷好感");

  const integrity = await page.evaluate(() => ({
    messages: Chat.messages.map(item => item.content),
    leakedAdvisor: Chat.messages.some(item => String(item.content).includes("試探性邀約")),
    leakedObserver: Chat.messages.some(item => String(item.content).includes("不能判斷好感"))
  }));
  expect(integrity.leakedAdvisor).toBe(false);
  expect(integrity.leakedObserver).toBe(false);
  expect(integrity.messages).toContain("她把書闔上，看了過來。");

  await page.evaluate(() => {
    GameState.current.interpretationMods.showAdvisor = false;
    BAOInterpretationMods.renderAll();
  });
  await expect(page.locator(".bao-interpretation-advisor")).toHaveCount(0);
  await expect(page.locator(".bao-interpretation-observer")).toHaveCount(1);

  await page.evaluate(() => BAOInterpretationMods.handleCommand("【關閉雙系統】"));
  summary = await page.evaluate(() => BAOInterpretationMods.summary());
  expect(summary.enabledCount).toBe(0);
  expect(summary.requestCount).toBe(0);
});
