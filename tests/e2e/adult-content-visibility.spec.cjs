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
    window.BAOExploreDiscovery &&
    document.getElementById("bao-me-nav")
  );

  await page.evaluate(() => App.showView("explore"));
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toHaveCount(0);
  await page.locator('[data-explore-filter-open]').click();
  await expect(page.locator('[data-explore-adult-controls]')).toBeHidden();
  await page.locator('[data-explore-filter-close]').click();

  await page.evaluate(() => App.showView("me"));
  const toggle = page.locator("[data-bao-adult-content-toggle]");
  await expect(toggle).not.toBeChecked();

  page.once("dialog", dialog => dialog.accept());
  await toggle.click();
  await expect(toggle).toBeChecked();

  await page.evaluate(() => App.showView("explore"));
  await page.locator('[data-explore-filter-open]').click();
  const adultControls = page.locator('[data-explore-adult-controls]');
  await expect(adultControls).toBeVisible();
  await adultControls.getByRole('button', { name: '成熟內容', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toBeVisible();

  await page.reload();
  await page.waitForFunction(() => window.BAOContentPreferences && window.BAOExploreDiscovery);
  await page.evaluate(() => App.showView("explore"));
  await page.locator('[data-explore-filter-open]').click();
  await expect(page.locator('[data-explore-adult-controls]')).toBeVisible();
  await page.locator('[data-explore-filter-close]').click();

  await page.evaluate(() => App.showView("me"));
  const toggleAfterReload = page.locator("[data-bao-adult-content-toggle]");
  await expect(toggleAfterReload).toBeChecked();
  await toggleAfterReload.click();
  await expect(toggleAfterReload).not.toBeChecked();

  await page.evaluate(() => App.showView("explore"));
  await expect(page.locator('#character-list [data-character-id="desire-district"]')).toHaveCount(0);
  await page.locator('[data-explore-filter-open]').click();
  await expect(page.locator('[data-explore-adult-controls]')).toBeHidden();
});
