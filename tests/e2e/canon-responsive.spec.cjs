const { test, expect } = require("@playwright/test");

const openDemoCanon = async page => {
  await page.goto("/");
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
  await expect(page.getByRole("button", { name: "🧠 記憶工作台" })).toBeVisible();
  await page.getByRole("button", { name: "🧠 記憶工作台" }).click();
  await page.getByRole("button", { name: /Canon 資料庫/ }).click();
  await expect(page.getByRole("heading", { name: "Canon 資料庫" })).toBeVisible();
};

const seedDraft = async page => page.evaluate(() => {
  const longLine = "這是一段用來驗證長篇 Canon 編輯畫面不會破版的內容。".repeat(18);
  GameState.current.canonDraft = {
    version: 2,
    lastProcessedMessageCount: 2,
    lastProcessedMessageId: "msg-e2e-2",
    notebooks: Array.from({ length: 6 }, (_, index) => ({
      id: `canon-e2e-${index}`,
      title: `第 ${index + 1} 本 Canon：人物關係與尚未解決的長標題`,
      category: index % 2 ? "relationships" : "current",
      tier: index % 3 === 0 ? "core" : index % 3 === 1 ? "relevant" : "ui",
      certainty: index % 2 ? "mixed" : "confirmed",
      enabled: true,
      content: longLine,
      evidence: `訊息 ${index + 1} · msg-e2e-${index + 1}`
    }))
  };
  BAOMemoryWorkbench.refresh(document.querySelector(".memory-desk-backdrop"), "canon");
});

test.describe("Canon workbench responsive UI", () => {
  test("desktop keeps the summary and editor controls in three columns", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openDemoCanon(page);
    await seedDraft(page);
    const layout = await page.evaluate(() => ({
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      deskWidth: Math.round(document.querySelector(".memory-desk").getBoundingClientRect().width),
      summaryColumns: getComputedStyle(document.querySelector(".canon-summary")).gridTemplateColumns.split(" ").length,
      controlColumns: getComputedStyle(document.querySelector(".canon-book-controls")).gridTemplateColumns.split(" ").length,
      visibleBooks: [...document.querySelectorAll(".canon-book")].filter(node => node.getBoundingClientRect().height > 0).length
    }));
    expect(layout.viewport).toBe(1440);
    expect(layout.documentWidth).toBeLessThanOrEqual(1440);
    expect(layout.deskWidth).toBeGreaterThan(900);
    expect(layout.summaryColumns).toBe(3);
    expect(layout.controlColumns).toBe(3);
    expect(layout.visibleBooks).toBe(6);
  });

  test("mobile uses one-column controls without horizontal page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoCanon(page);
    await seedDraft(page);
    const layout = await page.evaluate(() => {
      const desk = document.querySelector(".memory-desk").getBoundingClientRect();
      const nav = document.querySelector(".memory-desk-nav");
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        deskLeft: Math.round(desk.left),
        deskWidth: Math.round(desk.width),
        summaryColumns: getComputedStyle(document.querySelector(".canon-summary")).gridTemplateColumns.split(" ").length,
        controlColumns: getComputedStyle(document.querySelector(".canon-book-controls")).gridTemplateColumns.split(" ").length,
        actionColumns: getComputedStyle(document.querySelector(".canon-actions")).gridTemplateColumns.split(" ").length,
        navCanScroll: nav.scrollWidth > nav.clientWidth
      };
    });
    expect(layout.viewport).toBe(390);
    expect(layout.documentWidth).toBeLessThanOrEqual(390);
    expect(layout.deskLeft).toBe(0);
    expect(layout.deskWidth).toBe(390);
    expect(layout.summaryColumns).toBe(1);
    expect(layout.controlColumns).toBe(1);
    expect(layout.actionColumns).toBe(1);
    expect(layout.navCanScroll).toBe(true);
  });

  test("no-API demo refuses Canon generation without provider traffic", async ({ page }) => {
    const providerRequests = [];
    page.on("request", request => {
      if (/openrouter\.ai|anthropic\.com|generativelanguage\.googleapis\.com|api\.openai\.com/.test(request.url())) providerRequests.push(request.url());
    });
    await openDemoCanon(page);
    await page.evaluate(() => {
      Chat.messages = Chat.ensureMessageIds([
        { role: "user", content: "測試玩家訊息" },
        { role: "assistant", content: "測試角色回覆" }
      ]);
      BAOMemoryWorkbench.refresh(document.querySelector(".memory-desk-backdrop"), "canon");
    });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: /更新近期 Canon/ }).click();
    await expect(page.locator("[data-canon-progress]")).toContainText("請先連接玩家自己的 API");
    expect(providerRequests).toEqual([]);
  });
});
