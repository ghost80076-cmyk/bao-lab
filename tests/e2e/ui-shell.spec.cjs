const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "班長。" })).toBeVisible();
  await page.getByRole("button", { name: "探索角色" }).click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "下一步" }).click();
};

const openDemoStory = async page => {
  await openModelStep(page);
  await page.locator("#bao-demo-mode").check();
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await expect(page.locator("#user-input")).toBeVisible();
};

test.describe("Unified BAO/LAB app shell", () => {
  test("mobile top navigation stays on one horizontally scrollable row without page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".topbar nav")).toBeVisible();

    const layout = await page.evaluate(() => {
      const nav = document.querySelector(".topbar nav");
      const style = getComputedStyle(nav);
      return {
        viewport: innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        navClientWidth: nav.clientWidth,
        navScrollWidth: nav.scrollWidth,
        overflowX: style.overflowX,
        childrenSingleLine: [...nav.children].every(node => getComputedStyle(node).whiteSpace === "nowrap")
      };
    });

    expect(layout.viewport).toBe(390);
    expect(layout.documentWidth).toBeLessThanOrEqual(390);
    expect(["auto", "scroll"]).toContain(layout.overflowX);
    expect(layout.navScrollWidth).toBeGreaterThanOrEqual(layout.navClientWidth);
    expect(layout.childrenSingleLine).toBe(true);
  });

  test("mobile story keeps all five tools in the thumb zone directly above the composer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoStory(page);

    const tools = page.locator(".story-mobile-tools");
    await expect(tools).toBeVisible();
    for (const label of ["快速儲存", "另存新檔", "敘事與描寫", "回覆設定", "記憶工作台"]) {
      await expect(tools.getByRole("button", { name: label })).toBeVisible();
    }

    const layout = await page.evaluate(() => {
      const toolBar = document.querySelector(".story-mobile-tools");
      const composer = document.querySelector("#chat-view .composer");
      const aside = document.querySelector("#chat-view .chat-layout > aside");
      const toolbarRect = toolBar.getBoundingClientRect();
      const composerRect = composer.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        asideDisplay: getComputedStyle(aside).display,
        toolOrder: getComputedStyle(toolBar).order,
        composerOrder: getComputedStyle(composer).order,
        toolbarBeforeComposer: toolbarRect.bottom <= composerRect.top + 2,
        toolbarScrollable: toolBar.scrollWidth >= toolBar.clientWidth
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.asideDisplay).toBe("none");
    expect(Number(layout.toolOrder)).toBeLessThan(Number(layout.composerOrder));
    expect(layout.toolbarBeforeComposer).toBe(true);
    expect(layout.toolbarScrollable).toBe(true);
  });

  test("desktop story remains a two-column reader with the character rail visible", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openDemoStory(page);

    const layout = await page.evaluate(() => {
      const grid = document.querySelector("#chat-view .chat-layout");
      const aside = grid.querySelector(":scope > aside");
      const main = grid.querySelector(".chat-main");
      const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean);
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        columns: columns.length,
        asideDisplay: getComputedStyle(aside).display,
        asideWidth: Math.round(aside.getBoundingClientRect().width),
        mainWidth: Math.round(main.getBoundingClientRect().width)
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.columns).toBe(2);
    expect(layout.asideDisplay).not.toBe("none");
    expect(layout.asideWidth).toBeGreaterThanOrEqual(190);
    expect(layout.mainWidth).toBeGreaterThan(layout.asideWidth * 2);
  });
});
