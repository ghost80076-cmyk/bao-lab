const { test, expect } = require("@playwright/test");

const openModelStep = async page => {
  await page.goto("/");
  await expect(page.locator('#home-view .brand-hero h1')).toBeVisible();
  await page.locator('#home-view [data-view="explore"]').click();
  const card = page.locator("article").filter({ hasText: "林沉風 - 見過黑暗的人" });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByRole("button", { name: "開始故事" }).click();
  await page.locator('#bao-setup-choice [data-bao-setup="advanced"]').click();
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

  test("mobile story defaults to a player-first surface with tools on demand", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDemoStory(page);
    await page.waitForFunction(() => Boolean(window.BAOStorySurface));

    await expect(page.locator("#chat-view")).toHaveAttribute("data-bao-surface", "play");
    await expect(page.locator(".story-mobile-tools")).toBeHidden();
    await expect(page.locator("#bao-mobile-tools-tab")).toBeVisible();
    await expect(page.locator("#bao-play-status-toggle")).toBeVisible();
    await expect(page.locator("#bao-surface-mode-toggle")).toBeVisible();
    await expect(page.locator("#bao-scene-meta")).toBeVisible();

    const layout = await page.evaluate(() => {
      const composer = document.querySelector("#chat-view .composer");
      const aside = document.querySelector("#chat-view .chat-layout > aside");
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        asideDisplay: getComputedStyle(aside).display,
        composerBottom: composer.getBoundingClientRect().bottom,
        height: innerHeight
      };
    });

    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.asideDisplay).toBe("none");
    expect(layout.composerBottom).toBeLessThanOrEqual(layout.height + 2);
  });

  test("desktop story defaults to Play and reveals the full tool rail only in Studio", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openDemoStory(page);
    await page.waitForFunction(() => Boolean(window.BAOStorySurface));

    await expect(page.locator("#chat-view")).toHaveAttribute("data-bao-surface", "play");
    await expect(page.locator("#chat-view .chat-layout > aside").first()).toBeHidden();
    await expect(page.locator("#chat-view .usage-bar")).toBeHidden();

    const playLayout = await page.evaluate(() => {
      const grid = document.querySelector("#chat-view .chat-layout");
      const main = grid.querySelector(".chat-main");
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        columns: getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length,
        mainWidth: Math.round(main.getBoundingClientRect().width)
      };
    });
    expect(playLayout.documentWidth).toBeLessThanOrEqual(playLayout.viewport);
    expect(playLayout.columns).toBe(1);
    expect(playLayout.mainWidth).toBeGreaterThan(700);

    await page.locator("#bao-surface-mode-toggle").click();
    await expect(page.locator("#chat-view")).toHaveAttribute("data-bao-surface", "studio");
    await expect(page.locator("#chat-view .chat-layout > aside").first()).toBeVisible();
    await expect(page.locator("#chat-view .usage-bar")).toBeVisible();
    await expect(page.locator("#bao-chat-api-toolbar")).toBeVisible();
  });
});
