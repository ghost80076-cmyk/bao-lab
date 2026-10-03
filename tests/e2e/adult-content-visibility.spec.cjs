const { test, expect } = require("@playwright/test");
if (process.env.BAO_LIVE_URL) test.use({ baseURL: process.env.BAO_LIVE_URL });

test("adult content stays hidden until the player enables it locally", async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("yorubay:adult-visibility-test-ready") === "yes") return;
    localStorage.removeItem("yorubay:content-preferences:v1");
    localStorage.removeItem("bao-lab:adult-confirmed");
    sessionStorage.setItem("yorubay:adult-visibility-test-ready", "yes");
  });
  await page.goto("./");
  await page.waitForFunction(() =>
    window.BAOContentPreferences &&
    document.querySelector('.category-portal[data-category="r18"]') &&
    document.getElementById("bao-me-nav")
  );

  const adultPortal = page.locator('.category-portal[data-category="r18"]');
  await expect(adultPortal).toBeHidden();

  await page.evaluate(() => App.showView("me"));
  const toggle = page.locator("[data-bao-adult-content-toggle]");
  await expect(toggle).not.toBeChecked();

  page.once("dialog", dialog => dialog.accept());
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.evaluate(() => App.showView("explore"));
  await expect(adultPortal).toBeVisible();

  await page.reload();
  await page.waitForFunction(() =>
    window.BAOContentPreferences &&
    document.querySelector('.category-portal[data-category="r18"]')
  );
  await expect(page.locator('.category-portal[data-category="r18"]')).toBeVisible();

  await page.evaluate(() => App.showView("me"));
  const toggleAfterReload = page.locator("[data-bao-adult-content-toggle]");
  await expect(toggleAfterReload).toBeChecked();
  await toggleAfterReload.click();
  await expect(toggleAfterReload).not.toBeChecked();

  await page.evaluate(() => App.showView("explore"));
  await expect(page.locator('.category-portal[data-category="r18"]')).toBeHidden();
});
