const { test, expect } = require("@playwright/test");

test("story library redirects a misplaced character card to the character importer", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean(window.BAOStoryTools));
  await expect(page.locator("#import-character-button")).toBeAttached();
  await page.evaluate(() => BAOStoryTools.openLibrary());

  let prompt = "";
  page.once("dialog", async dialog => {
    prompt = dialog.message();
    await dialog.accept();
  });
  await page.locator("[data-story-library-import-file]").setInputFiles({
    name: "creator-character.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schema_version: "1.5",
      meta: { id: "creator-character", name: "Creator Character" },
      content: { greeting: "開場", system_prompt: "角色核心" }
    }))
  });

  await expect.poll(() => prompt).toContain("這份檔案看起來是角色卡");
  await expect(page.locator("#explore-view")).toHaveClass(/active/);
  await expect(page.locator("#explore-view details.bao-gallery-more")).toHaveJSProperty("open", true);
  await expect(page.locator("#import-character-button")).toBeFocused();
  await expect(page.locator(".story-tools-backdrop")).toHaveCount(0);
});
